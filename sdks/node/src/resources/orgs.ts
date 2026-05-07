import type { BaseHttpClient } from "../http.js";
import { type OnboardingUpdate, type Org, buildOnboardingUpdateBody, parseOrg } from "../models.js";

export type OrgUpdate = OnboardingUpdate;

export class OrgsResource {
  constructor(private readonly client: BaseHttpClient) {}

  async list(): Promise<Org[]> {
    const { data } = await this.client.request<Record<string, unknown>[] | null>("GET", "/orgs");
    return (data ?? []).map(parseOrg);
  }

  async create(orgId: string, name: string, focus: string): Promise<Org> {
    const { data } = await this.client.request<Record<string, unknown>>("POST", "/orgs", {
      body: { org_id: orgId, name, focus },
    });
    return parseOrg(data);
  }

  async get(orgId: string): Promise<Org> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "GET",
      `/orgs/${encodeURIComponent(orgId)}`
    );
    return parseOrg(data);
  }

  async update(orgId: string, update: OrgUpdate): Promise<Org> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "PATCH",
      `/orgs/${encodeURIComponent(orgId)}`,
      { body: buildOnboardingUpdateBody(update) }
    );
    return parseOrg(data);
  }

  async regeneratePrompt(orgId: string): Promise<Org> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "POST",
      `/orgs/${encodeURIComponent(orgId)}/regenerate-prompt`
    );
    return parseOrg(data);
  }

  async delete(orgId: string): Promise<void> {
    await this.client.request<null>("DELETE", `/orgs/${encodeURIComponent(orgId)}`);
  }
}
