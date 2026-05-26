import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ProfileManager } from "../profiles.js";
import { formatError, jsonResult } from "./_shared.js";

export function registerCreateTeam(server: McpServer, profiles: ProfileManager): void {
  server.tool(
    "memsy_create_team",
    "Create a new team in the active Memsy org. Use this during onboarding when the user names a team (e.g. 'Platform', 'Growth') that doesn't already exist — call memsy_list_teams first to check. Returns the new team's team_id, which can then be passed to memsy_set_defaults.",
    {
      name: z
        .string()
        .min(1)
        .max(100)
        .describe("Human-readable team name, e.g. 'Platform', 'Growth', 'Data'."),
      focus: z
        .string()
        .min(1)
        .max(500)
        .describe(
          "One-sentence description of what this team's memories should emphasize " +
            "(used by the extractor to shape recall). If the user doesn't provide one, " +
            "draft a plausible focus from the team name — e.g. for 'Platform': " +
            "'Infrastructure decisions, reliability incidents, deployment rollouts, and cross-cutting tooling.'",
        ),
    },
    async (args) => {
      try {
        const ctx = profiles.current();
        const orgId = await profiles.resolveOrgId();
        const team = await ctx.client.teams.create(orgId, args.name, args.focus);
        return jsonResult({
          profile: ctx.profileName,
          org_id: orgId,
          team_id: team.teamId,
          name: team.name,
          focus: team.focus,
          created_at: team.createdAt,
        });
      } catch (err) {
        return formatError("memsy_create_team", err);
      }
    },
  );
}
