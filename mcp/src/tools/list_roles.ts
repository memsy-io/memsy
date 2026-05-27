import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ProfileManager } from "../profiles.js";
import { formatError, jsonResult } from "./_shared.js";

export function registerListRoles(server: McpServer, profiles: ProfileManager): void {
  server.tool(
    "memsy_list_roles",
    "List all roles defined in the active Memsy org. Use this during onboarding so the user can pick which role(s) to set as defaults via memsy_set_defaults.",
    {
      limit: z.number().int().min(1).max(200).default(100),
      offset: z.number().int().min(0).default(0),
    },
    async (args) => {
      try {
        const ctx = profiles.current();
        const orgId = await profiles.resolveOrgId();
        const roles = await ctx.client.roles.list(orgId, {
          limit: args.limit,
          offset: args.offset,
        });
        return jsonResult({
          profile: ctx.profileName,
          org_id: orgId,
          count: roles.length,
          roles: roles.map((r) => ({
            role_id: r.roleId,
            name: r.name,
            focus: r.focus,
          })),
        });
      } catch (err) {
        return formatError("memsy_list_roles", err);
      }
    },
  );
}
