import type { BaseHttpClient } from "../http.js";
import {
  type BillingSummary,
  type Invoice,
  parseBillingSummary,
  parseInvoice,
} from "../models.js";

export class BillingResource {
  constructor(private readonly client: BaseHttpClient) {}

  async summary(): Promise<BillingSummary> {
    const { data } = await this.client.request<Record<string, unknown>>("GET", "/billing/summary");
    return parseBillingSummary(data);
  }

  async invoices(): Promise<Invoice[]> {
    const { data } = await this.client.request<Record<string, unknown>[] | null>(
      "GET",
      "/billing/invoices"
    );
    return (data ?? []).map(parseInvoice);
  }
}
