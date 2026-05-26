import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ProfileManager } from "../src/profiles.js";
import type { ResolvedConfig } from "../src/config.js";

function fixture(): ResolvedConfig {
  return {
    activeProfileName: "personal",
    activeProfile: { apiKey: "msy_p", baseUrl: "https://api.memsy.io", orgLabel: "Personal" },
    profiles: {
      personal: { apiKey: "msy_p", baseUrl: "https://api.memsy.io", orgLabel: "Personal" },
      work: { apiKey: "msy_w", baseUrl: "https://api.memsy.io", orgLabel: "Work" },
    },
    sources: { configFilePath: null, envApiKey: false, cliFlagsUsed: [] },
  };
}

describe("ProfileManager", () => {
  it("starts with the activeProfileName from config", () => {
    const mgr = new ProfileManager(fixture());
    expect(mgr.current().profileName).toBe("personal");
  });

  it("listProfiles marks exactly one active", () => {
    const mgr = new ProfileManager(fixture());
    const list = mgr.listProfiles();
    const actives = list.filter((p) => p.active);
    expect(actives).toHaveLength(1);
    expect(actives[0].profileName).toBe("personal");
  });

  it("activate switches the active profile and re-resolves identity", () => {
    const mgr = new ProfileManager(fixture());
    const before = mgr.current().identity.actorId;
    mgr.activate("work");
    expect(mgr.current().profileName).toBe("work");
    // Different profileName → different derived actor_id (different hash seed)
    expect(mgr.current().identity.actorId).not.toBe(before);
  });

  it("throws on unknown profile", () => {
    const mgr = new ProfileManager(fixture());
    expect(() => mgr.activate("nope")).toThrow(/Unknown profile/);
  });

  it("updateDefaults mutates the live active context's profile reference", () => {
    const mgr = new ProfileManager(fixture());
    expect(mgr.current().profile.defaultRoleIds).toBeUndefined();

    mgr.updateDefaults("personal", { defaultRoleIds: ["ic"], defaultTeamIds: ["platform"] });

    // Active context reflects the change without re-activate()
    expect(mgr.current().profile.defaultRoleIds).toEqual(["ic"]);
    expect(mgr.current().profile.defaultTeamIds).toEqual(["platform"]);
    // Identity + client are the same instance (no reconnect)
    expect(mgr.current().profileName).toBe("personal");
  });

  it("updateDefaults on a non-active profile updates the cache, not the live context", () => {
    const mgr = new ProfileManager(fixture()); // active = personal
    mgr.updateDefaults("work", { defaultRoleIds: ["senior"] });

    // Active context (still personal) is untouched
    expect(mgr.current().profile.defaultRoleIds).toBeUndefined();

    // Switching to work picks up the new defaults
    mgr.activate("work");
    expect(mgr.current().profile.defaultRoleIds).toEqual(["senior"]);
  });
});

describe("ProfileManager — reload on miss (review follow-up #5)", () => {
  let tmpDir: string;
  let configPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "memsy-mcp-reload-"));
    configPath = join(tmpDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        active_profile: "personal",
        profiles: { personal: { api_key: "msy_p", org_label: "Personal" } },
      }),
    );
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("picks up a newly-added profile after startup via reloadIfMissing", () => {
    const cfg: ResolvedConfig = {
      activeProfileName: "personal",
      activeProfile: { apiKey: "msy_p", baseUrl: "https://api.memsy.io/v1", orgLabel: "Personal" },
      profiles: { personal: { apiKey: "msy_p", baseUrl: "https://api.memsy.io/v1", orgLabel: "Personal" } },
      sources: { configFilePath: configPath, envApiKey: false, cliFlagsUsed: [] },
    };
    const mgr = new ProfileManager(cfg);
    expect(mgr.hasProfile("work")).toBe(false);

    // User edits config to add 'work' while server is running.
    writeFileSync(
      configPath,
      JSON.stringify({
        active_profile: "personal",
        profiles: {
          personal: { api_key: "msy_p", org_label: "Personal" },
          work: { api_key: "msy_w", org_label: "Work" },
        },
      }),
    );

    // Switching to the new profile triggers reloadIfMissing → succeeds.
    const ctx = mgr.activate("work");
    expect(ctx.profileName).toBe("work");
    expect(ctx.profile.apiKey).toBe("msy_w");
  });

  it("reload does NOT overwrite a profile the caller is mid-session on", () => {
    const cfg: ResolvedConfig = {
      activeProfileName: "personal",
      activeProfile: { apiKey: "msy_p_OLD", baseUrl: "https://api.memsy.io/v1", orgLabel: "Personal" },
      profiles: { personal: { apiKey: "msy_p_OLD", baseUrl: "https://api.memsy.io/v1", orgLabel: "Personal" } },
      sources: { configFilePath: configPath, envApiKey: false, cliFlagsUsed: [] },
    };
    const mgr = new ProfileManager(cfg);

    // User edits 'personal' on disk to a different key. Then asks for a
    // sibling that didn't exist — reload kicks in but must not silently
    // swap the in-memory 'personal' credentials.
    writeFileSync(
      configPath,
      JSON.stringify({
        active_profile: "personal",
        profiles: {
          personal: { api_key: "msy_p_NEW" },
          work: { api_key: "msy_w" },
        },
      }),
    );

    mgr.activate("work");
    // The reload added 'work' but left 'personal' as the in-memory snapshot.
    const personalSnapshot = mgr
      .listProfiles()
      .find((p) => p.profileName === "personal");
    expect(personalSnapshot).toBeDefined();
    // Sanity: activating 'personal' would still use the cached old key.
    mgr.activate("personal");
    expect(mgr.current().profile.apiKey).toBe("msy_p_OLD");
  });
});
