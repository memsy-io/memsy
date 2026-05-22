import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerAllPrompts(server: McpServer): void {
  server.prompt(
    "recall-context",
    "Search Memsy for context relevant to a topic, then summarize the top results as bullet points.",
    {
      topic: z.string().describe("What to recall (e.g. 'billing migration', 'auth decisions')."),
      limit: z
        .string()
        .optional()
        .describe("How many memories to consider (default 8, max 50)."),
    },
    (args) => {
      const limit = args.limit ?? "8";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                `Use the memsy_search tool with query="${args.topic}" and limit=${limit}. ` +
                "Then summarize the top results as bullet points, grouped by theme. " +
                "Each bullet should include the memory text and a parenthetical score. " +
                "If no relevant memories are found, say so explicitly.",
            },
          },
        ],
      };
    },
  );

  server.prompt(
    "summarize-and-store",
    "Summarize the recent conversation as a single fact / decision and store it in Memsy.",
    {
      kind: z
        .string()
        .optional()
        .describe("Event kind for the new memory (default 'app_event')."),
    },
    (args) => {
      const kind = args.kind ?? "app_event";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                "Summarize the most important decision, fact, or preference from our recent " +
                "conversation in 1-3 sentences. Then call memsy_ingest with a single event " +
                `(kind="${kind}", content=<your summary>) to store it. After the tool ` +
                "returns, confirm the event_id back to me.",
            },
          },
        ],
      };
    },
  );
}
