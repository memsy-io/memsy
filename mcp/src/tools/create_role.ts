import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { ProfileManager } from "../profiles.js";
import { formatError, jsonResult } from "./_shared.js";

export function registerCreateRole(server: McpServer, profiles: ProfileManager): void {
  server.tool(
    "memsy_create_role",
    "Create a new role in the active Memsy org. Use this during onboarding when the user names a role (e.g. 'Software Engineer') that doesn't already exist — call memsy_list_roles first to check. Returns the new role's role_id, which can then be passed to memsy_set_defaults.",
    {
      name: z
        .string()
        .min(1)
        .max(100)
        .describe("Human-readable role name, e.g. 'Software Engineer', 'DevOps Engineer'."),
      focus: z
        .string()
        .min(1)
        .max(500)
        .describe(
          "One-sentence description of what this role's memories should emphasize " +
            "(used by the extractor to shape recall). If the user doesn't provide one, " +
            "draft a plausible focus from the role name — e.g. for 'Software Engineer': " +
            "'Code design decisions, architectural tradeoffs, debugging context, and refactoring rationale.'",
        ),
    },
    async (args) => {
      try {
        const ctx = profiles.current();
        const orgId = await profiles.resolveOrgId();
        const role = await ctx.client.roles.create(orgId, args.name, args.focus);
        return jsonResult({
          profile: ctx.profileName,
          org_id: orgId,
          role_id: role.roleId,
          name: role.name,
          focus: role.focus,
          created_at: role.createdAt,
        });
      } catch (err) {
        return formatError("memsy_create_role", err);
      }
    },
  );
}
