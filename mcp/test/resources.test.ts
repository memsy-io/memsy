import { describe, expect, it } from "vitest";

import { computeSetupHint } from "../src/resources/index.js";

describe("computeSetupHint", () => {
  it("emits a hint when actor_id is derived from git and unpinned", () => {
    const hint = computeSetupHint("derived-git", undefined);
    expect(hint).toBeTypeOf("string");
    expect(hint).toContain("auto-derived");
    expect(hint).toContain("memsy_set_defaults");
  });

  it("emits a hint when actor_id is derived from OS user and unpinned", () => {
    expect(computeSetupHint("derived-os", undefined)).not.toBeNull();
  });

  it("stays silent when the profile has a pinned actorId, even if source is derived", () => {
    // Defensive: source shouldn't be 'derived-*' once a pin is in place, but
    // if a future refactor leaves it inconsistent, we'd rather not nag.
    expect(computeSetupHint("derived-git", "claude-code")).toBeNull();
  });

  it("stays silent when source is profile (already pinned)", () => {
    expect(computeSetupHint("profile", "claude-code")).toBeNull();
  });

  it("stays silent when source is env (user already overrode it deliberately)", () => {
    expect(computeSetupHint("env", undefined)).toBeNull();
  });

  it("stays silent when source is tool-arg", () => {
    expect(computeSetupHint("tool-arg", undefined)).toBeNull();
  });
});
