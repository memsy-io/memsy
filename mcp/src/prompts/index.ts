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
    "Walk the user through picking their default role(s), team(s), and actor_id identity once, so subsequent memsy_search / memsy_ingest calls don't have to specify them every time.",
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
                "Walk me through picking my default Memsy role(s), team(s), and actor identity.\n\n" +
                "Steps:\n" +
                "1. Call memsy_list_roles to fetch the org's roles. If the list is empty OR " +
                "I name a role that's not in it, call memsy_create_role for each missing one " +
                "(generate a one-sentence focus from the role name if I didn't supply one). " +
                "Then show me the final role list as a numbered list of name + role_id + focus.\n" +
                "2. Ask me which role(s) I want as my defaults. Multi-select is fine.\n" +
                "3. Call memsy_list_teams. Same pattern — if empty or any name is missing, " +
                "call memsy_create_team for each missing one. Then show the numbered list.\n" +
                "4. Ask me which team(s) I want as my defaults.\n" +
                "5. Read memsy://identity/current to show me my current actor_id and how it was " +
                "derived (env / profile / derived-git / derived-os). Explain that actor_id is the " +
                "identity new memories get tagged with — search is org-wide by default so existing " +
                "memories stay findable regardless of what I pick here.\n" +
                "6. Offer me a short menu of common values and ask which (or 'keep current'):\n" +
                "   - **Agent-style** (recommended when the same person uses multiple hosts): " +
                "`claude-code`, `cursor`, `vscode`, `zed`, `cline`, `coder-agent` — lets me later " +
                "filter 'what did I save via Claude Code last week?'\n" +
                "   - **Personal handle** (recommended for single-host users): something like " +
                "`alex-dev` or my first name.\n" +
                "   - **Keep current** — leave the derived value alone (good if I've already been " +
                "using Memsy and want continuity).\n" +
                "7. Confirm all three selections (roles, teams, actor_id) back to me.\n" +
                `8. Call memsy_set_defaults with role_ids, team_ids, actor_id (omit if I chose 'keep current') and persist="${scope}".\n` +
                "9. Report success — include the file path persist wrote to. If the response has a " +
                "`warning` field about MEMSY_ACTOR_ID env shadowing the new value, surface it " +
                "verbatim so I can fix my host config.",
            },
          },
        ],
      };
    },
  );

  server.prompt(
    "proactive-mode",
    "Switch this conversation into proactive Memsy mode: Claude recalls context before answering and stores decisions after they're made, for the rest of the session.",
    {},
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text:
              "For the rest of this conversation, treat Memsy as your long-term memory. Before applying the rules, do a one-time identity check:\n\n" +
              "**Setup check (do this once, silently)** — Read `memsy://actor/current`. If the payload includes a `setup_hint` field, surface it to me as a brief one-liner ('FYI — your actor_id is unpinned, say \"tag my memories as <name>\" to pin it') and continue. Don't block on this; just nudge.\n\n" +
              "Then follow these rules:\n\n" +
              "1. **Recall before answering** — when I mention any of the following, call `memsy_search` FIRST and weave the results into your answer:\n" +
              "   - A project, component, file, person, or feature by name\n" +
              "   - A past decision or design choice ('how did we…', 'why does X…')\n" +
              "   - A technical concept this codebase or org uses\n" +
              "   - Anything I'm asking you to recall, compare, or build on\n" +
              "   **Always search org-wide** — never pass an `actor_id` filter to `memsy_search` unless I explicitly say 'just mine' or 'just memories from <actor>'. The default behavior surfaces every memory in the org, which is what I want.\n" +
              "   Cite the memories inline (memory id + a sentence summary) so I know you grounded in memory.\n\n" +
              "2. **Store after decisions** — call `memsy_ingest` with a 1-3 sentence summary AFTER any of:\n" +
              "   - An explicit decision I state or confirm ('we'll use X', 'going with Y')\n" +
              "   - A preference or constraint I state ('I prefer Z', 'never use W')\n" +
              "   - A multi-turn investigation reaching a conclusion (root cause, chosen design, agreed plan)\n" +
              "   - A fix I confirm worked\n" +
              "   Do NOT store: typos, aborted experiments, raw code, transient state ('currently debugging X').\n\n" +
              "After each `memsy_ingest`, mention briefly that you stored it so I can correct false-positive stores. " +
              "If you're uncertain whether something is worth storing, ASK ME ('worth remembering?') instead of guessing.\n\n" +
              "**Identity shortcuts** — if I say any of these, treat them as direct commands:\n" +
              "   - 'tag my memories as X' / 'tag as X from now on' → call `memsy_set_defaults { actor_id: \"X\", persist: \"global\" }`.\n" +
              "   - 'give me all memories' / 'global memories' / 'org-wide' / 'henceforth take all memories into account' → reaffirm that search is already org-wide; no config change needed, just keep omitting `actor_id` on every `memsy_search`.\n" +
              "   - 'only my memories' / 'just mine' → start passing `actor_id` from `memsy://actor/current` on subsequent searches until I say otherwise.",
          },
        },
      ],
    }),
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
