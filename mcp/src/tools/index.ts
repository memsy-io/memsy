import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ProfileManager } from "../profiles.js";
import { registerGetMemory } from "./get_memory.js";
import { registerHealth } from "./health.js";
import { registerIngest } from "./ingest.js";
import { registerListMemories } from "./list_memories.js";
import { registerCreateRole } from "./create_role.js";
import { registerCreateTeam } from "./create_team.js";
import { registerListOrgs } from "./list_orgs.js";
import { registerListRoles } from "./list_roles.js";
import { registerListTeams } from "./list_teams.js";
import { registerSearch } from "./search.js";
import { registerSetDefaults } from "./set_defaults.js";
import { registerStatus } from "./status.js";
import { registerUseOrg } from "./use_org.js";

/**
 * Tool registry keyed by tool name. Lets MEMSY_DISABLED_TOOLS filter out
 * specific tools — e.g. integrations that capture turns automatically
 * (NanoClaw turn-sync) disable memsy_ingest so the agent doesn't double-write
 * or block its own response with a mid-turn ingest tool call.
 */
function toolRegistry(
  server: McpServer,
  profiles: ProfileManager,
): Record<string, () => void> {
  return {
    memsy_search: () => registerSearch(server, profiles),
    memsy_ingest: () => registerIngest(server, profiles),
    memsy_status: () => registerStatus(server, profiles),
    memsy_health: () => registerHealth(server, profiles),
    memsy_list_memories: () => registerListMemories(server, profiles),
    memsy_get_memory: () => registerGetMemory(server, profiles),
    memsy_list_orgs: () => registerListOrgs(server, profiles),
    memsy_use_org: () => registerUseOrg(server, profiles),
    memsy_list_roles: () => registerListRoles(server, profiles),
    memsy_list_teams: () => registerListTeams(server, profiles),
    memsy_create_role: () => registerCreateRole(server, profiles),
    memsy_create_team: () => registerCreateTeam(server, profiles),
    memsy_set_defaults: () => registerSetDefaults(server, profiles),
  };
}

export function registerAllTools(server: McpServer, profiles: ProfileManager): void {
  const disabled = new Set(
    (process.env.MEMSY_DISABLED_TOOLS ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

  for (const [name, register] of Object.entries(toolRegistry(server, profiles))) {
    if (disabled.has(name)) continue;
    register();
  }
}
