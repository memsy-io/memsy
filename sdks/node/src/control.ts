import { BaseHttpClient, type BaseClientOptions } from "./http.js";
import { type HealthResponse, type MeResponse, parseMeResponse } from "./models.js";
import { KeysResource } from "./control_resources/keys.js";
import { UsageResource } from "./control_resources/usage.js";
import { BillingResource } from "./control_resources/billing.js";
import { EventsResource } from "./control_resources/events.js";
import { InterestResource } from "./control_resources/interest.js";

export type MemsyControlClientOptions = BaseClientOptions;

/**
 * Memsy control-plane client (api/).
 *
 * Handles account management, billing, API key lifecycle, usage reporting,
 * and console event browsing. Separate from MemsyClient because the
 * control-plane is a distinct service with its own base URL — typically
 * `https://api.memsy.io/api` (vs. `/v1` for the hot path).
 *
 * Sub-resources mirror the Python SDK's MemsyControlClient:
 *   control.keys       — API key CRUD (admin-only)
 *   control.usage      — usage summary + timeseries (admin-only)
 *   control.billing    — billing summary + invoices (admin-only)
 *   control.events     — raw event browsing (seat-required)
 *   control.interest   — Pro plan interest signaling
 */
export class MemsyControlClient extends BaseHttpClient {
  readonly keys: KeysResource;
  readonly usage: UsageResource;
  readonly billing: BillingResource;
  readonly events: EventsResource;
  readonly interest: InterestResource;

  constructor(options: MemsyControlClientOptions) {
    super(options);
    this.keys = new KeysResource(this);
    this.usage = new UsageResource(this);
    this.billing = new BillingResource(this);
    this.events = new EventsResource(this);
    this.interest = new InterestResource(this);
  }

  async me(): Promise<MeResponse> {
    const { data } = await this.request<Record<string, unknown>>("GET", "/me");
    return parseMeResponse(data);
  }

  async health(): Promise<HealthResponse> {
    const { data, usage, rateLimit } = await this.request<{
      status: string;
      version?: string;
      billing_enabled?: boolean;
      components?: Record<string, string>;
    }>("GET", "/health");

    return {
      status: data.status,
      version: data.version ?? "",
      billingEnabled: data.billing_enabled ?? null,
      components: data.components ?? null,
      usage,
      rateLimit,
    };
  }
}
