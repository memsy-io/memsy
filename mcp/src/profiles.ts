import { MemsyClient } from "@memsy-io/memsy";

import type { Profile, ResolvedConfig } from "./config.js";
import { buildIdentity, type Identity } from "./identity.js";

export interface ActiveContext {
  profileName: string;
  profile: Profile;
  identity: Identity;
  client: MemsyClient;
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
  private active!: ActiveContext;

  constructor(config: ResolvedConfig) {
    this.profiles = { ...config.profiles };
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

  activate(name: string): ActiveContext {
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
}
