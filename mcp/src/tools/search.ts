import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { scopableConversationId } from "../identity.js";
import type { ProfileManager } from "../profiles.js";
import { formatError, jsonResult } from "./_shared.js";

export type SearchScope = "all" | "this_conversation" | "everything_except_this_conversation";

export interface ResolvedSearchScope {
  /** Session filter to spread into the SDK's search options. Empty for "all". */
  filter: { sessionId?: string; excludeSessionId?: string };
  /** What actually happened, echoed to the caller — may differ from what was asked. */
  applied: string;
  /**
   * When set, do NOT search — return this to the caller instead.
   *
   * Its presence is the signal; there is no companion boolean, so the two
   * cannot contradict each other.
   */
  refusal?: string;
}

/**
 * Resolve a requested scope into the session filter to send.
 *
 * Precedence:
 *   1. `all` sends no session field at all — byte-identical to a pre-scoping
 *      request, and the default.
 *   2. A narrower scope needs a real conversation id. Pass `null` when the
 *      current conversation could not be identified (the MCP's fallback id is
 *      generated and names nothing on the server).
 *   3. With no id the two narrow scopes part company, because degrading means
 *      opposite things for them:
 *
 *      - `this_conversation` asked for a SUBSET. An unscoped search is a
 *        superset, so the answer is still in the results, just with noise.
 *        Degrade, and say so in `applied`.
 *      - `everything_except_this_conversation` asked for exactly one thing to
 *        be REMOVED. An unscoped search returns precisely that thing, which
 *        inverts the only instruction given. Its whole purpose is "have we
 *        discussed this before?", so the caller would be shown what was said
 *        moments ago and conclude yes. Refuse instead.
 *
 *      There is no partial answer available: without an id we cannot exclude,
 *      and falling back to the launch-time id could exclude the conversation
 *      the user just left — removing the wrong one.
 *
 * Never returns both fields — the server rejects that pair with a 422.
 */
export function resolveSearchScope(
  scope: SearchScope,
  conversationId: string | null,
): ResolvedSearchScope {
  if (scope === "all") return { filter: {}, applied: "all" };
  if (!conversationId) {
    if (scope === "everything_except_this_conversation") {
      return {
        filter: {},
        applied: "none (search not run)",
        refusal:
          "Cannot identify the current conversation, so it cannot be excluded. " +
          "No search was run, because returning every conversation would include " +
          'the one you asked to leave out. Re-run with scope "all" for unfiltered ' +
          "results.",
      };
    }
    return {
      filter: {},
      applied: "all (requested scope unavailable: this conversation could not be identified)",
    };
  }
  if (scope === "this_conversation") {
    return { filter: { sessionId: conversationId }, applied: scope };
  }
  return { filter: { excludeSessionId: conversationId }, applied: scope };
}

