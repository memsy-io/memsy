import type { BaseHttpClient } from "../http.js";
import {
  type Actor,
  type ActorListResponse,
  parseActor,
  parseActorListResponse,
} from "../models.js";

/**
 * Server-side sort orders for {@link ActorsResource.list}.
 *
 * There is deliberately no sort by memory count: the server caps its row scan,
 * and past that cap the counts are under-reported, so ordering by them would
 * silently produce a wrong ranking. See {@link ActorListResponse.truncated}.
 */
export type ActorSort =
  | "first_memory_desc"
  | "first_memory_asc"
  | "last_memory_desc"
  | "actor_id_asc";

export interface ActorListOptions {
  /** Page size, 1–500. Pages the deduped actor list, not the underlying scan. */
  limit?: number;
  offset?: number;
  sort?: ActorSort;
  /** Case-insensitive substring match on `actorId`. */
  q?: string;
}

/**
 * Read-only access to memsy-core's `/actors` endpoints.
 *
 * Actors are derived from the org's memories on every read rather than stored,
 * so there is nothing to create, rename or delete — changing an `actor_id`
 * would mean rewriting the events and memory scopes that carry it.
 */
export class ActorsResource {
  constructor(private readonly client: BaseHttpClient) {}

  /**
   * List the actors that have memories in an org.
   *
   * @param orgId Org to read. Defaults to the authenticated caller's org;
   *   passing a different org rejects with a 403.
   */
  async list(orgId?: string, options: ActorListOptions = {}): Promise<ActorListResponse> {
    const { data } = await this.client.request<Record<string, unknown>>("GET", "/actors", {
      query: {
        org_id: orgId,
        limit: options.limit ?? 100,
        offset: options.offset ?? 0,
        sort: options.sort ?? "first_memory_desc",
        q: options.q,
      },
    });
    return parseActorListResponse(data);
  }

  /**
   * Retrieve a single derived actor.
   *
   * Rejects with a 404 when the actor has no memories in this org — including
   * for an actor that has ingested events but whose events produced no memories
   * yet.
   */
  async get(actorId: string, orgId?: string): Promise<Actor> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "GET",
      `/actors/${encodeURIComponent(actorId)}`,
      { query: { org_id: orgId } }
    );
    return parseActor(data);
  }
}
