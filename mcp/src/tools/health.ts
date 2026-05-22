import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ProfileManager } from "../profiles.js";
import { formatError, jsonResult } from "./_shared.js";

export function registerHealth(server: McpServer, profiles: ProfileManager): void {
  server.tool(
    "memsy_health",
    "Check connectivity to the Memsy backend for the active profile. Returns version + component status. Safe to call without write scopes; useful for diagnostics.",
    {},
    async () => {
      try {
        const ctx = profiles.current();
        const res = await ctx.client.health();
        return jsonResult({
          profile: ctx.profileName,
          base_url: ctx.profile.baseUrl,
          status: res.status,
          version: res.version,
          billing_enabled: res.billingEnabled,
          components: res.components,
        });
      } catch (err) {
        return formatError("memsy_health", err);
      }
    },
  );
}
