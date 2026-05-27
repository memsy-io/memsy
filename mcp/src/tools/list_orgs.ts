import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ProfileManager } from "../profiles.js";
import { formatError, jsonResult } from "./_shared.js";

export function registerListOrgs(server: McpServer, profiles: ProfileManager): void {
  server.tool(
    "memsy_list_orgs",
    "List Memsy profiles available to this MCP server (one profile = one API key = one org). Shows which is currently active. Does NOT make a network call — purely local config introspection.",
    {},
    async () => {
      try {
        return jsonResult({ profiles: profiles.listProfiles() });
      } catch (err) {
        return formatError("memsy_list_orgs", err);
      }
    },
  );
}
