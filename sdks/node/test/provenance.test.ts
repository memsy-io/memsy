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
    // The header must be ABSENT, not empty. memsy-core treats an unparseable
    // header as an affirmative "unknown" finding, while an absent one leaves
    // the row unlabelled — and it falls back to the client header, which is
    // how a plain integration lands in sdk/node-sdk.
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
