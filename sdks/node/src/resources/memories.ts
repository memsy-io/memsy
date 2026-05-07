import type { BaseHttpClient } from "../http.js";
import {
  type MemoryItem,
  type MemoryListResponse,
  type MemoryStatsResponse,
  parseMemoryItem,
  parseMemoryListResponse,
  parseMemoryStatsResponse,
} from "../models.js";

export interface MemoryListOptions {
  kind?: string;
  type?: string;
  status?: string;
  sort?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export class MemoriesResource {
  constructor(private readonly client: BaseHttpClient) {}

  async list(options: MemoryListOptions = {}): Promise<MemoryListResponse> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "GET",
      "/console/memories",
      {
        query: {
          sort: options.sort ?? "observed_at_desc",
          limit: options.limit ?? 50,
          offset: options.offset ?? 0,
          kind: options.kind,
          type: options.type,
          status: options.status,
          search: options.search,
        },
      }
    );
    return parseMemoryListResponse(data);
  }

  async stats(): Promise<MemoryStatsResponse> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "GET",
      "/console/memories/stats"
    );
    return parseMemoryStatsResponse(data);
  }

  async get(memoryId: string): Promise<MemoryItem> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "GET",
      `/console/memories/${encodeURIComponent(memoryId)}`
    );
    return parseMemoryItem(data);
  }
}
