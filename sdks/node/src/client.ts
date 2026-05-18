import { BaseHttpClient, type BaseClientOptions } from "./http.js";
import {
  type EventPayload,
  type HealthResponse,
  type IngestResponse,
  type SearchResponse,
  type StatusResponse,
  parseSourceEvents,
  parseSourceMetadata,
  serializeEvent,
} from "./models.js";
import { OrgsResource } from "./resources/orgs.js";
import { RolesResource } from "./resources/roles.js";
import { TeamsResource } from "./resources/teams.js";
import { MemoriesResource } from "./resources/memories.js";

export type MemsyClientOptions = BaseClientOptions;

export interface SearchOptions {
  /**
   * Restrict results to a single actor's memories. Omit to search org-wide
   * across every actor — useful for admin tools and analytics, rarely what
   * you want in an end-user-facing agent loop.
   */
  actorId?: string;
  limit?: number;
  /**
   * Minimum relevance score. Default `0.0` (no filter).
   * See https://docs.memsy.io/docs/searching-memory#threshold for tier-specific guidance.
   */
  threshold?: number;
  includeSourceEvents?: boolean;
  roleIds?: string[];
  teamIds?: string[];
}

/**
 * Memsy client — ingest, search, and read back memories.
 *
 * Sub-resources mirror the Python SDK's MemsyClient:
 *   client.orgs       — onboarding org CRUD
 *   client.roles      — onboarding role CRUD
 *   client.teams      — onboarding team CRUD
 *   client.memories   — console memory browsing
 */
export class MemsyClient extends BaseHttpClient {
  readonly orgs: OrgsResource;
  readonly roles: RolesResource;
  readonly teams: TeamsResource;
  readonly memories: MemoriesResource;

  constructor(options: MemsyClientOptions) {
    super(options);
    this.orgs = new OrgsResource(this);
    this.roles = new RolesResource(this);
    this.teams = new TeamsResource(this);
    this.memories = new MemoriesResource(this);
  }

  async ingest(events: EventPayload[]): Promise<IngestResponse> {
    const { data, usage, rateLimit } = await this.request<{ event_ids: string[] }>(
      "POST",
      "/ingest",
      { body: { events: events.map(serializeEvent) } }
    );
    return { eventIds: data.event_ids, usage, rateLimit };
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResponse> {
    const body: Record<string, unknown> = {
      query,
      limit: options.limit ?? 10,
      threshold: options.threshold ?? 0.0,
      include_source_events: options.includeSourceEvents ?? false,
    };
    if (options.actorId !== undefined) body.actor_id = options.actorId;
    if (options.roleIds?.length) body.role_ids = options.roleIds;
    if (options.teamIds?.length) body.team_ids = options.teamIds;

    const { data, usage, rateLimit } = await this.request<{
      results: Array<{
        id: string;
        content: string;
        score: number;
        metadata?: Record<string, unknown>;
      }>;
    }>("POST", "/search", { body });

    return {
      results: data.results.map((r) => ({
        id: r.id,
        content: r.content,
        score: r.score,
        metadata: r.metadata ?? null,
        sourceEvents: parseSourceEvents(r.metadata),
        sourceMetadata: parseSourceMetadata(r.metadata),
      })),
      usage,
      rateLimit,
    };
  }

  async status(eventIds: string[]): Promise<StatusResponse> {
    const { data, usage, rateLimit } = await this.request<{
      completedIds: string[];
      failedIds: string[];
      pendingIds: string[];
      total: number;
      statuses?: Record<string, string>;
    }>("POST", "/status", { body: { event_ids: eventIds } });

    return {
      completedIds: data.completedIds ?? [],
      failedIds: data.failedIds ?? [],
      pendingIds: data.pendingIds ?? [],
      total: data.total ?? 0,
      statuses: data.statuses ?? null,
      usage,
      rateLimit,
    };
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
