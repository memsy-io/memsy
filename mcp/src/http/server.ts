/**
 * Hosted (remote) Memsy MCP server — Streamable HTTP for ChatGPT.
 *
 * Separate entry point from the stdio server (../server.ts), which is left
 * completely untouched. Run with: `node dist/http/server.js` (or `npm run
 * dev:http`). Deployed behind https://mcp.memsy.io, the MCP endpoint is
 * https://mcp.memsy.io/mcp.
 *
 * Endpoints:
 *   POST /mcp                                    — MCP Streamable HTTP transport
 *   GET  /.well-known/oauth-protected-resource   — RFC 9728
 *   GET  /.well-known/oauth-authorization-server — RFC 8414
 *   GET  /authorize                              — OAuth authorize (spike stub)
 *   POST /token                                  — OAuth token + CIMD (spike stub)
 *   GET  /healthz                                — liveness
 *
 * SPIKE SCOPE: /authorize and /token are minimal stand-ins so the end-to-end
 * ChatGPT flow works without Clerk. Real Clerk login + code exchange is P1.
 */

import express, { type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SignJWT } from "jose";

import { loadHostedConfig, type HostedConfig, SCOPE_READ, SCOPE_WRITE } from "./config.js";
import {
  AuthError,
  authorizationServerMetadata,
  buildAuthChallengeMeta,
  protectedResourceMetadata,
  resolveClientMetadata,
  verifyAccessToken,
  wwwAuthenticateHeader,
} from "./auth.js";
import { buildRequestContext } from "./context.js";
import { registerHostedTools } from "./tools.js";

const cfg: HostedConfig = loadHostedConfig();

const app = express();
// express.json() must run before the MCP handler so transport.handleRequest
// receives a parsed body. ChatGPT posts application/json to /mcp.
app.use(express.json({ limit: "4mb" }));
// OAuth token requests are application/x-www-form-urlencoded (RFC 6749 §4.1.3).
// Without this, /token sees an empty body and rejects every exchange.
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Discovery metadata
// ---------------------------------------------------------------------------
app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json(protectedResourceMetadata(cfg));
});

app.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json(authorizationServerMetadata(cfg));
});

// ---------------------------------------------------------------------------
// OAuth authorize / token — SPIKE stubs (real Clerk wiring is P1)
// ---------------------------------------------------------------------------

/** In-memory authorization codes: code -> { codeChallenge, scope, actorId,
 *  orgId, resource }. Process-local and short-lived; fine for a spike, replace
 *  with Clerk + a real store in P1. */
interface PendingCode {
  codeChallenge: string;
  scope: string;
  actorId: string;
  orgId: string;
  resource: string;
  redirectUri: string;
}
const codes = new Map<string, PendingCode>();

/**
 * GET /authorize — in production this redirects to Clerk; the spike skips the
 * login UI and immediately issues a code bound to the PKCE challenge and a dev
 * identity, then 302s back to ChatGPT's redirect_uri. This is enough to
 * exercise ChatGPT's authorize→token→Bearer round trip.
 */
app.get("/authorize", async (req: Request, res: Response) => {
  const {
    redirect_uri,
    state,
    code_challenge,
    code_challenge_method,
    scope,
    resource,
  } = req.query as Record<string, string>;

  if (!redirect_uri) {
    return res.status(400).json({ error: "invalid_request", error_description: "missing redirect_uri" });
  }
  // S256 only — reject "plain" (gotcha).
  if (code_challenge_method && code_challenge_method !== "S256") {
    return res.status(400).json({ error: "invalid_request", error_description: "only S256 PKCE supported" });
  }
  if (!code_challenge) {
    return res.status(400).json({ error: "invalid_request", error_description: "missing code_challenge" });
  }
  // Echo back exactly the resource ChatGPT asked for — it must match at /token
  // and becomes the aud claim.
  const requestedResource = resource || cfg.resource;

  // SPIKE: skip Clerk; mint a code for the dev identity. P1 replaces this with
  // a redirect to cfg.loginUrl and a callback that captures the real Clerk sub.
  const code = await randomToken();
  codes.set(code, {
    codeChallenge: code_challenge,
    // Grant only the intersection of requested and supported scopes. Never
    // grant a scope we don't support (scope-mismatch gotcha).
    scope: intersectScopes(scope),
    actorId: cfg.devActorId,
    orgId: cfg.devOrgId,
    resource: requestedResource,
    redirectUri: redirect_uri,
  });

  const url = new URL(redirect_uri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);
  return res.redirect(url.toString());
});

/**
 * POST /token — authorization_code grant with PKCE + CIMD.
 * Validates the PKCE verifier against the stored challenge, accepts the URL
 * client_id (CIMD), echoes `resource` into the token `aud`, and returns a
 * Bearer access token.
 */
