import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

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

/**
 * Re-read the on-disk config and return its profile map. Used by
 * ProfileManager.reloadIfMissing to pick up profiles added after startup
 * (e.g. a hand-edit during a long-lived MCP session) without forcing the
 * user to restart the host.
 */
export function reloadProfilesFromDisk(path: string): Record<string, Profile> {
  const fileCfg = readConfigFile(path);
  return fileCfg?.profiles ?? {};
}

export type PersistScope = "global" | "project";

export function configPathForScope(scope: PersistScope): string {
  return scope === "global"
    ? join(homedir(), ".memsy", "config.json")
    : resolve(process.cwd(), ".memsy", "config.json");
}

function serializeProfile(p: Profile): Record<string, unknown> {
  // Round-trip back into the snake_case wire format used by readConfigFile,
  // so values written by the MCP look identical to hand-edited ones.
  const out: Record<string, unknown> = { api_key: p.apiKey };
  if (p.baseUrl) out.base_url = p.baseUrl;
  if (p.actorId !== undefined) out.actor_id = p.actorId;
  if (p.defaultRoleIds !== undefined) out.default_role_ids = p.defaultRoleIds;
  if (p.defaultTeamIds !== undefined) out.default_team_ids = p.defaultTeamIds;
  if (p.orgLabel !== undefined) out.org_label = p.orgLabel;
  return out;
}

export interface ProfileUpdate {
  defaultRoleIds?: string[];
  defaultTeamIds?: string[];
  actorId?: string;
}

export interface PersistResult {
  path: string;
  created: boolean;
}

/**
 * Atomically write the active profile's defaults to the chosen scope's
 * config file, preserving every other field on the profile (api_key,
 * base_url, etc.) and every sibling profile. Creates the file (with the
 * full active-profile contents) if it doesn't exist.
 *
 * The caller is expected to pass the in-memory active profile so we can
 * fill in api_key etc. when a brand-new file is created (e.g. a user who
 * has been running with MEMSY_API_KEY env-only decides to persist their
 * defaults — the file gets created with the env-derived contents plus the
 * new defaults).
 *
 * File is chmod 0600 after write.
 */
