import type { BaseHttpClient } from "../http.js";
import { type EventListResponse, parseEventListResponse } from "../models.js";

export interface ConsoleEventListOptions {
  actorId?: string;
  sessionId?: string;
  kind?: string;
  sort?: string;
  limit?: number;
  offset?: number;
}

export class EventsResource {
  constructor(private readonly client: BaseHttpClient) {}

  async list(options: ConsoleEventListOptions = {}): Promise<EventListResponse> {
    const { data } = await this.client.request<Record<string, unknown>>("GET", "/console/events", {
      query: {
        sort: options.sort ?? "ts_desc",
        limit: options.limit ?? 50,
        offset: options.offset ?? 0,
        actor_id: options.actorId,
        session_id: options.sessionId,
        kind: options.kind,
      },
    });
    return parseEventListResponse(data);
  }
}
