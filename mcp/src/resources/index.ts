import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ProfileManager } from "../profiles.js";

const RECENT_DEFAULT_LIMIT = 20;
const RECENT_MAX_LIMIT = 100;

export function registerAllResources(server: McpServer, profiles: ProfileManager): void {
  server.resource(
    "memsy-actor-current",
    "memsy://actor/current",
    {
      description:
        "The currently resolved actor identity (actor_id + source) for the active profile.",
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
                actor_id: ctx.identity.actorId,
                actor_id_source: ctx.identity.source,
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
