/**
 * Hosted (remote) MCP server configuration.
 *
 * This is the config for the REMOTE Streamable-HTTP server that ChatGPT talks
 * to — NOT the stdio server (that one stays exactly as-is, configured via
 * ../config.ts and ~/.memsy/config.json). Everything here comes from env so it
 * can be deployed behind https://mcp.memsy.io without a config file on disk.
 *
 * Auth model (per the plan, step 7): the server holds ONE service credential to
 * memsy-core and forces actor_id / org_id from the validated JWT on every call.
 * No per-user msy_ keys are stored.
 */

import { randomBytes } from "node:crypto";

export interface HostedConfig {
  /** Port the HTTP server binds to. */
  port: number;
  /** Public origin of this MCP server, e.g. https://mcp.memsy.io.
   *  Used to build .well-known URLs and as the OAuth `resource` / token `aud`. */
  publicUrl: string;
  /** memsy-core hot-path base URL the MemsyClient proxies to, e.g.
   *  https://api.memsy.io/v1. */
  memsyBaseUrl: string;
  /** Service API key (msy_*) used to call memsy-core on behalf of users.
   *  actor_id / org_id are forced from the JWT — the key is never user-scoped. */
  serviceApiKey: string;

  // ---- OAuth / CIMD ----
  /** OAuth issuer (this server acts as its own authorization server). */
  issuer: string;
  /** Expected `aud` claim on incoming access tokens (== publicUrl). */
  resource: string;
  /** Scopes we advertise AND actually grant. Keep this to exactly the two we
   *  honor — the "scope mismatch" gotcha: ChatGPT requests every scope listed
   *  in scopes_supported, so any extra (e.g. OIDC `openid`) breaks consent. */
  scopesSupported: readonly string[];
  /** Where /authorize redirects the user to log in (Clerk hosted login). */
  loginUrl: string;
  /** JWKS URL for verifying RS256 access tokens (when issued by Clerk/JWT).
   *  If unset, falls back to HS256 with `jwtSecret` (spike convenience). */
  jwksUrl?: string;
  /** HS256 signing secret — spike/dev fallback when no JWKS is configured.
   *  Also used to SIGN tokens minted by the spike's /token endpoint. */
  jwtSecret?: string;

  /** DEV ONLY: when true, skip token verification and inject a fixed dev
   *  identity. Lets you exercise the transport before Clerk is wired. Never
   *  set in production. */
  devSkipAuth: boolean;
  /** Identity used when devSkipAuth is on. */
  devActorId: string;
  devOrgId: string;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const SCOPE_READ = "memory:read";
export const SCOPE_WRITE = "memory:write";

export function loadHostedConfig(): HostedConfig {
  const devSkipAuth = process.env.MCP_DEV_SKIP_AUTH === "1";
  const publicUrl = optional("MCP_PUBLIC_URL", "http://localhost:8080").replace(/\/$/, "");

  // The spike's /token endpoint must always be able to SIGN a token. dev-skip
  // mode bypasses token VERIFICATION on /mcp, but NOT minting on /token — so a
  // missing secret would make every OAuth exchange 500 the moment ChatGPT does
  // the real flow. If no secret is provided (and we're not verifying via JWKS),
  // generate an ephemeral one so the quickstart works end-to-end. Ephemeral
  // tokens don't survive a restart — fine for a spike, set MCP_JWT_SECRET for
  // stable ones.
  let jwtSecret = process.env.MCP_JWT_SECRET;
  if (!jwtSecret && !process.env.MCP_JWKS_URL) {
    jwtSecret = randomBytes(32).toString("hex");
    process.stderr.write(
      "[memsy-mcp-http] warning: no MCP_JWT_SECRET set — generated an ephemeral " +
        "signing secret so /token can mint. Set MCP_JWT_SECRET for stable tokens.\n",
    );
  }

  return {
    port: Number(optional("PORT", "8080")),
    publicUrl,
    memsyBaseUrl: optional("MEMSY_BASE_URL", "https://api.memsy.io/v1"),
    // In dev-skip mode the service key may be absent (no real proxying); fail
    // loudly otherwise so we never silently start unable to reach core.
    serviceApiKey: devSkipAuth
      ? optional("MEMSY_SERVICE_API_KEY", "")
      : required("MEMSY_SERVICE_API_KEY"),

    issuer: optional("MCP_ISSUER", publicUrl),
    resource: optional("MCP_RESOURCE", publicUrl),
    scopesSupported: [SCOPE_READ, SCOPE_WRITE],
    loginUrl: optional("MCP_LOGIN_URL", `${publicUrl}/login`),
    jwksUrl: process.env.MCP_JWKS_URL,
    jwtSecret,

    devSkipAuth,
    devActorId: optional("MCP_DEV_ACTOR_ID", "dev-actor"),
    devOrgId: optional("MCP_DEV_ORG_ID", "dev-org"),
  };
}
