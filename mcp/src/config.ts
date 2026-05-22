import { readFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface Profile {
  apiKey: string;
  baseUrl: string;
  actorId?: string;
  defaultRoleIds?: string[];
  defaultTeamIds?: string[];
  orgLabel?: string;
}

export interface ConfigFile {
  activeProfile?: string;
  profiles: Record<string, Profile>;
}

export interface ResolvedConfig {
  activeProfileName: string;
  activeProfile: Profile;
  profiles: Record<string, Profile>;
  sources: {
    configFilePath: string | null;
    envApiKey: boolean;
    cliFlagsUsed: string[];
  };
}

export interface CliFlags {
  apiKey?: string;
  baseUrl?: string;
  profile?: string;
  configPath?: string;
}

const DEFAULT_BASE_URL = "https://api.memsy.io/v1";
const DEFAULT_PROFILE_NAME = "default";

function parseList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length ? items : undefined;
}

function readConfigFile(path: string): ConfigFile | null {
  if (!existsSync(path)) return null;
  try {
    const text = readFileSync(path, "utf8");
    const raw = JSON.parse(text) as Record<string, unknown>;
    return normalizeConfigFile(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse Memsy config at ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function normalizeConfigFile(raw: Record<string, unknown>): ConfigFile {
  if (raw.profiles && typeof raw.profiles === "object") {
    const profilesRaw = raw.profiles as Record<string, Record<string, unknown>>;
    const profiles: Record<string, Profile> = {};
    for (const [name, p] of Object.entries(profilesRaw)) {
      profiles[name] = profileFromRaw(p);
    }
    return {
      activeProfile: typeof raw.active_profile === "string" ? raw.active_profile : undefined,
      profiles,
    };
  }

  // Legacy flat format → wrap as `default` profile.
  if (typeof raw.api_key === "string" || typeof raw.apiKey === "string") {
    return {
      profiles: { [DEFAULT_PROFILE_NAME]: profileFromRaw(raw) },
    };
  }

  return { profiles: {} };
}

function profileFromRaw(p: Record<string, unknown>): Profile {
  const apiKey = (p.api_key ?? p.apiKey) as string | undefined;
  if (typeof apiKey !== "string" || !apiKey) {
    throw new Error("Profile missing required field: api_key");
  }
  return {
    apiKey,
    baseUrl: (p.base_url ?? p.baseUrl ?? DEFAULT_BASE_URL) as string,
    actorId: (p.actor_id ?? p.actorId) as string | undefined,
    defaultRoleIds: (p.default_role_ids ?? p.defaultRoleIds) as string[] | undefined,
    defaultTeamIds: (p.default_team_ids ?? p.defaultTeamIds) as string[] | undefined,
    orgLabel: (p.org_label ?? p.orgLabel) as string | undefined,
  };
}

function findConfigFile(flagPath: string | undefined): string | null {
  if (flagPath) {
    const resolved = resolve(flagPath);
    if (!existsSync(resolved)) {
      throw new Error(`Memsy config file not found: ${resolved}`);
    }
    return resolved;
  }
  // Per-project overrides per-user.
  const projectPath = resolve(process.cwd(), ".memsy/config.json");
  if (existsSync(projectPath)) return projectPath;
  const userPath = join(homedir(), ".memsy", "config.json");
  if (existsSync(userPath)) return userPath;
  return null;
}

function assertSecureFilePerms(path: string): void {
  if (process.platform === "win32") return;
  try {
    const st = statSync(path);
    // World/group readable is fine in dev but risky for credential storage.
    // Warn (don't fail) — matches ~/.aws/credentials precedent.
    const worldReadable = (st.mode & 0o004) !== 0;
    if (worldReadable) {
      process.stderr.write(
        `[memsy-mcp] warning: ${path} is world-readable; run: chmod 600 ${path}\n`,
      );
    }
  } catch {
    // ignore stat errors
  }
}

export function loadConfig(flags: CliFlags = {}): ResolvedConfig {
  const cliFlagsUsed: string[] = [];

  const configPath = findConfigFile(flags.configPath);
  const fileCfg = configPath ? readConfigFile(configPath) : null;
  if (configPath) assertSecureFilePerms(configPath);

  const profiles: Record<string, Profile> = { ...(fileCfg?.profiles ?? {}) };

  const envKey = process.env.MEMSY_API_KEY;
  const envBaseUrl = process.env.MEMSY_BASE_URL;
  const envActorId = process.env.MEMSY_ACTOR_ID;
  const envProfile = process.env.MEMSY_PROFILE;
  const envDefaultRoles = parseList(process.env.MEMSY_DEFAULT_ROLE_IDS);
  const envDefaultTeams = parseList(process.env.MEMSY_DEFAULT_TEAM_IDS);

  // Synthesize an env-backed profile so a user can run with just MEMSY_API_KEY
  // and no config file at all.
  if (envKey) {
    profiles[DEFAULT_PROFILE_NAME] = profiles[DEFAULT_PROFILE_NAME] ?? {
      apiKey: envKey,
      baseUrl: envBaseUrl ?? DEFAULT_BASE_URL,
      actorId: envActorId,
      defaultRoleIds: envDefaultRoles,
      defaultTeamIds: envDefaultTeams,
      orgLabel: "default (env)",
    };
  }

  // Resolve the active profile name first so CLI --api-key applies to it.
  // (Earlier this block applied the flag to `profiles[flags.profile ?? "default"]`,
  // which silently dropped the override when the config's active_profile was
  // something other than "default" and no --profile was passed.)
  const activeName =
    flags.profile ?? envProfile ?? fileCfg?.activeProfile ?? DEFAULT_PROFILE_NAME;

  // CLI flag --api-key overrides the resolved active profile's key.
  if (flags.apiKey) {
    cliFlagsUsed.push("--api-key");
    const existing = profiles[activeName];
    profiles[activeName] = {
      apiKey: flags.apiKey,
      baseUrl: flags.baseUrl ?? existing?.baseUrl ?? envBaseUrl ?? DEFAULT_BASE_URL,
      actorId: existing?.actorId ?? envActorId,
      defaultRoleIds: existing?.defaultRoleIds ?? envDefaultRoles,
      defaultTeamIds: existing?.defaultTeamIds ?? envDefaultTeams,
      orgLabel: existing?.orgLabel ?? `${activeName} (cli)`,
    };
  }

  if (flags.baseUrl) cliFlagsUsed.push("--base-url");
  if (flags.profile) cliFlagsUsed.push("--profile");
  if (flags.configPath) cliFlagsUsed.push("--config");

  const active = profiles[activeName];
  if (!active) {
    const available = Object.keys(profiles);
    const hint =
      available.length === 0
        ? "Set MEMSY_API_KEY or run `memsy auth login` to create a profile."
        : `Available profiles: ${available.join(", ")}`;
    throw new Error(
      `No Memsy profile resolved (looked for "${activeName}"). ${hint}`,
    );
  }

  return {
    activeProfileName: activeName,
    activeProfile: active,
    profiles,
    sources: {
      configFilePath: configPath,
      envApiKey: Boolean(envKey),
      cliFlagsUsed,
    },
  };
}

export function parseCliFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--api-key":
        flags.apiKey = next;
        i++;
        break;
      case "--base-url":
        flags.baseUrl = next;
        i++;
        break;
      case "--profile":
        flags.profile = next;
        i++;
        break;
      case "--config":
        flags.configPath = next;
        i++;
        break;
    }
  }
  return flags;
}