export function persistProfileDefaults(
  scope: PersistScope,
  profileName: string,
  activeProfileInMemory: Profile,
  updates: ProfileUpdate,
): PersistResult {
  const path = configPathForScope(scope);
  mkdirSync(dirname(path), { recursive: true });

  let existing: ConfigFile = { profiles: {} };
  let created = false;
  if (existsSync(path)) {
    const text = readFileSync(path, "utf8");
    try {
      existing = normalizeConfigFile(JSON.parse(text) as Record<string, unknown>);
    } catch {
      // Corrupt file — refuse to clobber. Caller surfaces the error.
      throw new Error(
        `Refusing to overwrite ${path}: existing file is not valid JSON. ` +
          `Inspect and fix it, then retry.`,
      );
    }
  } else {
    created = true;
  }

  // Preserve any existing profile contents at this name (api_key, base_url,
  // other fields); fall back to the in-memory active profile when the file
  // doesn't yet have this profile. This is what lets env-only users persist
  // — the api_key from env synthesis flows into the new file.
  const onDisk = existing.profiles[profileName];
  const existingProfile: Profile = onDisk
    ? {
        ...onDisk,
        // Rescue an in-memory-only actor_id pin (set by a prior call with
        // persist='none') when the file doesn't carry one. Without this,
        // a subsequent persist of any unrelated field would silently drop
        // the pin on disk. Other in-memory fields aren't auto-carried
        // because they have explicit-clear semantics ([] = clear).
        actorId: onDisk.actorId ?? activeProfileInMemory.actorId,
      }
    : activeProfileInMemory;
  const merged: Profile = {
    ...existingProfile,
    ...(updates.defaultRoleIds !== undefined && { defaultRoleIds: updates.defaultRoleIds }),
    ...(updates.defaultTeamIds !== undefined && { defaultTeamIds: updates.defaultTeamIds }),
    ...(updates.actorId !== undefined && { actorId: updates.actorId }),
  };

  existing.profiles[profileName] = merged;

  // Always preserve any active_profile pointer the file already had — never
  // clobber the user's existing default. Newly-created files seed with the
  // profile we just persisted to.
  const serialized: Record<string, unknown> = {
    active_profile: existing.activeProfile ?? profileName,
    profiles: Object.fromEntries(
      Object.entries(existing.profiles).map(([k, v]) => [k, serializeProfile(v)]),
    ),
  };

  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(serialized, null, 2)}\n`);
  if (process.platform !== "win32") chmodSync(tmp, 0o600);
  renameSync(tmp, path);

  return { path, created };
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
      // Skip + warn on malformed profiles instead of failing the entire load.
      // A half-edited file (e.g. a `work` profile that hasn't gotten its
      // api_key yet) would otherwise make the server unbootable even when
      // the user explicitly --profile's into a valid sibling.
      try {
        profiles[name] = profileFromRaw(p);
      } catch (err) {
        process.stderr.write(
          `[memsy-mcp] warning: skipping invalid profile "${name}": ${
            err instanceof Error ? err.message : String(err)
          }\n`,
        );
      }
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
  // MEMSY_ACTOR_ID is intentionally NOT read here. identity.ts:resolveActorId
  // reads it at resolve time so env keeps top precedence without leaking
  // into profile.actorId (which would risk being serialized to ~/.memsy/...).
  const envProfile = process.env.MEMSY_PROFILE;
  const envDefaultRoles = parseList(process.env.MEMSY_DEFAULT_ROLE_IDS);
  const envDefaultTeams = parseList(process.env.MEMSY_DEFAULT_TEAM_IDS);

  // Resolve the active profile name FIRST so env synthesis and CLI --api-key
  // both land on the right slot. (Synthesizing under DEFAULT_PROFILE_NAME and
  // then resolving to envProfile silently produced "profile not found" for
  // the common case of `MEMSY_PROFILE=work MEMSY_API_KEY=msy_...`.)
  const activeName =
    flags.profile ?? envProfile ?? fileCfg?.activeProfile ?? DEFAULT_PROFILE_NAME;

  // Synthesize an env-backed profile under the resolved active name so users
  // can run with just MEMSY_API_KEY (+ optional MEMSY_PROFILE) and no file.
  //
  // NB: MEMSY_ACTOR_ID is intentionally NOT copied into profile.actorId here.
  // Doing so would let a later memsy_set_defaults call accidentally serialize
  // an env-derived value into ~/.memsy/config.json (defeating the per-host
  // distinction the env var exists to enable). identity.ts:resolveActorId
  // already gives env top precedence at resolve time, so env still wins for
  // ingest/search without polluting the profile object.
  if (envKey) {
    profiles[activeName] = profiles[activeName] ?? {
      apiKey: envKey,
      baseUrl: envBaseUrl ?? DEFAULT_BASE_URL,
      defaultRoleIds: envDefaultRoles,
      defaultTeamIds: envDefaultTeams,
      orgLabel: `${activeName} (env)`,
    };
  }

  // CLI flag --api-key overrides the resolved active profile's key.
  if (flags.apiKey) {
    cliFlagsUsed.push("--api-key");
    const existing = profiles[activeName];
    profiles[activeName] = {
      apiKey: flags.apiKey,
      baseUrl: flags.baseUrl ?? existing?.baseUrl ?? envBaseUrl ?? DEFAULT_BASE_URL,
      actorId: existing?.actorId,
      defaultRoleIds: existing?.defaultRoleIds ?? envDefaultRoles,
      defaultTeamIds: existing?.defaultTeamIds ?? envDefaultTeams,
      orgLabel: existing?.orgLabel ?? `${activeName} (cli)`,
    };
  }

  // Merge env-derived defaults into the active profile if the profile (file-
  // loaded, env-synthesized, or CLI-overridden) didn't already specify them.
  // Without this, MEMSY_DEFAULT_ROLE_IDS / MEMSY_DEFAULT_TEAM_IDS are silently
  // dropped whenever a file profile is active — contradicting the env-var
  // table in the README. MEMSY_ACTOR_ID is excluded here; see the NB above.
  const activeBeforeMerge = profiles[activeName];
  if (activeBeforeMerge) {
    profiles[activeName] = {
      ...activeBeforeMerge,
      defaultRoleIds: activeBeforeMerge.defaultRoleIds ?? envDefaultRoles,
      defaultTeamIds: activeBeforeMerge.defaultTeamIds ?? envDefaultTeams,
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

function takeFlagValue(flag: string, value: string | undefined): string {
  // Reject values that look like another flag — the user almost certainly
  // forgot to supply the real value. Without this, `--api-key --profile work`
  // silently sets apiKey to the literal "--profile" and the real --profile
  // gets dropped.
  if (value === undefined || value.startsWith("-")) {
    throw new Error(
      `Missing value for ${flag} (got ${value === undefined ? "end of arguments" : `"${value}"`})`,
    );
  }
  return value;
}

export function parseCliFlags(argv: string[]): CliFlags {
  const flags: CliFlags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    switch (arg) {
      case "--api-key":
        flags.apiKey = takeFlagValue(arg, next);
        i++;
        break;
      case "--base-url":
        flags.baseUrl = takeFlagValue(arg, next);
        i++;
        break;
      case "--profile":
        flags.profile = takeFlagValue(arg, next);
        i++;
        break;
      case "--config":
        flags.configPath = takeFlagValue(arg, next);
        i++;
        break;
    }
  }
  return flags;
}
