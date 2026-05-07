import type { BaseHttpClient } from "../http.js";
import {
  type OnboardingUpdate,
  type Role,
  buildOnboardingUpdateBody,
  parseRole,
} from "../models.js";

export interface RoleListOptions {
  limit?: number;
  offset?: number;
}

export type RoleUpdate = OnboardingUpdate;

export class RolesResource {
  constructor(private readonly client: BaseHttpClient) {}

  async list(orgId: string, options: RoleListOptions = {}): Promise<Role[]> {
    const { data } = await this.client.request<Record<string, unknown>[] | null>("GET", "/roles", {
      query: { org_id: orgId, limit: options.limit ?? 100, offset: options.offset ?? 0 },
    });
    return (data ?? []).map(parseRole);
  }

  async create(orgId: string, name: string, focus: string): Promise<Role> {
    const { data } = await this.client.request<Record<string, unknown>>("POST", "/roles", {
      body: { org_id: orgId, name, focus },
    });
    return parseRole(data);
  }

  async get(roleId: string, orgId: string): Promise<Role> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "GET",
      `/roles/${encodeURIComponent(roleId)}`,
      { query: { org_id: orgId } }
    );
    return parseRole(data);
  }

  async update(roleId: string, orgId: string, update: RoleUpdate): Promise<Role> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "PATCH",
      `/roles/${encodeURIComponent(roleId)}`,
      { body: buildOnboardingUpdateBody(update), query: { org_id: orgId } }
    );
    return parseRole(data);
  }

  async regeneratePrompt(roleId: string, orgId: string): Promise<Role> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "POST",
      `/roles/${encodeURIComponent(roleId)}/regenerate-prompt`,
      { query: { org_id: orgId } }
    );
    return parseRole(data);
  }

  async delete(roleId: string, orgId: string): Promise<void> {
    await this.client.request<null>("DELETE", `/roles/${encodeURIComponent(roleId)}`, {
      query: { org_id: orgId },
    });
  }
}
