import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MemsyControlClient } from "../src/control.js";
import { MemsyAuthorizationError } from "../src/errors.js";

const BASE_URL = "http://localhost:8004";

const ADMIN_SCOPE_403 = {
  detail: {
    error: "insufficient_scope",
    message: "API key missing 'admin' scope.",
    scope: "admin",
    current_scopes: ["read", "write"],
  },
};

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("admin API key scope", () => {
  let control: MemsyControlClient;

  beforeEach(() => {
    control = new MemsyControlClient({ baseUrl: BASE_URL, apiKey: "msy_test", maxRetries: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keys.create sends the admin scope", async () => {
    const fetchMock = stubFetch(200, {
      key_id: "key_3",
      prefix: "msy_adm",
      name: "connector-admin",
      scopes: ["read", "write", "admin"],
      is_active: true,
      created_at: "2026-04-01T00:00:00Z",
      raw_key: "msy_adm_secret",
    });
    await control.keys.create("connector-admin", { scopes: ["read", "write", "admin"] });
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(sent.scopes).toEqual(["read", "write", "admin"]);
  });

  it("keys.create defaults to read + write", async () => {
    const fetchMock = stubFetch(200, {
      key_id: "k",
      prefix: "p",
      name: "n",
      scopes: ["read", "write"],
      is_active: true,
      created_at: "2026-04-01T00:00:00Z",
      raw_key: "r",
    });
    await control.keys.create("n");
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(sent.scopes).toEqual(["read", "write"]);
  });

  it("a connector 403 surfaces requiredScope === 'admin'", async () => {
    stubFetch(403, ADMIN_SCOPE_403);
    const err = await control.connectors.create("slack").catch((e) => e);
    expect(err).toBeInstanceOf(MemsyAuthorizationError);
    expect((err as MemsyAuthorizationError).requiredScope).toBe("admin");
  });
});
