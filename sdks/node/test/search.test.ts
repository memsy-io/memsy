import { afterEach, describe, expect, it, vi } from "vitest";

import { MemsyClient } from "../src/client.js";
import { parseSessionId } from "../src/models.js";

function client(): MemsyClient {
  return new MemsyClient({ baseUrl: "https://api.test", apiKey: "k" });
}

/**
 * Stub global fetch with a 200 carrying `payload`, and hand back the mock.
 *
 * The parameters are declared even though the stub ignores them: without them
 * `mock.calls` is typed as an empty tuple and `sentBody` cannot reach the init
 * argument.
 */
function stubFetch(payload: unknown = { results: [] }) {
  const mock = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

function sentBody(mock: ReturnType<typeof stubFetch>): Record<string, unknown> {
  const init = mock.mock.calls[0]![1]!;
  return JSON.parse(init.body as string);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("search — session scoping", () => {
  it("omits both filters by default", async () => {
    // The keys must be ABSENT, not present-and-null. Every existing caller
    // depends on this, and the server drops unknown fields silently — so a
    // stray null is exactly the kind of failure nobody would see.
    const mock = stubFetch();

    await client().search("preferences");

    const body = sentBody(mock);
    expect(body).not.toHaveProperty("session_id");
    expect(body).not.toHaveProperty("exclude_session_id");
  });

  it("produces the same request body as before these options existed", async () => {
    const mock = stubFetch();

    await client().search("preferences");

    expect(sentBody(mock)).toEqual({
      query: "preferences",
      limit: 10,
      threshold: 0.0,
      include_source_events: false,
    });
  });

  it("sends sessionId under its snake_case wire name", async () => {
    const mock = stubFetch();

    await client().search("preferences", { sessionId: "conv-42" });

    const body = sentBody(mock);
    expect(body.session_id).toBe("conv-42");
    expect(body).not.toHaveProperty("exclude_session_id");
  });

  it("sends excludeSessionId under its snake_case wire name", async () => {
    const mock = stubFetch();

    await client().search("preferences", { excludeSessionId: "conv-42" });

    const body = sentBody(mock);
    expect(body.exclude_session_id).toBe("conv-42");
    expect(body).not.toHaveProperty("session_id");
  });

  it("sends both filters unvalidated", async () => {
    // The SDK does not reject the contradictory pair — the server owns that
    // rule and answers 422. Pinned so nobody adds client-side validation that
    // can drift from the server's.
    const mock = stubFetch();

    await client().search("preferences", {
      sessionId: "conv-1",
      excludeSessionId: "conv-2",
    });

    const body = sentBody(mock);
    expect(body.session_id).toBe("conv-1");
    expect(body.exclude_session_id).toBe("conv-2");
  });

  it("sends an empty sessionId verbatim", async () => {
    // Matches actorId. The server collapses "" to "no filter", so a caller
    // passing it gets an UNSCOPED search rather than an error — a decision,
    // pinned here rather than an accident of the `!== undefined` guard.
    const mock = stubFetch();

    await client().search("preferences", { sessionId: "" });

    expect(sentBody(mock).session_id).toBe("");
  });
});

describe("search — session id on results", () => {
  it("exposes the conversation each result came from", async () => {
    stubFetch({
      results: [
        { id: "m1", content: "scoped", score: 0.9, metadata: { session_id: "conv-42" } },
        { id: "m2", content: "promoted", score: 0.8, metadata: {} },
      ],
    });

    const { results } = await client().search("preferences");

    expect(results[0]!.sessionId).toBe("conv-42");
    expect(results[1]!.sessionId).toBeNull();
  });

  it("reports null when the result carries no metadata at all", async () => {
    stubFetch({ results: [{ id: "m1", content: "bare", score: 0.5 }] });

    const { results } = await client().search("preferences");

    expect(results[0]!.sessionId).toBeNull();
  });
});

describe("parseSessionId", () => {
  it("reads a string session_id", () => {
    expect(parseSessionId({ session_id: "conv-42" })).toBe("conv-42");
  });

  it("returns null for missing, null and undefined metadata", () => {
    // A session-less memory and a server predating the field are
    // indistinguishable on the wire. Neither is an error.
    expect(parseSessionId({ title: "Promoted knowledge" })).toBeNull();
    expect(parseSessionId(null)).toBeNull();
    expect(parseSessionId(undefined)).toBeNull();
  });

  it("returns null rather than coercing a non-string session_id", () => {
    expect(parseSessionId({ session_id: 42 })).toBeNull();
    expect(parseSessionId({ session_id: null })).toBeNull();
  });
});
