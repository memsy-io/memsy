import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig, parseCliFlags } from "./config.js";
import { ProfileManager } from "./profiles.js";
import { registerAllPrompts } from "./prompts/index.js";
import { registerAllResources } from "./resources/index.js";
import { registerAllTools } from "./tools/index.js";

const VERSION = "0.1.0";
const SERVER_NAME = "@memsy-io/mcp";

async function main(): Promise<void> {
  const flags = parseCliFlags(process.argv.slice(2));
  const config = loadConfig(flags);
  const profiles = new ProfileManager(config);

  const server = new McpServer(
    { name: SERVER_NAME, version: VERSION },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {},
        logging: {},
      },
    },
  );

  registerAllTools(server, profiles);
  registerAllResources(server, profiles);
  registerAllPrompts(server);

  // Surface startup diagnostics on stderr so they show up in host logs without
  // corrupting the stdio JSON-RPC stream.
  const active = profiles.current();
  process.stderr.write(
    `[memsy-mcp ${VERSION}] active_profile=${active.profileName} ` +
      `base_url=${active.profile.baseUrl} ` +
      `actor_id=${active.identity.actorId} (${active.identity.source}) ` +
      `session_id=${active.identity.sessionId}\n`,
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(
    `[memsy-mcp] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
