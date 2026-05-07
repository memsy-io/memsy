import type { BaseHttpClient } from "../http.js";
import { type Team, parseTeam } from "../models.js";

export interface TeamListOptions {
  limit?: number;
  offset?: number;
}

export interface TeamUpdate {
  name?: string;
  focus?: string;
  promotionPrompt?: string;
}

export class TeamsResource {
  constructor(private readonly client: BaseHttpClient) {}

  async list(orgId: string, options: TeamListOptions = {}): Promise<Team[]> {
    const { data } = await this.client.request<Record<string, unknown>[] | null>("GET", "/teams", {
      query: { org_id: orgId, limit: options.limit ?? 100, offset: options.offset ?? 0 },
    });
    return (data ?? []).map(parseTeam);
  }

  async create(orgId: string, name: string, focus: string): Promise<Team> {
    const { data } = await this.client.request<Record<string, unknown>>("POST", "/teams", {
      body: { org_id: orgId, name, focus },
    });
    return parseTeam(data);
  }

  async get(teamId: string, orgId: string): Promise<Team> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "GET",
      `/teams/${encodeURIComponent(teamId)}`,
      { query: { org_id: orgId } }
    );
    return parseTeam(data);
  }

  async update(teamId: string, orgId: string, update: TeamUpdate): Promise<Team> {
    const body: Record<string, unknown> = {};
    if (update.name !== undefined) body.name = update.name;
    if (update.focus !== undefined) body.focus = update.focus;
    if (update.promotionPrompt !== undefined) body.promotion_prompt = update.promotionPrompt;
    const { data } = await this.client.request<Record<string, unknown>>(
      "PATCH",
      `/teams/${encodeURIComponent(teamId)}`,
      { body, query: { org_id: orgId } }
    );
    return parseTeam(data);
  }

  async regeneratePrompt(teamId: string, orgId: string): Promise<Team> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "POST",
      `/teams/${encodeURIComponent(teamId)}/regenerate-prompt`,
      { query: { org_id: orgId } }
    );
    return parseTeam(data);
  }

  async delete(teamId: string, orgId: string): Promise<void> {
    await this.client.request<null>("DELETE", `/teams/${encodeURIComponent(teamId)}`, {
      query: { org_id: orgId },
    });
  }
}
