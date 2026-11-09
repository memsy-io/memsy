import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MemsyAPIError } from "@memsy-io/memsy";
import { z } from "zod";

import type { ProfileManager } from "../profiles.js";
import { formatError, jsonResult } from "./_shared.js";

/**
 * Does this session's resolved actor_id already have memories in the org?
 *
 * Answered with a dedicated `get` rather than by scanning the returned page:
 * the page is subject to `limit`/`offset`/`q`, so absence from it says nothing
 * about absence from the org. A 404 here is authoritative; anything else is a
 * real failure and must not be swallowed into a misleading `false`.
 */
export async function selfHasMemories(
  client: { actors: { get(actorId: string, orgId?: string): Promise<unknown> } },
  actorId: string,
): Promise<boolean | null> {
  try {
    await client.actors.get(actorId);
    return true;
  } catch (err) {
    if (err instanceof MemsyAPIError && err.statusCode === 404) return false;
    return null; // unknown — don't claim either way
  }
}

export function registerListActors(server: McpServer, profiles: ProfileManager): void {
  server.tool(
    "memsy_list_actors",
    "List the actors that have memories in the active Memsy org, with when each actor's " +
      "first and most recent memory were created. Use this to check whether an actor_id " +
      "already exists before ingesting under a new one, to find the right actor_id for " +
      "memsy_search, or to diagnose silent recall failures — the response reports this " +
      "session's own resolved actor_id and whether it has any memories yet.",
    {
      limit: z.number().int().min(1).max(500).default(100),
      offset: z.number().int().min(0).default(0),
      sort: z
        .enum(["first_memory_desc", "first_memory_asc", "last_memory_desc", "actor_id_asc"])
        .default("first_memory_desc")
        .describe(
          "Sorting by memory count is deliberately unavailable: the server caps its scan " +
            "and under-reports counts past the cap.",
        ),
      q: z.string().optional().describe("Case-insensitive substring match on actor_id."),
    },
    async (args) => {
      try {
        const ctx = profiles.current();
        // No profiles.resolveOrgId() here, unlike list_roles / list_teams:
        // `/actors` makes org_id optional and defaults it to the org behind the
        // API key. Resolving it client-side would add a control-plane round trip
        // per call and make this tool fail whenever the control plane is
        // unreachable — including every local split-port dev stack, where the
        // `/v1` → `/api` derivation cannot reach api on its own port.
        const page = await ctx.client.actors.list(undefined, {
          limit: args.limit,
          offset: args.offset,
          sort: args.sort,
          q: args.q,
        });

        const selfFound = await selfHasMemories(ctx.client, ctx.identity.actorId);

        return jsonResult({
          profile: ctx.profileName,
          base_url: ctx.profile.baseUrl,
          // Which actor THIS session writes under, and which rung of the
          // derivation ladder produced it. When source is "derived-git" or
          // "derived-os" the id is a hash of the environment, so it can change
          // out from under the user (a per-repo git email, a lost ~/.gitconfig)
          // and quietly split one human into two actors. Pin it with
          // MEMSY_ACTOR_ID or memsy_set_defaults to stop that.
          this_session_actor: {
            actor_id: ctx.identity.actorId,
            source: ctx.identity.source,
            has_memories: selfFound,
            ...(selfFound === false && {
              note:
                "This session's actor_id has no memories in this org yet. Expected on a " +
                "first run. If it is NOT a first run, the identity ladder likely shifted — " +
                "compare against the ids below and pin MEMSY_ACTOR_ID.",
            }),
          },
          total: page.total,
          count: page.items.length,
          limit: page.limit,
          offset: page.offset,
          // Counts are under-reported once this is set, so surface it loudly
          // rather than letting a caller rank actors by a wrong number.
          truncated: page.truncated,
          ...(page.truncated && {
            truncated_note:
              "The server hit its row-scan cap. The actors listed are real, but the list " +
              "may be incomplete and every memory_count is an under-count.",
          }),
          actors: page.items.map((a) => ({
            actor_id: a.actorId,
            first_memory_at: a.firstMemoryAt,
            last_memory_at: a.lastMemoryAt,
            memory_count: a.memoryCount,
            active_memory_count: a.activeMemoryCount,
            scope_levels: a.scopeLevels,
            role_ids: a.roleIds,
            team_ids: a.teamIds,
            is_this_session: a.actorId === ctx.identity.actorId,
          })),
        });
      } catch (err) {
        return formatError("memsy_list_actors", err);
      }
    },
  );
}
