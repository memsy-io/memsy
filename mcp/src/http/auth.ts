/**
 * OAuth + CIMD for the hosted MCP server.
 *
 * Implements the four auth surfaces ChatGPT exercises (plan, "The Auth Flow"):
 *   1. .well-known/oauth-protected-resource  — RFC 9728
 *   2. .well-known/oauth-authorization-server — RFC 8414
 *   3. CIMD: accept a URL as client_id, fetch + validate it's ChatGPT
 *   4. Bearer JWT validation on every /mcp call (iss, aud, exp, scopes)
 *
 * Plus the gotcha trifecta that makes ChatGPT actually SHOW the login screen:
 *   - .well-known metadata (here)
 *   - securitySchemes on the tool (tools.ts)
 *   - _meta["mcp/www_authenticate"] in the error (buildAuthChallenge below)
 */

import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from "jose";

import {
  type HostedConfig,
  SCOPE_READ,
  SCOPE_WRITE,
} from "./config.js";

// ---------------------------------------------------------------------------
// .well-known metadata documents
// ---------------------------------------------------------------------------

/** RFC 9728 — tells ChatGPT which authorization server protects this resource
 *  and which scopes it understands. */
export function protectedResourceMetadata(cfg: HostedConfig): Record<string, unknown> {
  return {
    resource: cfg.resource,
    authorization_servers: [cfg.issuer],
    // Exactly the two scopes we grant — see the scope-mismatch gotcha.
    scopes_supported: cfg.scopesSupported,
    bearer_methods_supported: ["header"],
    resource_documentation: "https://docs.memsy.io/docs/mcp",
  };
}

/** RFC 8414 — advertises the OAuth endpoints + that we accept public clients
 *  (token_endpoint_auth_method "none", the CIMD shape) and S256 PKCE only. */
