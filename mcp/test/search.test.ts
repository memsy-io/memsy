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
    it("degrades `this_conversation` to an unscoped search rather than guessing", () => {
      // Asked for a subset, got a superset: the answer is still in there. And
      // scoping by a fabricated id would match nothing and return an empty
      // list, which reads as "no memories about this" instead of "I don't know
      // which conversation you're in".
      const out = resolveSearchScope("this_conversation", null);
      expect(out.filter).toEqual({});
      expect(out.refusal).toBeUndefined();
    });

    it("reports that the requested scope was not applied", () => {
      // Silent degradation is the failure mode this whole feature exists to
      // avoid, so the caller is told.
      const { applied } = resolveSearchScope("this_conversation", null);
      expect(applied).not.toBe("this_conversation");
      expect(applied).toContain("unavailable");
    });

    it("degraded `this_conversation` is indistinguishable from 'all' on the wire", () => {
      expect(resolveSearchScope("this_conversation", null).filter).toEqual(
        resolveSearchScope("all", CONV).filter,
      );
    });

    it("REFUSES `everything_except_this_conversation` instead of degrading", () => {
      // Degrading here would return precisely the conversation the caller asked
      // to leave out, inverting the only instruction given. Since the scope
      // exists for "have we discussed this before?", the caller would be shown
      // what was said moments ago and conclude yes.
      const out = resolveSearchScope("everything_except_this_conversation", null);
      expect(out.refusal).toBeTruthy();
      expect(out.refusal).toContain("cannot be excluded");
      expect(out.applied).not.toContain("all");
    });

    it("refusing is distinguishable from an unscoped search", () => {
      // Both carry an empty filter, so `filter` alone cannot tell them apart —
      // the caller must branch on `refusal`, and this pins that.
      const refused = resolveSearchScope("everything_except_this_conversation", null);
      const degraded = resolveSearchScope("this_conversation", null);
      expect(refused.filter).toEqual(degraded.filter);
      expect(Boolean(refused.refusal)).not.toBe(Boolean(degraded.refusal));
    });

    it("still scopes normally once an id is available", () => {
      // The refusal is about the missing id, not the scope itself.
      expect(resolveSearchScope("everything_except_this_conversation", CONV)).toEqual({
        filter: { excludeSessionId: CONV },
        applied: "everything_except_this_conversation",
      });
    });
  });
});
