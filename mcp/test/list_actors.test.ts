import { MemsyAPIError } from "@memsy-io/memsy";
import { describe, expect, it } from "vitest";

import { selfHasMemories } from "../src/tools/list_actors.js";

function clientThatThrows(err: unknown) {
  return {
    actors: {
      get: () => Promise.reject(err),
    },
  };
}

describe("selfHasMemories", () => {
  it("reports true when the actor resolves", async () => {
    const client = { actors: { get: () => Promise.resolve({ actorId: "me" }) } };
    expect(await selfHasMemories(client, "me")).toBe(true);
  });

  it("reports false only on a 404", async () => {
    const err = new MemsyAPIError("not found", 404, "no such actor");
    expect(await selfHasMemories(clientThatThrows(err), "me")).toBe(false);
  });

  it("reports null — not false — on a non-404 API error", async () => {
    // A 403 or 503 says nothing about whether the actor has memories. Folding
    // it into `false` would tell the user their identity ladder had shifted
    // when in fact the request never got an answer.
    for (const status of [401, 403, 429, 500, 503]) {
      const err = new MemsyAPIError("boom", status, "detail");
      expect(await selfHasMemories(clientThatThrows(err), "me")).toBeNull();
    }
  });

  it("reports null on a transport failure", async () => {
    const result = await selfHasMemories(clientThatThrows(new Error("ECONNREFUSED")), "me");
    expect(result).toBeNull();
  });

  it("sends no org_id, letting the server resolve it from the API key", async () => {
    // Passing an org would force a control-plane lookup upstream and break
    // every local split-port stack. `/actors` defaults org_id server-side.
    const seen: Array<[string, string | undefined]> = [];
    const client = {
      actors: {
        get: (actorId: string, orgId?: string) => {
          seen.push([actorId, orgId]);
          return Promise.resolve({});
        },
      },
    };
    await selfHasMemories(client, "slack:T1:U2");
    expect(seen).toEqual([["slack:T1:U2", undefined]]);
  });
});
