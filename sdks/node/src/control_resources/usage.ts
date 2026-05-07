import type { BaseHttpClient } from "../http.js";
import {
  type UsageSummaryResponse,
  type UsageTimeseriesResponse,
  parseUsageSummary,
  parseUsageTimeseries,
} from "../models.js";

export interface UsageTimeseriesOptions {
  dimension?: string;
  granularity?: string;
  periodStart?: string;
  periodEnd?: string;
}

export class UsageResource {
  constructor(private readonly client: BaseHttpClient) {}

  async summary(): Promise<UsageSummaryResponse> {
    const { data } = await this.client.request<Record<string, unknown>>("GET", "/usage/summary");
    return parseUsageSummary(data);
  }

  async timeseries(options: UsageTimeseriesOptions = {}): Promise<UsageTimeseriesResponse> {
    const { data } = await this.client.request<Record<string, unknown>>("GET", "/usage/timeseries", {
      query: {
        granularity: options.granularity ?? "daily",
        dimension: options.dimension,
        period_start: options.periodStart,
        period_end: options.periodEnd,
      },
    });
    return parseUsageTimeseries(data);
  }
}
