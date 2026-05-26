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
    "setup-defaults",
    "Walk the user through picking their default role(s) and team(s) once, so subsequent memsy_search / memsy_ingest calls don't have to specify them every time.",
    {
      persist_scope: z
        .enum(["none", "global", "project"])
        .optional()
        .describe(
          "Where to save the chosen defaults. Defaults to 'global' if omitted. " +
            "'global' = ~/.memsy/config.json (every project); " +
            "'project' = ./.memsy/config.json (this project only, overrides global); " +
            "'none' = in-memory only for this session.",
        ),
    },
    (args) => {
      const scope = args.persist_scope ?? "global";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text:
                "Walk me through picking my default Memsy role(s) and team(s).\n\n" +
                "Steps:\n" +
                "1. Call memsy_list_roles to fetch the org's roles. If the list is empty OR " +
                "I name a role that's not in it, call memsy_create_role for each missing one " +
                "(generate a one-sentence focus from the role name if I didn't supply one). " +
                "Then show me the final role list as a numbered list of name + role_id + focus.\n" +
                "2. Ask me which role(s) I want as my defaults. Multi-select is fine.\n" +
                "3. Call memsy_list_teams. Same pattern — if empty or any name is missing, " +
                "call memsy_create_team for each missing one. Then show the numbered list.\n" +
                "4. Ask me which team(s) I want as my defaults.\n" +
                "5. Confirm the selections back to me.\n" +
                `6. Call memsy_set_defaults with the chosen role_ids and team_ids and persist="${scope}".\n` +
                "7. Report success — include the file path persist wrote to so I can find it later.",
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
