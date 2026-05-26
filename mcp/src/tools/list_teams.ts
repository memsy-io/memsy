import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ProfileManager } from "../profiles.js";
import { formatError, jsonResult } from "./_shared.js";

export function registerListTeams(server: McpServer, profiles: ProfileManager): void {
  server.tool(
    "memsy_list_teams",
    "List all teams defined in the active Memsy org. Use this during onboarding so the user can pick which team(s) to set as defaults via memsy_set_defaults.",
    {
      limit: z.number().int().min(1).max(200).default(100),
      offset: z.number().int().min(0).default(0),
    },
    async (args) => {
      try {
        const ctx = profiles.current();
        const orgId = await profiles.resolveOrgId();
        const teams = await ctx.client.teams.list(orgId, {
          limit: args.limit,
          offset: args.offset,
        });
        return jsonResult({
          profile: ctx.profileName,
          org_id: orgId,
          count: teams.length,
          teams: teams.map((t) => ({
            team_id: t.teamId,
            name: t.name,
            focus: t.focus,
          })),
        });
      } catch (err) {
        return formatError("memsy_list_teams", err);
      }
    },
  );
}