app.post("/token", async (req: Request, res: Response) => {
  try {
    const { grant_type, code, code_verifier, client_id, resource } = req.body as Record<string, string>;

    if (grant_type !== "authorization_code") {
      return res.status(400).json({ error: "unsupported_grant_type" });
    }
    // CIMD: client_id is a URL we fetch + validate is ChatGPT. (We don't gate
    // token issuance on it beyond validation in the spike, but this is where
    // the check lives.)
    if (client_id) await resolveClientMetadata(client_id);

    const pending = code ? codes.get(code) : undefined;
    if (!pending) {
      return res.status(400).json({ error: "invalid_grant", error_description: "unknown or expired code" });
    }
    codes.delete(code); // one-time use

    // PKCE: SHA256(code_verifier) base64url must equal the stored challenge.
    const computed = await s256(code_verifier ?? "");
    if (computed !== pending.codeChallenge) {
      return res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
    }
    // resource sent at /token must match the one bound at /authorize.
    const tokenResource = resource || pending.resource;
    if (tokenResource !== pending.resource) {
      return res.status(400).json({ error: "invalid_target", error_description: "resource mismatch" });
    }

    const accessToken = await mintAccessToken(pending);
    return res.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: 3600,
      scope: pending.scope,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return res.status(400).json({ error: err.code, error_description: err.message });
    }
    return res.status(500).json({ error: "server_error" });
  }
});

// ---------------------------------------------------------------------------
// MCP endpoint — Streamable HTTP, stateless (fresh server+transport per call)
// ---------------------------------------------------------------------------
app.post("/mcp", async (req: Request, res: Response) => {
  // 1. Extract + verify the bearer token. On failure emit a 401 with the
  //    WWW-Authenticate header so ChatGPT discovers where to authenticate.
  const token = bearerToken(req);
  if (!token) {
    return send401(res, new AuthError("invalid_token", "missing bearer token"));
  }
  let ctx;
  try {
    const identity = await verifyAccessToken(token, cfg);
    ctx = buildRequestContext(cfg, identity);
  } catch (err) {
    const authErr = err instanceof AuthError ? err : new AuthError("invalid_token", "token rejected");
    return send401(res, authErr);
  }

  // 2. Build a fresh MCP server bound to this request's context, then a
  //    stateless transport, and hand off. Stateless = no session id; each POST
  //    is independent, which is the simplest correct mode for a horizontally
  //    scaled deployment.
  const server = new McpServer(
    { name: "@memsy-io/mcp-http", version: "0.0.0-spike" },
    { capabilities: { tools: {} } },
  );
  registerHostedTools(server, ctx);

  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  // Clean up when the response closes so we don't leak servers/transports.
  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    // If a tool threw an AuthError (e.g. insufficient_scope), surface the
    // challenge so ChatGPT can re-auth with the right scopes.
    if (!res.headersSent && err instanceof AuthError) {
      return send401(res, err);
    }
    if (!res.headersSent) {
      res.status(500).json({ error: "server_error" });
    }
  }
});

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

app.listen(cfg.port, () => {
  process.stdout.write(
    `[memsy-mcp-http] listening on :${cfg.port} ` +
      `public_url=${cfg.publicUrl} resource=${cfg.resource} ` +
      `dev_skip_auth=${cfg.devSkipAuth}\n`,
  );
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function bearerToken(req: Request): string | null {
  const h = req.header("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1] : null;
}

function send401(res: Response, err: AuthError): Response {
  res.setHeader("WWW-Authenticate", wwwAuthenticateHeader(cfg, err));
  // Body carries the same challenge under _meta so ChatGPT picks it up there
  // too — the third leg of the "show login" trifecta.
  return res.status(401).json({
    jsonrpc: "2.0",
    error: { code: -32001, message: err.message },
    _meta: buildAuthChallengeMeta(cfg, err),
  });
}

function intersectScopes(requested: string | undefined): string {
  const want = (requested ?? "").split(/\s+/).filter(Boolean);
  const supported = new Set([SCOPE_READ, SCOPE_WRITE]);
  const granted = want.filter((s) => supported.has(s));
  // Default to both if ChatGPT didn't narrow — we only ever support these two.
  return (granted.length ? granted : [SCOPE_READ, SCOPE_WRITE]).join(" ");
}

async function mintAccessToken(pending: PendingCode): Promise<string> {
  if (!cfg.jwtSecret) {
    throw new Error("MCP_JWT_SECRET required to mint tokens in the spike /token endpoint");
  }
  const secret = new TextEncoder().encode(cfg.jwtSecret);
  return new SignJWT({ scope: pending.scope, org_id: pending.orgId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(pending.actorId)
    .setIssuer(cfg.issuer)
    // aud == the resource ChatGPT bound — verified on every /mcp call.
    .setAudience(pending.resource)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret);
}

/** base64url(SHA-256(input)) — the S256 PKCE transform. */
async function s256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Buffer.from(digest).toString("base64url");
}

async function randomToken(): Promise<string> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}
