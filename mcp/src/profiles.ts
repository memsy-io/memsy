import { MemsyClient, MemsyControlClient } from "@memsy-io/memsy";

import { reloadProfilesFromDisk, type Profile, type ResolvedConfig } from "./config.js";
import { buildIdentity, type Identity } from "./identity.js";

export interface ActiveContext {
  profileName: string;
  profile: Profile;
  identity: Identity;
  client: MemsyClient;
}

/** Derive the control-plane URL from the hot-path URL when it follows the
 *  canonical `/v1` → `/api` convention. Returns null if it doesn't (caller
 *  falls back to a clear "set control_url in your profile" error). */
function deriveControlUrl(hotPathBaseUrl: string): string | null {
  if (hotPathBaseUrl.endsWith("/v1")) {
    return `${hotPathBaseUrl.slice(0, -3)}/api`;
  }
  return null;
}

/**
 * Holds the in-memory active profile + a MemsyClient bound to it. Switching
 * profiles re-instantiates the client; in-flight requests already dispatched
 * against the old client complete on the old client.
 *
 * The MCP server serializes tool execution per request — we don't expose a
 * per-call profile override in v0, so there's no concurrent-write race here.
 */
export class ProfileManager {
  private profiles: Record<string, Profile>;
  private readonly configPath: string | null;
  private active!: ActiveContext;
  // Lazily-constructed control-plane client + cached orgId per profile, so
  // we only pay the /me round trip on first-need (list_roles / list_teams).
  private readonly orgIdCache: Map<string, string> = new Map();
  private readonly controlClientCache: Map<string, MemsyControlClient> = new Map();

  constructor(config: ResolvedConfig) {
    this.profiles = { ...config.profiles };
    this.configPath = config.sources.configFilePath;
    this.activate(config.activeProfileName);
  }

  listProfiles(): Array<{
    profileName: string;
    orgLabel: string | null;
    baseUrl: string;
    active: boolean;
  }> {
    return Object.entries(this.profiles).map(([name, p]) => ({
      profileName: name,
      orgLabel: p.orgLabel ?? null,
      baseUrl: p.baseUrl,
      active: name === this.active.profileName,
    }));
  }

  current(): ActiveContext {
    return this.active;
  }

  hasProfile(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.profiles, name);
  }

  /**
   * Re-read the config file and merge any newly-added profiles. Existing
   * profiles are NOT overwritten — we don't want a hand-edit to silently
   * change the credentials of a profile the caller is mid-session on.
   * Returns true when the requested name is available after reload.
   */
  reloadIfMissing(name: string): boolean {
    if (this.hasProfile(name)) return true;
    if (!this.configPath) return false;
    try {
      const fresh = reloadProfilesFromDisk(this.configPath);
      for (const [k, v] of Object.entries(fresh)) {
        if (!this.hasProfile(k)) this.profiles[k] = v;
      }
    } catch {
      // Config rewrote into an invalid state — fall through to the "unknown
      // profile" error path with whatever's still cached.
    }
    return this.hasProfile(name);
  }

  /**
   * Update the cached defaultRoleIds / defaultTeamIds on a profile and (if
   * it's the active one) refresh the live ActiveContext.profile so subsequent
   * tool calls see the new values without re-instantiating the HTTP client.
   * Only the fields explicitly passed are touched.
   */
  updateDefaults(
    name: string,
    update: { defaultRoleIds?: string[]; defaultTeamIds?: string[] },
  ): Profile {
    if (!this.hasProfile(name)) {
      throw new Error(`Unknown profile "${name}".`);
    }
    const next: Profile = {
      ...this.profiles[name],
      ...(update.defaultRoleIds !== undefined && { defaultRoleIds: update.defaultRoleIds }),
      ...(update.defaultTeamIds !== undefined && { defaultTeamIds: update.defaultTeamIds }),
    };
    this.profiles[name] = next;
    if (this.active.profileName === name) {
      // Mutate the live context's `profile` reference so existing search.ts /
      // ingest.ts code that reads ctx.profile.defaultRoleIds picks up the
      // change. Identity + client stay the same — only the filter defaults
      // moved.
      this.active = { ...this.active, profile: next };
    }
    return next;
  }

  activate(name: string): ActiveContext {
    // If the requested name isn't in the cached map, try re-reading the
    // config file once before failing. Lets `memsy_use_org work` succeed
    // when 'work' was added to ~/.memsy/config.json after server startup
    // without requiring a host restart.
    if (!this.hasProfile(name)) this.reloadIfMissing(name);

    const profile = this.profiles[name];
    if (!profile) {
      const available = Object.keys(this.profiles).join(", ") || "(none)";
      throw new Error(`Unknown profile "${name}". Available: ${available}`);
    }

    const identity = buildIdentity({ profile, profileName: name });
    const client = new MemsyClient({
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
    });

    this.active = { profileName: name, profile, identity, client };
    return this.active;
  }

  /**
   * Resolve the orgId for the active profile. Cached after first lookup
   * since orgId is immutable for a given API key.
   */
  async resolveOrgId(): Promise<string> {
    const { profileName, profile } = this.active;
    const cached = this.orgIdCache.get(profileName);
    if (cached) return cached;

    const controlUrl = deriveControlUrl(profile.baseUrl);
    if (!controlUrl) {
      throw new Error(
        `Cannot derive control-plane URL from base_url="${profile.baseUrl}". ` +
          `The MCP needs the control plane to look up your org_id for role/team listing. ` +
          `Use a base_url that ends in "/v1" or set MEMSY_BASE_URL accordingly.`,
      );
    }
    let control = this.controlClientCache.get(profileName);
    if (!control) {
      control = new MemsyControlClient({ baseUrl: controlUrl, apiKey: profile.apiKey });
      this.controlClientCache.set(profileName, control);
    }
    const me = await control.me();
    this.orgIdCache.set(profileName, me.orgId);
    return me.orgId;
  }
}
