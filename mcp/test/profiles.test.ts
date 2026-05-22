import { describe, expect, it } from "vitest";

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
});
