import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { _resetSessionId, getSessionId, resolveActorId } from "../src/identity.js";

const ORIGINAL_ENV = { ...process.env };

describe("resolveActorId", () => {
  beforeEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith("MEMSY_")) delete process.env[k];
    }
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("prefers MEMSY_ACTOR_ID env over everything", () => {
    process.env.MEMSY_ACTOR_ID = "alice";
    const out = resolveActorId({
      profile: { apiKey: "k", baseUrl: "x", actorId: "ignored" },
      profileName: "default",
    });
    expect(out.actorId).toBe("alice");
    expect(out.source).toBe("env");
  });

  it("falls back to profile.actorId when env absent", () => {
    const out = resolveActorId({
      profile: { apiKey: "k", baseUrl: "x", actorId: "bob" },
      profileName: "default",
    });
    expect(out.actorId).toBe("bob");
    expect(out.source).toBe("profile");
  });

  it("derives a 16-char hash when env+profile absent", () => {
    const out = resolveActorId({
      profile: { apiKey: "k", baseUrl: "x" },
      profileName: "default",
    });
    expect(out.actorId).toHaveLength(16);
    expect(out.source === "derived-git" || out.source === "derived-os").toBe(true);
  });
});

describe("getSessionId", () => {
  beforeEach(() => _resetSessionId());

  it("returns a stable UUID across calls within a process", () => {
    const a = getSessionId();
    const b = getSessionId();
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
  });
});
