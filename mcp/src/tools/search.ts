import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ProfileManager } from "../profiles.js";
import { formatError, jsonResult } from "./_shared.js";

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

        const res = await ctx.client.search(args.query, {
          actorId,
          limit: args.limit,
          threshold: args.threshold,
          includeSourceEvents: args.include_source_events,
          roleIds,
          teamIds,
        });

        return jsonResult({
          profile: ctx.profileName,
          actor_id_filter: actorId ?? "(org-wide)",
          query: args.query,
          count: res.results.length,
          results: res.results.map((r) => ({
            id: r.id,
            score: r.score,
            content: r.content,
            metadata: r.metadata,
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
