import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ProfileManager } from "../profiles.js";
import { formatError, jsonResult } from "./_shared.js";

export function registerListMemories(server: McpServer, profiles: ProfileManager): void {
  server.tool(
    "memsy_list_memories",
    "List extracted memories from the Memsy console (admin/management view). Distinct from memsy_search: this is a flat paginated listing, not semantic ranking. Use for browsing, dashboards, or audits.",
    {
      actor_id: z.string().optional().describe("Filter by actor."),
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
        const res = await ctx.client.memories.list({
          actorId: args.actor_id,
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
