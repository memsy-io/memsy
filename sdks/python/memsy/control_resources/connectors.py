from __future__ import annotations

from typing import TYPE_CHECKING, Any

from memsy.models import (
    Connector,
    ConnectorConnection,
    ConnectorResourceItem,
    ResourceSelection,
)

if TYPE_CHECKING:
    from memsy.async_control import AsyncMemsyControlClient
    from memsy.control import MemsyControlClient


class ConnectorsResource:
    """Sync wrapper for api/ /connectors endpoints (Slack, Gmail, Google Drive, etc).

    Slack is org-scoped: connecting or managing it requires an org admin or a
    service/API-key caller (any API key issued through the control plane
    already qualifies). Gmail and Google Drive are per-user connections.
    """

    def __init__(self, client: MemsyControlClient) -> None:
        self._client = client

    def create(self, provider: str) -> ConnectorConnection:
        """
        Start an OAuth connection for a provider.

        Send the end user to the returned ``authorize_url``. Once they complete
        the provider's consent screen, the connector is created in ``pending``
        status; poll :meth:`get` until it flips to ``active`` (after
        :meth:`configure_resources` is called) or ``error``.

        :param provider: One of the values returned by :meth:`list_providers`
            (e.g. ``"slack"``).
        """
        data, _, _ = self._client._request("POST", f"/connectors/{provider}/connect")
        return ConnectorConnection.from_dict(data)

    def list(self) -> list[Connector]:
        """List connectors visible to the caller for this org."""
        data, _, _ = self._client._request("GET", "/connectors")
        return [Connector.from_dict(c) for c in (data or [])]

    def list_providers(self) -> list[str]:
        """List provider slugs supported by this deployment."""
        data, _, _ = self._client._request("GET", "/connectors/providers")
        return data.get("providers", [])

    def get(self, connector_id: str) -> Connector:
        """Retrieve a single connector."""
        data, _, _ = self._client._request("GET", f"/connectors/{connector_id}")
        return Connector.from_dict(data)

    def list_resources(self, connector_id: str) -> list[ConnectorResourceItem]:
        """List resources (channels/labels/folders) available on a connector,
        each flagged with whether it's currently selected for syncing."""
        data, _, _ = self._client._request("GET", f"/connectors/{connector_id}/resources")
        return [ConnectorResourceItem.from_dict(r) for r in data.get("resources", [])]

    def configure_resources(
        self,
        connector_id: str,
        resources: list[ResourceSelection],
        *,
        sync_window_hours: int | None = None,
    ) -> Connector:
        """
        Select which resources to sync and trigger an immediate backfill.

        :param resources: Resources to enable (replaces the current selection).
        :param sync_window_hours: Optional first-sweep lookback window in hours
            (Gmail only; ignored by org-shared providers like Slack).
        """
        body: dict[str, Any] = {"resources": [r.to_dict() for r in resources]}
        if sync_window_hours is not None:
            body["sync_window_hours"] = sync_window_hours
        data, _, _ = self._client._request(
            "PUT", f"/connectors/{connector_id}/resources", json=body
        )
        return Connector.from_dict(data)

    def sync(self, connector_id: str) -> Connector:
        """Trigger an immediate sync for an already-active connector."""
        data, _, _ = self._client._request("POST", f"/connectors/{connector_id}/sync")
        return Connector.from_dict(data)

    def delete(self, connector_id: str) -> None:
        """Disconnect and revoke the connector's OAuth token."""
        self._client._request("DELETE", f"/connectors/{connector_id}")


class AsyncConnectorsResource:
    """Async wrapper for api/ /connectors endpoints (Slack, Gmail, Google Drive)."""

    def __init__(self, client: AsyncMemsyControlClient) -> None:
        self._client = client

    async def create(self, provider: str) -> ConnectorConnection:
        """
        Start an OAuth connection for a provider.

        Send the end user to the returned ``authorize_url``. Once they complete
        the provider's consent screen, the connector is created in ``pending``
        status; poll :meth:`get` until it flips to ``active`` (after
        :meth:`configure_resources` is called) or ``error``.

        :param provider: One of the values returned by :meth:`list_providers`
            (e.g. ``"slack"``).
        """
        data, _, _ = await self._client._request("POST", f"/connectors/{provider}/connect")
        return ConnectorConnection.from_dict(data)

    async def list(self) -> list[Connector]:
        """List connectors visible to the caller for this org."""
        data, _, _ = await self._client._request("GET", "/connectors")
        return [Connector.from_dict(c) for c in (data or [])]

    async def list_providers(self) -> list[str]:
        """List provider slugs supported by this deployment."""
        data, _, _ = await self._client._request("GET", "/connectors/providers")
        return data.get("providers", [])

    async def get(self, connector_id: str) -> Connector:
        """Retrieve a single connector."""
        data, _, _ = await self._client._request("GET", f"/connectors/{connector_id}")
        return Connector.from_dict(data)

    async def list_resources(self, connector_id: str) -> list[ConnectorResourceItem]:
        """List resources (channels/labels/folders) available on a connector,
        each flagged with whether it's currently selected for syncing."""
        data, _, _ = await self._client._request("GET", f"/connectors/{connector_id}/resources")
        return [ConnectorResourceItem.from_dict(r) for r in data.get("resources", [])]

    async def configure_resources(
        self,
        connector_id: str,
        resources: list[ResourceSelection],
        *,
        sync_window_hours: int | None = None,
    ) -> Connector:
        """
        Select which resources to sync and trigger an immediate backfill.

        :param resources: Resources to enable (replaces the current selection).
        :param sync_window_hours: Optional first-sweep lookback window in hours
            (Gmail only; ignored by org-shared providers like Slack).
        """
        body: dict[str, Any] = {"resources": [r.to_dict() for r in resources]}
        if sync_window_hours is not None:
            body["sync_window_hours"] = sync_window_hours
        data, _, _ = await self._client._request(
            "PUT", f"/connectors/{connector_id}/resources", json=body
        )
        return Connector.from_dict(data)

    async def sync(self, connector_id: str) -> Connector:
        """Trigger an immediate sync for an already-active connector."""
        data, _, _ = await self._client._request("POST", f"/connectors/{connector_id}/sync")
        return Connector.from_dict(data)

    async def delete(self, connector_id: str) -> None:
        """Disconnect and revoke the connector's OAuth token."""
        await self._client._request("DELETE", f"/connectors/{connector_id}")
