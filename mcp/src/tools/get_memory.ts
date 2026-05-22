import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ProfileManager } from "../profiles.js";
import { formatError, jsonResult } from "./_shared.js";

export function registerGetMemory(server: McpServer, profiles: ProfileManager): void {
  server.tool(
    "memsy_get_memory",
    "Fetch a single memory by its ID. Returns the full memory record including provenance (source event IDs, URLs) and decay metadata.",
    {
      memory_id: z.string().min(1).describe("The memory_id, as returned by memsy_list_memories or memsy_search."),
    },
    async (args) => {
      try {
        const ctx = profiles.current();
        const m = await ctx.client.memories.get(args.memory_id);
        return jsonResult({
          profile: ctx.profileName,
          memory_id: m.memoryId,
          text: m.text,
          kind: m.memoryKind || m.kind,
          type: m.type,
          status: m.status,
          scope: m.scope,
          confidence: m.confidence,
          strength: m.strength,
          recall_count: m.recallCount,
          decay_half_life_days: m.decayHalfLifeDays,
          pinned: m.pinned,
          tags: m.tags,
          entity_refs: m.entityRefs,
          source_event_ids: m.sourceEventIds,
          source_urls: m.sourceUrls,
          summary: m.summary,
          payload: m.payload,
          observed_at: m.observedAt,
          last_recalled_at: m.lastRecalledAt,
          effective_from: m.effectiveFrom,
          effective_to: m.effectiveTo,
          created_at: m.createdAt,
          updated_at: m.updatedAt,
        });
      } catch (err) {
        return formatError("memsy_get_memory", err);
      }
    },
  );
}
