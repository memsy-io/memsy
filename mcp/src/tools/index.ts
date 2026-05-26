import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ProfileManager } from "../profiles.js";
import { registerGetMemory } from "./get_memory.js";
import { registerHealth } from "./health.js";
import { registerIngest } from "./ingest.js";
import { registerListMemories } from "./list_memories.js";
import { registerListOrgs } from "./list_orgs.js";
import { registerListRoles } from "./list_roles.js";
import { registerListTeams } from "./list_teams.js";
import { registerSearch } from "./search.js";
import { registerSetDefaults } from "./set_defaults.js";
import { registerStatus } from "./status.js";
import { registerUseOrg } from "./use_org.js";

export function registerAllTools(server: McpServer, profiles: ProfileManager): void {
  // Hot path
  registerSearch(server, profiles);
  registerIngest(server, profiles);
  registerStatus(server, profiles);
  registerHealth(server, profiles);

  // Manage (delete + update land when memsy-core ships DELETE/PATCH endpoints)
  registerListMemories(server, profiles);
  registerGetMemory(server, profiles);

  // Multi-org
  registerListOrgs(server, profiles);
  registerUseOrg(server, profiles);

  // Onboarding
  registerListRoles(server, profiles);
  registerListTeams(server, profiles);
  registerSetDefaults(server, profiles);
}
