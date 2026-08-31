import type { BaseHttpClient } from "../http.js";
import { MemsyAPIError } from "../errors.js";
import {
  type Connector,
  type ConnectorConnection,
  type ConnectorResourceItem,
  type ConnectorStatus,
  type PickerConfig,
  type ResourceSelection,
  parseConnector,
  parseConnectorConnection,
  parseConnectorResourceItem,
  parseConnectorStatus,
  parsePickerConfig,
} from "../models.js";

/** Providers where each member connects their own account. */
export const USER_SCOPED_PROVIDERS: ReadonlySet<string> = new Set([
  "google_drive",
  "onedrive",
]);

/**
 * Providers that are a single shared org resource — an org admin or an API key
 * is required to connect or manage them. Advisory only; the server owns the
 * real check and knows about providers newer than this SDK.
 */
export const ORG_SCOPED_PROVIDERS: ReadonlySet<string> = new Set([
  "slack",
  "s3",
  "notion",
  "github",
]);

/** Providers that don't use OAuth — use their dedicated configure method. */
export const NON_OAUTH_PROVIDERS: ReadonlySet<string> = new Set(["s3"]);

/**
 * Whether connecting/managing `provider` needs an org admin or an API key.
 *
 * True for org-scoped providers (Slack, S3, Notion, GitHub), false for
 * user-scoped ones (Google Drive, OneDrive). Use it to fail fast or hide UI —
 * never as the security boundary; the server enforces it.
 */
export function requiresOrgAdmin(provider: string): boolean {
  return !USER_SCOPED_PROVIDERS.has(provider);
}

export interface ConfigureS3Options {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  bucket: string;
  /** Only when re-configuring an existing S3 connector. */
  connectorId?: string;
}

export interface WaitUntilAuthorizedOptions {
  /** Give up after this many ms (default 300_000). */
  timeoutMs?: number;
  /** Delay between polls in ms (default 3_000). */
  pollIntervalMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toSelectionBody(
  resources: Array<ResourceSelection | ConnectorResourceItem>
): Record<string, unknown> {
  return {
    resources: resources.map((r) => {
      const body: Record<string, unknown> = {
        external_id: r.externalId,
        resource_type: r.resourceType ?? "channel",
      };
      if (r.name !== undefined && r.name !== null) body.name = r.name;
      return body;
    }),
  };
}

/**
 * Connector management (Slack, Google Drive, S3, Notion, GitHub, OneDrive).
 *
 * Two scoping models, and the difference decides who may connect what:
 *
 * - **Org-scoped** — `slack`, `s3`, `notion`, `github`. One shared connection
 *   per org. **Only an org admin (or an API key, which the server treats as a
 *   service caller acting org-wide) may connect, configure, sync or disconnect
 *   one.** A seated non-admin member gets a 403 and may only read.
 * - **User-scoped** — `google_drive`, `onedrive`. Each member connects their
 *   own account; an org admin can see it for auditing but never mutate it.
 *
 * Typical OAuth flow:
 * ```ts
 * const connection = await control.connectors.create("slack");
 * // send the end user to connection.authorizeUrl
 * const resources = await control.connectors.waitUntilAuthorized(connection.connectorId);
 * await control.connectors.configureResources(connection.connectorId, resources);
 * ```
 *
 * S3 has no OAuth step — call {@link configureS3} instead of {@link create}.
 */
export class ConnectorsResource {
  constructor(private readonly client: BaseHttpClient) {}

  // ── discovery ──────────────────────────────────────────────────────────────

