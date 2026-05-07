import type { BaseHttpClient } from "../http.js";
import {
  type ApiKeyListResponse,
  type CreateKeyResponse,
  parseApiKeyListResponse,
  parseCreateKeyResponse,
} from "../models.js";

export interface CreateKeyOptions {
  scopes?: string[];
  expiresAt?: string;
}

export class KeysResource {
  constructor(private readonly client: BaseHttpClient) {}

  async list(): Promise<ApiKeyListResponse> {
    const { data } = await this.client.request<Record<string, unknown>>("GET", "/keys");
    return parseApiKeyListResponse(data);
  }

  async create(name: string, options: CreateKeyOptions = {}): Promise<CreateKeyResponse> {
    const body: Record<string, unknown> = {
      name,
      scopes: options.scopes ?? ["read", "write"],
    };
    if (options.expiresAt !== undefined) body.expires_at = options.expiresAt;
    const { data } = await this.client.request<Record<string, unknown>>("POST", "/keys", { body });
    return parseCreateKeyResponse(data);
  }

  async delete(keyId: string): Promise<void> {
    await this.client.request<null>("DELETE", `/keys/${encodeURIComponent(keyId)}`);
  }

  async usage(keyId: string): Promise<Record<string, unknown>[]> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "GET",
      `/keys/${encodeURIComponent(keyId)}/usage`
    );
    return ((data?.usage as Record<string, unknown>[]) ?? []);
  }
}
