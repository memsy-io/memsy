import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ProfileManager } from "../profiles.js";
import { formatError, jsonResult } from "./_shared.js";

/**
 * Resolve which actor a list call should be scoped to.
 *
 * Precedence:
 *   1. An explicit, non-empty `actorId` always wins — filter to that actor.
 *   2. `allActors: true` opts into the org-wide view — no actor filter.
 *   3. Otherwise default to the active profile's actor, so a bare
 *      `memsy_list_memories` returns only the caller's own memories rather
 *      than every actor in the org.
 *
 * Returns the actor_id to filter by, or `undefined` for "every actor".
 */
export function resolveListActorScope(opts: {
  actorId?: string;
  allActors?: boolean;
  activeActorId?: string;
}): string | undefined {
  if (opts.actorId && opts.actorId.trim()) return opts.actorId;
  if (opts.allActors) return undefined;
  return opts.activeActorId;
}

export function registerListMemories(server: McpServer, profiles: ProfileManager): void {
  server.tool(
    "memsy_list_memories",
    "List extracted memories from the Memsy console (admin/management view). Distinct from memsy_search: this is a flat paginated listing, not semantic ranking. Defaults to the ACTIVE actor only — pass all_actors:true for an org-wide view across every actor, or actor_id to filter to a specific actor. Use for browsing, dashboards, or audits.",
    {
      actor_id: z
        .string()
        .optional()
        .describe(
          "Filter to a specific actor. Omit to use the active actor (the default); set all_actors:true for every actor.",
        ),
      all_actors: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "List across every actor (org-wide) instead of just the active one. Ignored when actor_id is set.",
        ),
      kind: z.string().optional().describe('Memory kind (e.g. "fact", "decision", "preference").'),
      type: z.string().optional().describe("Memory type taxonomy from memsy-core."),
      status: z.string().optional().describe('e.g. "active" or "archived".'),
      sort: z
        .string()
        .optional()
        .default("observed_at_desc")
        .describe('Sort key. Default "observed_at_desc".'),
      search: z.string().optional().describe("Free-text substring filter."),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    },
    async (args) => {
      try {
        const ctx = profiles.current();
        const actorId = resolveListActorScope({
          actorId: args.actor_id,
          allActors: args.all_actors,
          activeActorId: ctx.identity.actorId,
        });
        const res = await ctx.client.memories.list({
          actorId,
          kind: args.kind,
          type: args.type,
          status: args.status,
          sort: args.sort,
          search: args.search,
          limit: args.limit,
          offset: args.offset,
        });
        return jsonResult({
          profile: ctx.profileName,
          // Tell the caller what scope was applied so a UI can label it
          // ("memories for <actor>" vs "all actors") without guessing.
          actor_scope: actorId ?? "all-actors",
          total: res.total,
          limit: res.limit,
          offset: res.offset,
          count: res.items.length,
          items: res.items.map((m) => ({
            memory_id: m.memoryId,
            text: m.text,
            kind: m.memoryKind || m.kind,
            type: m.type,
            status: m.status,
            scope: m.scope,
            confidence: m.confidence,
            strength: m.strength,
            recall_count: m.recallCount,
            pinned: m.pinned,
            tags: m.tags,
            observed_at: m.observedAt,
            created_at: m.createdAt,
            updated_at: m.updatedAt,
          })),
        });
      } catch (err) {
        return formatError("memsy_list_memories", err);
      }
    },
  );
}
