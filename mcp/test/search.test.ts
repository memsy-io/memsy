import { describe, expect, it } from "vitest";

import { resolveSearchScope } from "../src/tools/search.js";

const CONV = "3840ad0d-5cdb-47f0-9e18-7366d3f9ef64";

describe("resolveSearchScope", () => {
  it("sends no session field at all for the default scope", () => {
    // Must stay byte-identical to a pre-scoping request: the keys absent, not
    // present-and-empty. This is the default every existing caller gets.
    expect(resolveSearchScope("all", CONV)).toEqual({ filter: {}, applied: "all" });
  });

  it("scopes to the current conversation", () => {
    expect(resolveSearchScope("this_conversation", CONV)).toEqual({
      filter: { sessionId: CONV },
      applied: "this_conversation",
    });
  });

  it("excludes the current conversation", () => {
    expect(resolveSearchScope("everything_except_this_conversation", CONV)).toEqual({
      filter: { excludeSessionId: CONV },
      applied: "everything_except_this_conversation",
    });
  });

  it("never sends both session fields", () => {
    // The server rejects the pair with a 422, so the shape has to make it
    // unreachable rather than rely on callers being careful.
    for (const scope of ["all", "this_conversation", "everything_except_this_conversation"] as const) {
      const { filter } = resolveSearchScope(scope, CONV);
      const sent = [filter.sessionId, filter.excludeSessionId].filter(Boolean);
      expect(sent.length).toBeLessThanOrEqual(1);
    }
  });

  describe("when the conversation cannot be identified", () => {
    it("degrades to an unscoped search rather than guessing", () => {
      // Scoping by a fabricated id would match nothing and return an empty
      // list, which reads as "no memories about this" instead of "I don't know
      // which conversation you're in".
      expect(resolveSearchScope("this_conversation", null).filter).toEqual({});
      expect(resolveSearchScope("everything_except_this_conversation", null).filter).toEqual({});
    });

    it("reports that the requested scope was not applied", () => {
      // Silent degradation is the failure mode this whole feature exists to
      // avoid, so the caller is told.
      const { applied } = resolveSearchScope("this_conversation", null);
      expect(applied).not.toBe("this_conversation");
      expect(applied).toContain("unavailable");
    });

    it("is indistinguishable from 'all' on the wire", () => {
      expect(resolveSearchScope("this_conversation", null).filter).toEqual(
        resolveSearchScope("all", CONV).filter,
      );
    });
  });
});
