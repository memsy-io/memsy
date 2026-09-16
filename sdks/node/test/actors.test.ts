import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemsyClient } from "../src/client.js";

const BASE_URL = "http://localhost:8003";

const ACTOR = {
  actor_id: "user_1",
  first_memory_at: "2026-04-01T00:00:00+00:00",
  last_memory_at: "2026-04-05T00:00:00+00:00",
  memory_count: 12,
  active_memory_count: 10,
  scope_levels: ["actor"],
  role_ids: ["role_1"],
  team_ids: [],
};

function envelope(items: unknown[], overrides: Record<string, unknown> = {}) {
  return { items, total: items.length, limit: 100, offset: 0, ...overrides };
}

/** Stubs `fetch` so assertions land on the wire, not on an internal seam. */
function stubFetch(body: unknown) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The URL the SDK actually requested, as a parsed URL. */
function requestedUrl(fetchMock: ReturnType<typeof stubFetch>): URL {
  return new URL(fetchMock.mock.calls[0][0]);
}

describe("ActorsResource", () => {
  let client: MemsyClient;

  beforeEach(() => {
    client = new MemsyClient({ baseUrl: BASE_URL, apiKey: "msy_test" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("list", () => {
    it("maps the actor fields to camelCase", async () => {
      stubFetch(envelope([ACTOR]));
      const page = await client.actors.list();
      expect(page.total).toBe(1);
      expect(page.items[0].actorId).toBe("user_1");
      expect(page.items[0].memoryCount).toBe(12);
      expect(page.items[0].activeMemoryCount).toBe(10);
      expect(page.items[0].roleIds).toEqual(["role_1"]);
    });

    it("parses the envelope, not a bare list", async () => {
      // /actors returns {items, total, ...} unlike /roles, which returns a bare
      // list — easy to get wrong by copying roles.ts.
      stubFetch(envelope([ACTOR], { total: 7 }));
      const page = await client.actors.list();
      // total is the org's distinct-actor count, not the length of this page.
      expect(page.total).toBe(7);
      expect(page.items).toHaveLength(1);
    });

    it("defaults truncated to false", async () => {
      // An older server that predates the flag must not read as truncated.
      stubFetch(envelope([ACTOR]));
      expect((await client.actors.list()).truncated).toBe(false);
    });

    it("surfaces truncated when the server sets it", async () => {
      stubFetch(envelope([ACTOR], { truncated: true }));
      expect((await client.actors.list()).truncated).toBe(true);
    });

    it("omits org_id when not given", async () => {
      // The server defaults to the caller's org; sending org_id=undefined as a
      // literal would 403 or 422.
      const fetchMock = stubFetch(envelope([]));
      await client.actors.list();
      expect(requestedUrl(fetchMock).searchParams.has("org_id")).toBe(false);
    });

    it("forwards every query param", async () => {
      const fetchMock = stubFetch(envelope([]));
      await client.actors.list("org_1", {
        limit: 25,
        offset: 50,
        sort: "actor_id_asc",
        q: "slack",
      });
      const params = requestedUrl(fetchMock).searchParams;
      expect(Object.fromEntries(params)).toEqual({
        org_id: "org_1",
        limit: "25",
        offset: "50",
        sort: "actor_id_asc",
        q: "slack",
      });
    });

    it("defaults sort to newest first", async () => {
      const fetchMock = stubFetch(envelope([]));
      await client.actors.list();
      expect(requestedUrl(fetchMock).searchParams.get("sort")).toBe("first_memory_desc");
    });

    it("defaults limit to 100 and offset to 0", async () => {
      const fetchMock = stubFetch(envelope([]));
      await client.actors.list();
      const params = requestedUrl(fetchMock).searchParams;
      expect(params.get("limit")).toBe("100");
      expect(params.get("offset")).toBe("0");
    });
  });

  describe("get", () => {
    it("maps the actor fields", async () => {
      stubFetch(ACTOR);
      const actor = await client.actors.get("user_1");
      expect(actor.actorId).toBe("user_1");
      expect(actor.firstMemoryAt).toBe("2026-04-01T00:00:00+00:00");
      expect(actor.lastMemoryAt).toBe("2026-04-05T00:00:00+00:00");
    });

    it("encodes the id as one path segment", async () => {
      // Connector actor ids carry structure; a ':' must survive the round trip.
      const fetchMock = stubFetch(ACTOR);
      await client.actors.get("slack:T0B7FKNKKTR:U0B7TN132E9");
      expect(requestedUrl(fetchMock).pathname).toBe(
        "/actors/slack%3AT0B7FKNKKTR%3AU0B7TN132E9"
      );
    });

    it("cannot traverse out of the collection", async () => {
      // encodeURIComponent is the only thing between a hostile actor_id and
      // /roles, so pin it: '..' and '/' must stay inside the path segment.
      const fetchMock = stubFetch(ACTOR);
      await client.actors.get("../roles");
      const url = requestedUrl(fetchMock);
      expect(url.pathname).toBe("/actors/..%2Froles");
      // Belt and braces: the URL parser did not normalise the segment away.
      expect(url.pathname.startsWith("/actors/")).toBe(true);
      expect(url.pathname).not.toBe("/roles");
    });

    it("keeps null timestamps as null", async () => {
      // A memory whose created_at is the NULL sentinel yields null, not a crash.
      stubFetch({ ...ACTOR, first_memory_at: null, last_memory_at: null });
      const actor = await client.actors.get("user_1");
      expect(actor.firstMemoryAt).toBeNull();
      expect(actor.lastMemoryAt).toBeNull();
    });

    it("defaults missing list and count fields", async () => {
      stubFetch({ actor_id: "user_1" });
      const actor = await client.actors.get("user_1");
      expect(actor.scopeLevels).toEqual([]);
      expect(actor.roleIds).toEqual([]);
      expect(actor.teamIds).toEqual([]);
      expect(actor.memoryCount).toBe(0);
      expect(actor.activeMemoryCount).toBe(0);
    });

    it("omits org_id when not given", async () => {
      const fetchMock = stubFetch(ACTOR);
      await client.actors.get("user_1");
      expect(requestedUrl(fetchMock).searchParams.has("org_id")).toBe(false);
    });
  });
});
