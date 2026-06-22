/**
 * Per-request context for the hosted server.
 *
 * The stdio server has ONE process-global ProfileManager + MemsyClient. The
 * hosted server is multi-tenant: N ChatGPT users share the process, each
 * identified by their own bearer token. So instead of profiles.current() we
 * build a fresh RequestContext per request from the verified JWT identity.
 *
 * Auth model A (plan step 7): one service key reaches memsy-core; actor_id /
 * org_id are forced from the token, never chosen by the caller.
 */

import { MemsyClient } from "@memsy-io/memsy";

import type { HostedConfig } from "./config.js";
import type { VerifiedIdentity } from "./auth.js";

export interface RequestContext {
  /** memsy-core client bound to the SERVICE key (not a per-user key). */
  client: MemsyClient;
  /** Forced from the JWT `sub`. Callers cannot override this — it's what
   *  attributes every ingest and scopes every search. */
  actorId: string;
  /** Forced from the JWT `org_id`. */
  orgId: string;
  /** Granted scopes (memory:read / memory:write). */
  scopes: string[];
  /** Session id for ingest attribution. The stdio server has one per process;
   *  the hosted server is stateless, so we mint one per request. */
  sessionId: string;
}

/**
 * A single MemsyClient is safe to reuse across requests — it's just an HTTP
 * client bound to the service key and base URL, with no per-user state. We
 * cache it so we don't reallocate per call. Identity travels per-request in
 * RequestContext, NOT in the client.
 */
let _sharedClient: MemsyClient | undefined;

function sharedClient(cfg: HostedConfig): MemsyClient {
  if (!_sharedClient) {
    _sharedClient = new MemsyClient({
      baseUrl: cfg.memsyBaseUrl,
      apiKey: cfg.serviceApiKey,
    });
  }
  return _sharedClient;
}

export function buildRequestContext(
  cfg: HostedConfig,
  identity: VerifiedIdentity,
): RequestContext {
  return {
    client: sharedClient(cfg),
    actorId: identity.actorId,
    orgId: identity.orgId,
    scopes: identity.scopes,
    // crypto.randomUUID is a Node 18+ global (webcrypto).
    sessionId: crypto.randomUUID(),
  };
}

// TODO(P1): org isolation. MemsyClient.search() filters by actorId only; it has
// no org_id parameter. With a single cross-org service key, org scoping MUST be
// enforced on the memsy-core side — either provision one service key per org and
// select it here by identity.orgId, or have core read an org header/claim. Until
// then the spike is single-org-safe only. Surfaced, not solved, per the plan.
