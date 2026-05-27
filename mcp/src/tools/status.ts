import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ProfileManager } from "../profiles.js";
import { formatError, jsonResult } from "./_shared.js";

export function registerStatus(server: McpServer, profiles: ProfileManager): void {
  server.tool(
    "memsy_status",
    "Check the processing status of events previously submitted via memsy_ingest. Useful right after an ingest to confirm extraction completed before relying on memsy_search to find the new memories.",
    {
      event_ids: z
        .array(z.string())
        .min(1)
        .max(100)
        .describe("Event IDs returned by memsy_ingest. Up to 100 per call."),
    },
    async (args) => {
      try {
        const ctx = profiles.current();
        const res = await ctx.client.status(args.event_ids);
        return jsonResult({
          completed_ids: res.completedIds,
          failed_ids: res.failedIds,
          pending_ids: res.pendingIds,
          total: res.total,
          statuses: res.statuses,
          rate_limit: res.rateLimit,
        });
      } catch (err) {
        return formatError("memsy_status", err);
      }
    },
  );
}
