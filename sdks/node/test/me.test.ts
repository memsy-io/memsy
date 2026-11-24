import { describe, expect, it } from "vitest";

import { parseMeResponse } from "../src/models.js";

const base = {
  tier: "pro",
  is_superadmin: false,
  org_id: "org_1",
  is_billing_admin: false,
};

describe("parseMeResponse", () => {
  it("keeps a user key's identity", () => {
    const me = parseMeResponse({
      ...base,
      user_id: "user_1",
      customer_id: "cust_1",
      email: "user@example.com",
      key_kind: "user",
    });
    expect(me.email).toBe("user@example.com");
    expect(me.customerId).toBe("cust_1");
    expect(me.keyKind).toBe("user");
    expect(me.app).toBeNull();
  });

  it("returns nulls, not the string 'null', for a business key", () => {
    const me = parseMeResponse({
      ...base,
      user_id: null,
      customer_id: null,
      email: null,
      key_kind: "business",
      app: { id: "app_1", name: "Aetherion" },
    });
    expect(me.email).toBeNull();
    expect(me.customerId).toBeNull();
    expect(me.userId).toBeNull();
    expect(me.keyKind).toBe("business");
    expect(me.app).toEqual({ id: "app_1", name: "Aetherion" });
  });

  it("handles an older server that sends neither key_kind nor app", () => {
    const me = parseMeResponse({ ...base, customer_id: "cust_1", email: "user@example.com" });
    expect(me.keyKind).toBeNull();
    expect(me.app).toBeNull();
  });
});