  /** List provider slugs supported by this deployment. */
  async listProviders(): Promise<string[]> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "GET",
      "/connectors/providers"
    );
    return (data?.providers as string[]) ?? [];
  }

  /**
   * Whether a live connection exists for `provider`. Member-safe — use this
   * instead of {@link list} when the caller may not be an org admin.
   */
  async status(provider: string): Promise<ConnectorStatus> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "GET",
      `/connectors/${encodeURIComponent(provider)}/status`
    );
    return parseConnectorStatus(data);
  }

  // ── connecting ─────────────────────────────────────────────────────────────

  /**
   * Start an OAuth connection for a provider.
   *
   * Send the end user to the returned `authorizeUrl`. The provider redirects
   * back to Memsy's own callback (not to you), which exchanges the code and
   * attaches the token; the connector stays `pending` until resources are
   * selected. Poll {@link get} — or use {@link waitUntilAuthorized}.
   *
   * Throws 400 if the provider doesn't use OAuth (S3 — use {@link configureS3}),
   * 403 if an org-scoped provider is connected by a non-admin, 409 if a
   * workspace is already connected.
   */
  async create(provider: string): Promise<ConnectorConnection> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "POST",
      `/connectors/${encodeURIComponent(provider)}/connect`
    );
    return parseConnectorConnection(data);
  }

  /**
   * Connect (or re-configure) S3 with direct IAM credentials — no OAuth.
   *
   * Credentials are validated before anything is stored, the bucket is
   * auto-selected as the only resource, and the backfill starts immediately.
   * Org-scoped: admins / API keys only.
   */
  async configureS3(options: ConfigureS3Options): Promise<Connector> {
    const body: Record<string, unknown> = {
      access_key_id: options.accessKeyId,
      secret_access_key: options.secretAccessKey,
      region: options.region,
      bucket: options.bucket,
    };
    if (options.connectorId !== undefined) body.connector_id = options.connectorId;
    const { data } = await this.client.request<Record<string, unknown>>(
      "POST",
      "/connectors/s3/configure",
      { body }
    );
    return parseConnector(data);
  }

  // ── reading ────────────────────────────────────────────────────────────────

  /**
   * List connectors visible to the caller for this org. Non-admin members see
   * only their own user-scoped connections.
   */
  async list(): Promise<Connector[]> {
    const { data } = await this.client.request<Record<string, unknown>[]>(
      "GET",
      "/connectors"
    );
    return (data ?? []).map(parseConnector);
  }

  /** Retrieve a single connector. */
  async get(connectorId: string): Promise<Connector> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "GET",
      `/connectors/${encodeURIComponent(connectorId)}`
    );
    return parseConnector(data);
  }

  /**
   * List resources available on a connector, each flagged `selected`.
   *
   * Pass `parentId` to drill into a folder (OneDrive). Throws 409 while the
   * OAuth token hasn't been attached yet — that's the signal to keep polling,
   * see {@link waitUntilAuthorized}.
   */
  async listResources(
    connectorId: string,
    options: { parentId?: string } = {}
  ): Promise<ConnectorResourceItem[]> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "GET",
      `/connectors/${encodeURIComponent(connectorId)}/resources`,
      { query: { parent_id: options.parentId } }
    );
    return ((data?.resources as Record<string, unknown>[]) ?? []).map(
      parseConnectorResourceItem
    );
  }

  /**
   * GitHub only: list branches for one repo (`repo` is a repo container's
   * `externalId` from {@link listResources}). Listed lazily per repo so a large
   * account's repo list never fans out over every branch.
   */
  async listBranches(connectorId: string, repo: string): Promise<ConnectorResourceItem[]> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "GET",
      `/connectors/${encodeURIComponent(connectorId)}/branches`,
      { query: { repo } }
    );
    return ((data?.resources as Record<string, unknown>[]) ?? []).map(
      parseConnectorResourceItem
    );
  }

  /**
   * Google Drive only: mint a short-lived token + config for the browser Google
   * Picker. Owner-only — an admin cannot mint one for someone else.
   */
  async pickerConfig(connectorId: string): Promise<PickerConfig> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "GET",
      `/connectors/${encodeURIComponent(connectorId)}/picker-token`
    );
    return parsePickerConfig(data);
  }

  /**
   * Block until the end user finishes the provider's consent screen.
   *
   * `listResources` answers 409 until the OAuth callback has attached the
   * token, so this polls it and resolves with the resources once it succeeds.
   * Rejects with an Error if consent isn't completed within the timeout.
   */
  async waitUntilAuthorized(
    connectorId: string,
    options: WaitUntilAuthorizedOptions = {}
  ): Promise<ConnectorResourceItem[]> {
    const timeoutMs = options.timeoutMs ?? 300_000;
    const pollIntervalMs = options.pollIntervalMs ?? 3_000;
    const deadline = Date.now() + timeoutMs;

    for (;;) {
      try {
        return await this.listResources(connectorId);
      } catch (err) {
        if (!(err instanceof MemsyAPIError) || err.statusCode !== 409) throw err;
        if (Date.now() + pollIntervalMs >= deadline) {
          throw new Error(
            `Connector ${connectorId} was not authorized within ${timeoutMs}ms`
          );
        }
        await sleep(pollIntervalMs);
      }
    }
  }

  // ── managing ───────────────────────────────────────────────────────────────

  /**
   * Select which resources to sync and trigger an immediate backfill. This also
   * flips the connector from `pending` to `active`. The selection **replaces**
   * the current one — send the full set every time.
   *
   * Accepts `ResourceSelection`s or the items returned by {@link listResources}.
   *
   * Org-scoped connectors: admins / API keys only. User-scoped: owner only.
   */
  async configureResources(
    connectorId: string,
    resources: Array<ResourceSelection | ConnectorResourceItem>
  ): Promise<Connector> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "PUT",
      `/connectors/${encodeURIComponent(connectorId)}/resources`,
      { body: toSelectionBody(resources) }
    );
    return parseConnector(data);
  }

  /** Trigger an immediate sync. 409 unless the connector is `active`. */
  async sync(connectorId: string): Promise<Connector> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "POST",
      `/connectors/${encodeURIComponent(connectorId)}/sync`
    );
    return parseConnector(data);
  }

  /** Disconnect and revoke the connector's stored credentials. */
  async delete(connectorId: string): Promise<void> {
    await this.client.request<null>(
      "DELETE",
      `/connectors/${encodeURIComponent(connectorId)}`
    );
  }
}
