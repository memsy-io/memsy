import type { BaseHttpClient } from "../http.js";
import {
  type Connector,
  type ConnectorConnection,
  type ConnectorResourceItem,
  type ResourceSelection,
  parseConnector,
  parseConnectorConnection,
  parseConnectorResourceItem,
  serializeResourceSelection,
} from "../models.js";

export interface ConfigureResourcesOptions {
  /**
   * Optional first-sweep lookback window in hours (Gmail only; ignored by
   * org-shared providers like Slack).
   */
  syncWindowHours?: number;
}

/**
 * Wrapper for api/ /connectors endpoints (Slack, Gmail, Google Drive).
 *
 * Slack is org-scoped: connecting or managing it requires an org admin or a
 * service/API-key caller (any API key issued through the control plane
 * already qualifies). Gmail and Google Drive are per-user connections.
 */
export class ConnectorsResource {
  constructor(private readonly client: BaseHttpClient) {}

  /**
   * Start an OAuth connection for a provider.
   *
   * Send the end user to the returned `authorizeUrl`. Once they complete the
   * provider's consent screen, the connector is created in `pending` status;
   * poll `get()` until it flips to `active` (after `configureResources()` is
   * called) or `error`.
   *
   * @param provider One of the values returned by `listProviders()` (e.g. `"slack"`).
   */
  async create(provider: string): Promise<ConnectorConnection> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "POST",
      `/connectors/${encodeURIComponent(provider)}/connect`
    );
    return parseConnectorConnection(data);
  }

  /** List connectors visible to the caller for this org. */
  async list(): Promise<Connector[]> {
    const { data } = await this.client.request<Record<string, unknown>[] | null>(
      "GET",
      "/connectors"
    );
    return (data ?? []).map(parseConnector);
  }

  /** List provider slugs supported by this deployment. */
  async listProviders(): Promise<string[]> {
    const { data } = await this.client.request<{ providers?: string[] }>(
      "GET",
      "/connectors/providers"
    );
    return data.providers ?? [];
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
   * List resources (channels/labels/folders) available on a connector, each
   * flagged with whether it's currently selected for syncing.
   */
  async listResources(connectorId: string): Promise<ConnectorResourceItem[]> {
    const { data } = await this.client.request<{ resources?: Record<string, unknown>[] }>(
      "GET",
      `/connectors/${encodeURIComponent(connectorId)}/resources`
    );
    return (data.resources ?? []).map(parseConnectorResourceItem);
  }

  /**
   * Select which resources to sync and trigger an immediate backfill.
   *
   * @param resources Resources to enable (replaces the current selection).
   */
  async configureResources(
    connectorId: string,
    resources: ResourceSelection[],
    options: ConfigureResourcesOptions = {}
  ): Promise<Connector> {
    const body: Record<string, unknown> = {
      resources: resources.map(serializeResourceSelection),
    };
    if (options.syncWindowHours !== undefined) body.sync_window_hours = options.syncWindowHours;
    const { data } = await this.client.request<Record<string, unknown>>(
      "PUT",
      `/connectors/${encodeURIComponent(connectorId)}/resources`,
      { body }
    );
    return parseConnector(data);
  }

  /** Trigger an immediate sync for an already-active connector. */
  async sync(connectorId: string): Promise<Connector> {
    const { data } = await this.client.request<Record<string, unknown>>(
      "POST",
      `/connectors/${encodeURIComponent(connectorId)}/sync`
    );
    return parseConnector(data);
  }

  /** Disconnect and revoke the connector's OAuth token. */
  async delete(connectorId: string): Promise<void> {
    await this.client.request<null>("DELETE", `/connectors/${encodeURIComponent(connectorId)}`);
  }
}