export function registerSearch(server: McpServer, profiles: ProfileManager): void {
  server.tool(
    "memsy_search",
    "Search Memsy for memories relevant to a query. Returns ranked results with relevance scores and metadata. " +
      "USE PROACTIVELY — invoke this BEFORE answering when the user mentions: " +
      "(a) a project, component, person, or feature by name; " +
      "(b) a past decision or design choice ('how did we', 'why does X'); " +
      "(c) a technical concept this codebase / org uses; " +
      "(d) anything they're asking you to recall, compare, or build on. " +
      "Calling once per topic to load context is usually cheaper than answering blind and being wrong. " +
      "Cite the results inline when they inform your answer so the user knows you grounded in memory.",
    {
      query: z
        .string()
        .min(1)
        .describe("Natural-language search query. The memory engine matches semantically, so paraphrase freely."),
      actor_id: z
        .string()
        .optional()
        .describe(
          "Restrict to a single actor's memories. OMIT (default) to search org-wide across every actor — usually what you want for personal/single-user setups. Pass an actor_id only to scope down (multi-developer teams, admin tooling).",
        ),
      role_ids: z
        .array(z.string())
        .optional()
        .describe("Filter by one or more role IDs. Defaults to the active profile's default_role_ids."),
      team_ids: z
        .array(z.string())
        .optional()
        .describe("Filter by one or more team IDs. Defaults to the active profile's default_team_ids."),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(8)
        .describe("Max results. Increase for broad recall, decrease for precision. Default 8."),
      threshold: z
        .number()
        .min(0)
        .max(1)
        .default(0.0)
        .describe("Minimum relevance score (0-1). Raise to drop weak matches; 0 returns everything ranked."),
      include_source_events: z
        .boolean()
        .default(false)
        .describe("Include the raw source events that produced each memory. Useful for provenance; increases response size."),
      scope: z
        .enum(["all", "this_conversation", "everything_except_this_conversation"])
        .default("all")
        .describe(
          "Which conversations to search. 'all' (default) searches everything — every past chat AND all connector-sourced memory (Google Drive, Slack, GitHub, Notion, S3, OneDrive); use it unless you have a specific reason not to. " +
            "'this_conversation' returns only what was said in the current chat, plus general knowledge that belongs to no conversation — it EXCLUDES all connector memory and every earlier chat, so it is narrow. " +
            "'everything_except_this_conversation' is for 'have we discussed this before?' — it returns earlier chats and connector memory while leaving out what is already in front of you.",
        ),
    },
    async (args) => {
      try {
        const ctx = profiles.current();
        // Only scope by actor when the caller explicitly asks for it. The
        // default is org-wide search so memories stored via other channels
        // (dashboard, direct SDK use, prior MCP sessions with a different
        // actor_id) are findable. The derived actor_id is still used for
        // INGEST (one-way attribution) — see ingest.ts.
        const actorId = args.actor_id;
        const roleIds = args.role_ids ?? ctx.profile.defaultRoleIds;
        const teamIds = args.team_ids ?? ctx.profile.defaultTeamIds;

        // null when this conversation cannot be named with confidence — see
        // scopableConversationId(). Deliberately not derived here: the decision
        // is the safety gate for the whole feature, so it lives in one tested
        // place rather than as a ternary in a handler nothing covers.
        const conversationId = scopableConversationId();
        const {
          filter: sessionFilter,
          applied: scopeApplied,
          refusal,
        } = resolveSearchScope(args.scope, conversationId);

        if (refusal) {
          // Deliberately a normal result, not a thrown error: nothing failed,
          // we declined. `refused` is an explicit boolean because the reader is
          // a model deciding what to do next, and inferring it from prose is
          // the kind of thing that works most of the time. `count`/`results`
          // stay present so anything reading them doesn't break on a missing
          // key.
          return jsonResult({
            profile: ctx.profileName,
            query: args.query,
            scope: scopeApplied,
            requested_scope: args.scope,
            refused: true,
            message: refusal,
            count: 0,
            results: [],
          });
        }

        const res = await ctx.client.search(args.query, {
          actorId,
          limit: args.limit,
          threshold: args.threshold,
          includeSourceEvents: args.include_source_events,
          roleIds,
          teamIds,
          ...sessionFilter,
        });

        return jsonResult({
          profile: ctx.profileName,
          actor_id_filter: actorId ?? "(org-wide)",
          scope: scopeApplied,
          query: args.query,
          count: res.results.length,
          results: res.results.map((r) => ({
            id: r.id,
            score: r.score,
            content: r.content,
            metadata: r.metadata,
            // Which conversation this came from — null for general knowledge
            // that belongs to none. Without it an unscoped search returns one
            // undifferentiated list and there is no way to tell "you said this
            // a minute ago" from "you said this last week".
            session_id: r.sessionId,
            source_events: r.sourceEvents,
            // User-supplied metadata propagated from the originating events
            // (URLs, doc_ids, tags, etc.). Capped at 5 entries by the API.
            source_metadata: r.sourceMetadata,
          })),
          usage: res.usage,
          rate_limit: res.rateLimit,
        });
      } catch (err) {
        return formatError("memsy_search", err);
      }
    },
  );
}
