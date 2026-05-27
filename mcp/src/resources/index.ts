import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { Identity } from "../identity.js";
import type { ProfileManager } from "../profiles.js";

const RECENT_DEFAULT_LIMIT = 20;
const RECENT_MAX_LIMIT = 100;

/**
 * Whether the resolved actor_id is "pinned" — i.e. any explicit source
 * (env var, profile config, per-call tool arg) is in effect. The opposite
 * is `derived-git` / `derived-os`, the auto-fallback. Source-based rather
 * than Boolean(profile.actorId) so an env-set identity (where profile.actorId
 * is undefined post-#2-fix) is still correctly reported as pinned.
 */
export function isActorIdPinned(source: Identity["source"]): boolean {
  return source === "env" || source === "profile" || source === "tool-arg";
}

/**
 * Decide whether `memsy://actor/current` should emit a `setup_hint`.
 * The hint fires only when the actor_id was auto-derived (git or OS) AND
 * the active profile has not pinned an explicit override. A profile-pinned
 * value (source=profile) is the user's explicit choice; env-shadowing has
 * its own warning emitted by memsy_set_defaults.
 */
export function computeSetupHint(
  source: Identity["source"],
  profileActorId: string | undefined,
): string | null {
  const isDerived = source === "derived-git" || source === "derived-os";
  const isPinned = Boolean(profileActorId);
  if (!isDerived || isPinned) return null;
  return (
    "Your actor_id is auto-derived from git/OS and not pinned to this profile. " +
    "To tag future memories with a stable identifier (e.g. 'claude-code', 'cursor', " +
    "'coder-agent', or a personal handle), ask the user 'tag my memories as <name> from " +
    'now on\' and call memsy_set_defaults { actor_id: "<name>", persist: "global" }. ' +
    "Search remains org-wide so existing memories stay findable regardless of what's chosen."
  );
}

export function registerAllResources(server: McpServer, profiles: ProfileManager): void {
  server.resource(
    "memsy-actor-current",
    "memsy://actor/current",
    {
      description:
        "The currently resolved actor identity (actor_id + source) for the active profile. " +
        "Includes a setup_hint when the identity is auto-derived and not yet pinned, so hosts " +
        "can nudge the user to run onboarding.",
      mimeType: "application/json",
    },
    async (uri) => {
      const ctx = profiles.current();
      const isPinned = isActorIdPinned(ctx.identity.source);
      const setupHint = computeSetupHint(ctx.identity.source, ctx.profile.actorId);

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                profile: ctx.profileName,
                actor_id: ctx.identity.actorId,
                actor_id_source: ctx.identity.source,
                actor_id_pinned: isPinned,
                ...(setupHint && { setup_hint: setupHint }),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.resource(
    "memsy-session-current",
    "memsy://session/current",
    {
      description: "The current MCP-process session_id. Stable for the life of the server process.",
      mimeType: "application/json",
    },
    async (uri) => {
      const ctx = profiles.current();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ session_id: ctx.identity.sessionId }, null, 2),
          },
        ],
      };
    },
  );

  server.resource(
    "memsy-profile-current",
    "memsy://profile/current",
    {
      description: "The active profile (org label, base URL). API keys are never returned.",
      mimeType: "application/json",
    },
    async (uri) => {
      const ctx = profiles.current();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(
              {
                profile: ctx.profileName,
                org_label: ctx.profile.orgLabel ?? null,
                base_url: ctx.profile.baseUrl,
                default_role_ids: ctx.profile.defaultRoleIds ?? [],
                default_team_ids: ctx.profile.defaultTeamIds ?? [],
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.resource(
    "memsy-memories-recent",
    "memsy://memories/recent",
    {
      description:
        "Most-recently observed memories for the active profile (limit configurable via ?limit= up to 100).",
      mimeType: "application/json",
    },
    async (uri) => {
      const ctx = profiles.current();
      const limitParam = uri.searchParams.get("limit");
      const parsedLimit = limitParam ? parseInt(limitParam, 10) : RECENT_DEFAULT_LIMIT;
      // Math.max(1, NaN) returns NaN — coerce non-numeric ?limit= to the default
      // rather than letting NaN propagate into the request body.
      const safeLimit = Number.isFinite(parsedLimit) ? parsedLimit : RECENT_DEFAULT_LIMIT;
      const limit = Math.min(RECENT_MAX_LIMIT, Math.max(1, safeLimit));

      // Scope to the active actor by default. Unlike memsy_search (which
      // requires an explicit query), this resource can be auto-pulled by
      // hosts at session start — defaulting to org-wide here would leak
      // cross-actor memories on shared org keys with zero user intent.
      // Pass `?actor=<id>` to scope to a specific other actor.
      const actorOverride = uri.searchParams.get("actor");
      const actorFilter = actorOverride ?? ctx.identity.actorId;

      // Wrap the network call so auth/rate-limit/connection errors surface
      // as a structured payload rather than a raw JSON-RPC protocol error.
      // Hosts that auto-pull this resource at session start can then show
      // a useful message instead of a transport blip.
      try {
        const res = await ctx.client.memories.list({
          actorId: actorFilter,
          sort: "observed_at_desc",
          limit,
          offset: 0,
        });

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  profile: ctx.profileName,
                  actor_id_filter: actorFilter,
                  count: res.items.length,
                  items: res.items.map((m) => ({
                    memory_id: m.memoryId,
                    text: m.text,
                    kind: m.memoryKind || m.kind,
                    type: m.type,
                    observed_at: m.observedAt,
                  })),
                },
                null,
                2,
              ),
            },
          ],
        };
      } catch (err) {
        const errName = err instanceof Error ? err.constructor.name : "Error";
        const message = err instanceof Error ? err.message : String(err);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "application/json",
              text: JSON.stringify(
                {
                  profile: ctx.profileName,
                  actor_id_filter: actorFilter,
                  error: errName,
                  message,
                },
                null,
                2,
              ),
            },
          ],
        };
      }
    },
  );
}
