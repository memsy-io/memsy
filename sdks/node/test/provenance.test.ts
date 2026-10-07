import { afterEach, describe, expect, it, vi } from "vitest";

import { MemsyClient } from "../src/client.js";
import { MemsyControlClient } from "../src/control.js";
import { serializeEvent, type EventPayload } from "../src/models.js";

/**
 * Where a memory came from, as this SDK reports it.
 *
 * Two levels that must not collapse into one: X-Memsy-Client names the library
 * and is always true, X-Memsy-Surface names whatever sits on top and only a
 * wrapper sets it. memsy-core resolves surface-then-client, so the SAME SDK is
 * recorded as sdk/node-sdk in an application and mcp/mcp under the MCP server.
 * Send only one of them and that distinction is gone.
 */

function stubFetch(payload: unknown = { event_ids: [] }) {
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

function sentHeaders(mock: ReturnType<typeof stubFetch>): Record<string, string> {
  const init = mock.mock.calls[0]![1]!;
  return init.headers as Record<string, string>;
}

function sentBody(mock: ReturnType<typeof stubFetch>): Record<string, unknown> {
  const init = mock.mock.calls[0]![1]!;
  return JSON.parse(init.body as string);
}

function event(extra: Partial<EventPayload> = {}): EventPayload {
  return {
    actorId: "a1",
    sessionId: "s1",
    kind: "user_message",
    content: "hello",
    ...extra,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("provenance headers", () => {
  it("always identifies the library", async () => {
    const mock = stubFetch();
    await new MemsyClient({ baseUrl: "https://api.test", apiKey: "k" }).ingest([event()]);
    expect(sentHeaders(mock)["X-Memsy-Client"]).toBe("node-sdk");
  });

  it("sends no surface when the caller is the application itself", async () => {
    // A plain application makes no claim about what sits on top of it, so
    // core falls back to the client header and records sdk/node-sdk. Sending
    // an empty surface resolves the same way — core tries `surface or client`
    // — so this is about the two SDKs agreeing on the wire, not about
    // avoiding a wrong label.
    const mock = stubFetch();
    await new MemsyClient({ baseUrl: "https://api.test", apiKey: "k" }).ingest([event()]);
    expect(sentHeaders(mock)).not.toHaveProperty("X-Memsy-Surface");
  });

  it("sends both when a wrapper declares itself", async () => {
    // The MCP server's case. Core takes the surface and ignores the client,
    // so this request is recorded as mcp, not sdk.
    const mock = stubFetch();
    await new MemsyClient({
      baseUrl: "https://api.test",
      apiKey: "k",
      surface: "mcp",
    }).ingest([event()]);
    expect(sentHeaders(mock)["X-Memsy-Surface"]).toBe("mcp");
    expect(sentHeaders(mock)["X-Memsy-Client"]).toBe("node-sdk");
  });

  it("treats an empty surface as unset", async () => {
    // surface: "" is a caller mistake, not a claim. Core cannot parse an empty
    // header so it would fall through to X-Memsy-Client regardless — this is
    // about matching the Python SDK, which omits it on a truthiness check.
    // Two SDKs differing on the wire for the same input is worth preventing
    // even where the stored row is identical.
    const mock = stubFetch();
    await new MemsyClient({
      baseUrl: "https://api.test",
      apiKey: "k",
      surface: "",
    }).ingest([event()]);
    expect(sentHeaders(mock)).not.toHaveProperty("X-Memsy-Surface");
  });

  it("identifies the library on the control client too", async () => {
    // Both clients extend BaseHttpClient, so this is one code path rather than
    // a rule each client has to remember.
    const mock = stubFetch({ org_id: "o1" });
    await new MemsyControlClient({ baseUrl: "https://api.test", apiKey: "k" }).me();
    expect(sentHeaders(mock)["X-Memsy-Client"]).toBe("node-sdk");
  });

  it("keeps the Authorization header", async () => {
    // Guards the obvious regression: rebuilding this object and dropping auth.
    const mock = stubFetch();
    await new MemsyClient({ baseUrl: "https://api.test", apiKey: "k" }).ingest([event()]);
    expect(sentHeaders(mock)["Authorization"]).toBe("Bearer k");
  });
});

describe("per-event provenance", () => {
  it("serialises the three fields to snake_case", () => {
    const out = serializeEvent(
      event({
        sourceId: "acme/repo:README.md",
        sourceAuthorEmail: "priya@acme.com",
        sourceAuthorId: "U0A1b2C3",
      })
    );
    expect(out.source_id).toBe("acme/repo:README.md");
    expect(out.source_author_email).toBe("priya@acme.com");
    expect(out.source_author_id).toBe("U0A1b2C3");
  });

  it("omits them entirely when unset", () => {
    // A caller who sets none of these must produce a byte-identical body to
    // one built before the fields existed — present-and-null is not the same
    // as absent to a server that distinguishes them.
    const out = serializeEvent(event());
    expect(out).not.toHaveProperty("source_id");
    expect(out).not.toHaveProperty("source_author_email");
    expect(out).not.toHaveProperty("source_author_id");
  });

  it("never puts the request-level fields in the body", async () => {
    // source_type and source are headers. A body field would be a second,
    // unclamped route to a value core only honours from one place — which is
    // what makes connector and studio provenance unforgeable.
    const mock = stubFetch();
    await new MemsyClient({
      baseUrl: "https://api.test",
      apiKey: "k",
      surface: "mcp",
    }).ingest([event({ sourceId: "x" })]);
    const sent = (sentBody(mock).events as Record<string, unknown>[])[0]!;
    expect(sent).not.toHaveProperty("source_type");
    expect(sent).not.toHaveProperty("source");
    expect(sent).not.toHaveProperty("source_instance_id");
  });
});

describe("capture mode", () => {
  it("is sent when the integration declares one", async () => {
    // memsy-core has no `sdk` entry in its derivation table, on purpose: only
    // the integration knows whether it sweeps or saves deliberately. An SDK
    // that cannot send this leaves capture_mode null on every row forever.
    const mock = stubFetch();
    await new MemsyClient({
      baseUrl: "https://api.test",
      apiKey: "k",
      captureMode: "ambient",
    }).ingest([event()]);
    expect(sentHeaders(mock)["X-Memsy-Capture"]).toBe("ambient");
  });

  it("is absent when the integration says nothing", async () => {
    const mock = stubFetch();
    await new MemsyClient({ baseUrl: "https://api.test", apiKey: "k" }).ingest([event()]);
    expect(sentHeaders(mock)).not.toHaveProperty("X-Memsy-Capture");
  });

  it("rejects a value core would drop", () => {
    expect(
      () =>
        new MemsyClient({
          baseUrl: "https://api.test",
          apiKey: "k",
          // @ts-expect-error — the type forbids it; the guard is for JS callers.
          captureMode: "sometimes",
        })
    ).toThrow(TypeError);
  });
});

describe("surface validation", () => {
  // The failure this prevents: an unencodable header throws inside fetch, and
  // the handler reports `MemsyConnectionError: Could not connect to Memsy` on
  // EVERY call including search. Someone checks their network, their URL and
  // their firewall before suspecting a header set once at construction.
  it.each(["acme-bot™", "bad\nvalue", "has space", "a".repeat(65)])(
    "rejects %j at construction",
    (surface) => {
      expect(
        () => new MemsyClient({ baseUrl: "https://api.test", apiKey: "k", surface })
      ).toThrow(TypeError);
    }
  );

  it("names the rule in the message", () => {
    // A caller who gets this should not have to read the source to fix it.
    expect(
      () => new MemsyClient({ baseUrl: "https://api.test", apiKey: "k", surface: "acme bot" })
    ).toThrow(/A-Za-z0-9\._-/);
  });

  it.each(["mcp", "mcp-hosted", "my-bot", "acme_agent", "v1.2"])(
    "accepts %j",
    (surface) => {
      expect(
        () => new MemsyClient({ baseUrl: "https://api.test", apiKey: "k", surface })
      ).not.toThrow();
    }
  );

  it("rejects before any request is attempted", () => {
    // Construction-time, so the mistake surfaces at its origin rather than on
    // a later call that looks like a network problem.
    const mock = stubFetch();
    expect(
      () => new MemsyClient({ baseUrl: "https://api.test", apiKey: "k", surface: "bad†" })
    ).toThrow();
    expect(mock).not.toHaveBeenCalled();
  });
});
