import { describe, expect, it } from "vitest";

import {
  MemsyActorIdRequiredError,
  MemsyAPIError,
  MemsyAuthorizationError,
  MemsyOwnerNotAllowedError,
  classifyError,
} from "../src/errors.js";
import * as memsy from "../src/index.js";

/** A refusal in the shape the servers send: FastAPI's {"detail": {"error", "message"}}. */
function refusal(status: number, error: string, message: string): Response {
  return new Response(JSON.stringify({ detail: { error, message } }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("business key errors, spelled exactly as the servers send them", () => {
  it("400 actor_id_required", async () => {
    const err = await classifyError(
      refusal(400, "actor_id_required", "A business key must send actor_id with every search.")
    );
    expect(err).toBeInstanceOf(MemsyActorIdRequiredError);
    expect(err.statusCode).toBe(400);
    expect(err.errorCode).toBe("actor_id_required");
    expect(err.detail).toBe("A business key must send actor_id with every search.");
  });

  it("403 owner_not_allowed", async () => {
    const err = await classifyError(
      refusal(403, "owner_not_allowed", "This key can't set owner_user_id for another user.")
    );
    expect(err).toBeInstanceOf(MemsyOwnerNotAllowedError);
    expect(err.statusCode).toBe(403);
    expect(err.errorCode).toBe("owner_not_allowed");
    expect(err.name).toBe("MemsyOwnerNotAllowedError");
  });

  it("owner_not_allowed is still a MemsyAuthorizationError", async () => {
    // Code written before this error existed checks for MemsyAuthorizationError.
    const err = await classifyError(
      refusal(403, "owner_not_allowed", "Business keys can't use connectors.")
    );
    expect(err).toBeInstanceOf(MemsyAuthorizationError);
  });

  it("owner_not_allowed wins over a message mentioning scope", async () => {
    // The generic 403 branch matches "scope" anywhere in the message.
    const err = await classifyError(
      refusal(403, "owner_not_allowed", "Out of scope for this key.")
    );
    expect(err).toBeInstanceOf(MemsyOwnerNotAllowedError);
  });

  it("other 400s stay generic", async () => {
    const err = await classifyError(
      refusal(400, "mine_requires_user", "This API key isn't linked to a user.")
    );
    expect(err.constructor).toBe(MemsyAPIError);
    expect(err.errorCode).toBe("mine_requires_user");
  });

  it("are exported from the package", () => {
    expect(memsy.MemsyOwnerNotAllowedError).toBe(MemsyOwnerNotAllowedError);
    expect(memsy.MemsyActorIdRequiredError).toBe(MemsyActorIdRequiredError);
  });
});