export function authorizationServerMetadata(cfg: HostedConfig): Record<string, unknown> {
  return {
    issuer: cfg.issuer,
    authorization_endpoint: `${cfg.publicUrl}/authorize`,
    token_endpoint: `${cfg.publicUrl}/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    // S256 only — the spike rejects "plain" (gotcha: ChatGPT uses S256).
    code_challenge_methods_supported: ["S256"],
    // "none" == public client identified by URL (CIMD). No client secret.
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: cfg.scopesSupported,
    // CIMD capability flag (draft-ietf-oauth-client-id-metadata-document).
    // WITHOUT this, ChatGPT greys out the CIMD registration option with
    // "CIMD is unavailable because the server did not advertise CIMD support".
    client_id_metadata_document_supported: true,
  };
}

// ---------------------------------------------------------------------------
// CIMD — Client ID Metadata Document
// ---------------------------------------------------------------------------

/** Hosts we trust to present a URL client_id. ChatGPT serves its client
 *  metadata document from chatgpt.com (and openai.com during rollout). */
const TRUSTED_CLIENT_HOSTS = new Set(["chatgpt.com", "openai.com"]);

export interface ClientMetadata {
  client_id: string;
  redirect_uris?: string[];
  [k: string]: unknown;
}

/**
 * CIMD acceptance: client_id arrives as an https URL (e.g.
 * https://chatgpt.com/oauth/.../client.json). We fetch it, confirm it's served
 * from a trusted host, and return the metadata. No pre-registration needed —
 * this is what removes the browser-extension hop Supermemory users hit.
 */
export async function resolveClientMetadata(clientId: string): Promise<ClientMetadata> {
  let url: URL;
  try {
    url = new URL(clientId);
  } catch {
    throw new AuthError("invalid_client", `client_id is not a URL: ${clientId}`);
  }
  if (url.protocol !== "https:") {
    throw new AuthError("invalid_client", "client_id must be an https URL");
  }
  if (!TRUSTED_CLIENT_HOSTS.has(url.hostname)) {
    throw new AuthError(
      "invalid_client",
      `client_id host "${url.hostname}" is not a trusted CIMD issuer`,
    );
  }
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    throw new AuthError("invalid_client", `could not fetch client metadata (${res.status})`);
  }
  const doc = (await res.json()) as ClientMetadata;
  // The document MUST self-identify with the same URL it was fetched from,
  // otherwise a trusted host could be coerced into vouching for another id.
  if (doc.client_id !== clientId) {
    throw new AuthError("invalid_client", "client metadata client_id mismatch");
  }
  return doc;
}

// ---------------------------------------------------------------------------
// Access-token verification
// ---------------------------------------------------------------------------

export interface VerifiedIdentity {
  actorId: string;
  orgId: string;
  scopes: string[];
  raw: JWTPayload;
}

/** Cache the RemoteJWKSet across requests — building it per call would refetch
 *  the JWKS every time. Only used on the RS256/JWKS path; the HS256 spike
 *  fallback passes the secret straight to jwtVerify (see verifyAccessToken). */
let _jwks: JWTVerifyGetKey | undefined;

function jwksResolver(cfg: HostedConfig): JWTVerifyGetKey {
  if (!cfg.jwksUrl) {
    throw new Error("jwksResolver called without MCP_JWKS_URL configured");
  }
  if (!_jwks) _jwks = createRemoteJWKSet(new URL(cfg.jwksUrl));
  return _jwks;
}

/**
 * Verify a bearer access token: signature, issuer, audience (== resource),
 * expiry, and extract actor_id / org_id / scopes. Throws AuthError on any
 * failure so the caller can emit a 401 challenge.
 */
export async function verifyAccessToken(
  token: string,
  cfg: HostedConfig,
): Promise<VerifiedIdentity> {
  if (cfg.devSkipAuth) {
    return {
      actorId: cfg.devActorId,
      orgId: cfg.devOrgId,
      scopes: [SCOPE_READ, SCOPE_WRITE],
      raw: {},
    };
  }

  let payload: JWTPayload;
  try {
    const verifyOpts = {
      issuer: cfg.issuer,
      // aud MUST equal the resource ChatGPT sent in authorize+token. This is
      // how we reject tokens minted for a different resource server.
      audience: cfg.resource,
    };
    if (cfg.jwksUrl) {
      ({ payload } = await jwtVerify(token, jwksResolver(cfg), verifyOpts));
    } else {
      const secret = new TextEncoder().encode(cfg.jwtSecret);
      ({ payload } = await jwtVerify(token, secret, verifyOpts));
    }
  } catch (err) {
    throw new AuthError(
      "invalid_token",
      err instanceof Error ? err.message : "token verification failed",
    );
  }

  const actorId = typeof payload.sub === "string" ? payload.sub : "";
  const orgId = typeof payload.org_id === "string" ? payload.org_id : "";
  if (!actorId) throw new AuthError("invalid_token", "token missing sub (actor_id)");

  // Scope can be a space-delimited string (OAuth convention) or an array.
  const scopeClaim = payload.scope ?? payload.scopes;
  const scopes =
    typeof scopeClaim === "string"
      ? scopeClaim.split(/\s+/).filter(Boolean)
      : Array.isArray(scopeClaim)
        ? scopeClaim.map(String)
        : [];

  return { actorId, orgId, scopes, raw: payload };
}

export function hasScope(identity: VerifiedIdentity, scope: string): boolean {
  return identity.scopes.includes(scope);
}

// ---------------------------------------------------------------------------
// 401 challenge — the third leg of the "show me the login screen" trifecta
// ---------------------------------------------------------------------------

export class AuthError extends Error {
  constructor(
    readonly code: "invalid_token" | "invalid_client" | "insufficient_scope",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Value for the HTTP `WWW-Authenticate` header on a 401 (RFC 9728 §5.1).
 *  Points ChatGPT at our protected-resource metadata so it can discover where
 *  to authenticate. */
export function wwwAuthenticateHeader(cfg: HostedConfig, error?: AuthError): string {
  const parts = [
    `Bearer realm="${cfg.resource}"`,
    `resource_metadata="${cfg.publicUrl}/.well-known/oauth-protected-resource"`,
  ];
  if (error) {
    parts.push(`error="${error.code}"`);
    parts.push(`error_description="${error.message.replace(/"/g, "'")}"`);
  }
  return parts.join(", ");
}

/** The `_meta["mcp/www_authenticate"]` payload embedded in MCP error results.
 *  ChatGPT reads this (in addition to the HTTP header) to drive the OAuth UI. */
export function buildAuthChallengeMeta(cfg: HostedConfig, error?: AuthError): Record<string, unknown> {
  return {
    "mcp/www_authenticate": wwwAuthenticateHeader(cfg, error),
  };
}
