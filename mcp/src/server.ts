import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig, parseCliFlags } from "./config.js";
import { ProfileManager } from "./profiles.js";
import { registerAllPrompts } from "./prompts/index.js";
import { registerAllResources } from "./resources/index.js";
import { registerAllTools } from "./tools/index.js";

const VERSION = "0.1.0";
const SERVER_NAME = "@memsy-io/mcp";

const HELP_TEXT = `memsy-mcp ${VERSION} — Memsy MCP server (long-term memory for AI coding agents)

Usage:
  memsy-mcp [options]

  Normally invoked by an MCP host (Claude Code, Cursor, VS Code, Cline, Continue.dev, Zed)
  over stdio — you rarely run this by hand. See https://docs.memsy.io/docs/mcp
  for per-host setup.

Options:
  --api-key <key>     API key (msy_*). Overrides the active profile's key.
  --base-url <url>    Memsy API base URL. Default: https://api.memsy.io/v1
  --profile <name>    Activate a named profile from ~/.memsy/config.json
  --config <path>     Use a specific config file
  -h, --help          Show this help and exit
  -V, --version       Print version and exit

Environment variables:
  MEMSY_API_KEY              API key (alternative to --api-key)
  MEMSY_BASE_URL             Alternative to --base-url
  MEMSY_PROFILE              Alternative to --profile
  MEMSY_ACTOR_ID             Override the derived actor_id
  MEMSY_DEFAULT_ROLE_IDS     Comma-separated default role filters
  MEMSY_DEFAULT_TEAM_IDS     Comma-separated default team filters

Examples:
  MEMSY_API_KEY=msy_... memsy-mcp
  memsy-mcp --profile work
  memsy-mcp --config ./custom-config.json
`;

// Flags that consume the following argv token as their value. We have to
// skip past those values when scanning for --help / --version, otherwise
// `memsy-mcp --profile -h` (where '-h' is an unusual but legal profile
// name) would silently print help instead of activating the profile.
const FLAGS_WITH_VALUE: ReadonlySet<string> = new Set([
  "--api-key",
  "--base-url",
  "--profile",
  "--config",
]);

function handleStandaloneFlags(argv: string[]): boolean {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (FLAGS_WITH_VALUE.has(arg)) {
      i++; // skip the value
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(HELP_TEXT);
      return true;
    }
    if (arg === "--version" || arg === "-V") {
      process.stdout.write(`${VERSION}\n`);
      return true;
    }
  }
  return false;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (handleStandaloneFlags(argv)) return;

  const flags = parseCliFlags(argv);
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
  const derived =
    active.identity.source === "derived-git" || active.identity.source === "derived-os";
  const pinned = Boolean(active.profile.actorId);
  const pinSuffix = derived && !pinned ? " (unpinned)" : "";
  process.stderr.write(
    `[memsy-mcp ${VERSION}] active_profile=${active.profileName} ` +
      `base_url=${active.profile.baseUrl} ` +
      `actor_id=${active.identity.actorId} (${active.identity.source})${pinSuffix} ` +
      `session_id=${active.identity.sessionId}\n`,
  );
  if (derived && !pinned) {
    process.stderr.write(
      `[memsy-mcp ${VERSION}] hint: actor_id is auto-derived. ` +
        `Pin a stable value with memsy_set_defaults { actor_id, persist: "global" } ` +
        `or set MEMSY_ACTOR_ID in this host's MCP config.\n`,
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(
    `[memsy-mcp] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
  );
  process.exit(1);
});
