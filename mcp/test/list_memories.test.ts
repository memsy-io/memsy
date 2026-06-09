import { describe, expect, it } from "vitest";

import { resolveListActorScope } from "../src/tools/list_memories.js";

describe("resolveListActorScope", () => {
  it("defaults to the active actor when nothing else is specified", () => {
    expect(resolveListActorScope({ activeActorId: "claude-code" })).toBe("claude-code");
  });

  it("returns undefined (org-wide) when all_actors is set", () => {
    expect(
      resolveListActorScope({ allActors: true, activeActorId: "claude-code" }),
    ).toBeUndefined();
  });

  it("uses an explicit actor_id over the active actor", () => {
    expect(
      resolveListActorScope({ actorId: "alex-dev", activeActorId: "claude-code" }),
    ).toBe("alex-dev");
  });

  it("lets an explicit actor_id win even when all_actors is also true", () => {
    expect(
      resolveListActorScope({ actorId: "alex-dev", allActors: true, activeActorId: "claude-code" }),
    ).toBe("alex-dev");
  });

  it("ignores a blank or whitespace-only actor_id and falls back to the default", () => {
    expect(resolveListActorScope({ actorId: "   ", activeActorId: "claude-code" })).toBe(
      "claude-code",
    );
    expect(resolveListActorScope({ actorId: "", activeActorId: "claude-code" })).toBe(
      "claude-code",
    );
  });

  it("returns undefined when there is no active actor and no override", () => {
    expect(resolveListActorScope({})).toBeUndefined();
  });
});
