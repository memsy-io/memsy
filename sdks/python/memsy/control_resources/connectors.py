"""Connector management (Slack, Google Drive, S3, Notion, GitHub, OneDrive).

Connectors live on the control plane (``api/``), so they hang off
:class:`~memsy.control.MemsyControlClient`, not ``MemsyClient``.

Two scoping models, and the difference decides who may connect what:

* **Org-scoped** — ``slack``, ``s3``, ``notion``, ``github``. One shared
  connection per org. **Only an org admin (or an API key, which the server
  treats as a service caller acting org-wide) may connect, configure, sync or
  disconnect one.** A seated non-admin member gets ``AuthorizationError``
  (HTTP 403) — they may only *read*.
* **User-scoped** — ``google_drive``, ``onedrive``. Each member connects their
  own account. The owner manages their own connection; an org admin can see it
  for auditing but may never mutate it or spend its token.

The server is the enforcement point (``api/memsy_api/http/routes/connectors.py``);
:func:`requires_org_admin` is only a pre-flight convenience so callers can fail
fast or hide UI — never treat it as the security boundary.
"""

from __future__ import annotations

import asyncio
import time
from typing import TYPE_CHECKING, Any

from memsy.exceptions import MemsyAPIError
from memsy.models import (
    Connector,
    ConnectorConnection,
    ConnectorResourceItem,
    ConnectorStatus,
    PickerConfig,
    ResourceSelection,
)

if TYPE_CHECKING:
    from memsy.async_control import AsyncMemsyControlClient
    from memsy.control import MemsyControlClient

#: Providers where each member connects their own account.
USER_SCOPED_PROVIDERS: frozenset[str] = frozenset({"google_drive", "onedrive"})

#: Providers that are a single shared org resource — admin/service-key only to
#: connect or manage. Kept as a hint for callers; the server owns the real check
#: (and knows about providers newer than this SDK).
ORG_SCOPED_PROVIDERS: frozenset[str] = frozenset({"slack", "s3", "notion", "github"})

#: Providers that do not use OAuth — use their dedicated configure method.
NON_OAUTH_PROVIDERS: frozenset[str] = frozenset({"s3"})

#: How often ``wait_until_authorized`` polls, in seconds.
_POLL_INTERVAL = 3.0


def requires_org_admin(provider: str) -> bool:
    """Whether connecting/managing ``provider`` needs an org admin or API key.

    True for org-scoped providers (Slack, S3, Notion, GitHub), False for
    user-scoped ones (Google Drive, OneDrive). Advisory only — the server
    enforces this and is authoritative for providers this SDK doesn't know.
    """
    return provider not in USER_SCOPED_PROVIDERS


def _selection_body(
    resources: list[ResourceSelection] | list[ConnectorResourceItem],
) -> dict[str, Any]:
    items = [
        r if isinstance(r, ResourceSelection) else ResourceSelection.from_item(r) for r in resources
    ]
    return {"resources": [r.to_dict() for r in items]}


def _s3_body(
    access_key_id: str,
    secret_access_key: str,
    region: str,
    bucket: str,
    connector_id: str | None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "access_key_id": access_key_id,
        "secret_access_key": secret_access_key,
        "region": region,
        "bucket": bucket,
    }
    if connector_id is not None:
        body["connector_id"] = connector_id
    return body


class ConnectorsResource:
    """Sync wrapper for the control-plane ``/connectors`` endpoints.

    Typical OAuth flow (Slack, Notion, GitHub, Google Drive, OneDrive)::

        connection = control.connectors.create("slack")
        # send the end user to connection.authorize_url and let them consent
        resources = control.connectors.wait_until_authorized(connection.connector_id)
        control.connectors.configure_resources(
            connection.connector_id,
            [ResourceSelection.from_item(r) for r in resources],
        )

    S3 has no OAuth step — call :meth:`configure_s3` instead of :meth:`create`.

    See the module docstring for who is allowed to do what: org-scoped
    providers are admin/service-key only.
    """

    def __init__(self, client: MemsyControlClient) -> None:
        self._client = client

    # -- discovery -----------------------------------------------------------

    def list_providers(self) -> list[str]:
        """List provider slugs supported by this deployment."""
        data, _, _ = self._client._request("GET", "/connectors/providers")
        return data.get("providers", [])

    def status(self, provider: str) -> ConnectorStatus:
        """Whether a live connection exists for ``provider``.

        Member-safe — use this instead of :meth:`list` when the caller may not
        be an org admin.
        """
        data, _, _ = self._client._request("GET", f"/connectors/{provider}/status")
        return ConnectorStatus.from_dict(data)

    # -- connecting ----------------------------------------------------------

    def create(self, provider: str) -> ConnectorConnection:
        """
        Start an OAuth connection for a provider.

        Send the end user to the returned ``authorize_url``. The provider
        redirects back to Memsy's own callback (not to you), which exchanges the
        code and attaches the token; the connector stays ``pending`` until
        resources are selected. Poll :meth:`get` — or use
        :meth:`wait_until_authorized` — to learn when the token has landed.

        :param provider: A slug from :meth:`list_providers` (e.g. ``"slack"``).
        :raises MemsyAPIError: 400 if the provider doesn't use OAuth (S3 — use
            :meth:`configure_s3`), 403 if an org-scoped provider is being
            connected by a non-admin, 409 if a workspace is already connected.
        """
        data, _, _ = self._client._request("POST", f"/connectors/{provider}/connect")
        return ConnectorConnection.from_dict(data)

    def configure_s3(
        self,
        *,
        access_key_id: str,
        secret_access_key: str,
        region: str,
        bucket: str,
        connector_id: str | None = None,
    ) -> Connector:
        """
        Connect (or re-configure) S3 with direct IAM credentials — no OAuth.

        Credentials are validated before anything is stored, the bucket is
        auto-selected as the only resource, and the backfill sync starts
        immediately, so this single call fully wires the connection.

        Org-scoped: admins / API keys only.

        :param connector_id: Only when re-configuring an existing S3 connector.
        """
        data, _, _ = self._client._request(
            "POST",
            "/connectors/s3/configure",
            json=_s3_body(access_key_id, secret_access_key, region, bucket, connector_id),
        )
        return Connector.from_dict(data)

    # -- reading -------------------------------------------------------------

    def list(self) -> list[Connector]:
        """List connectors visible to the caller for this org.

        Non-admin members see only their own user-scoped connections.
        """
        data, _, _ = self._client._request("GET", "/connectors")
        return [Connector.from_dict(c) for c in (data or [])]

    def get(self, connector_id: str) -> Connector:
        """Retrieve a single connector."""
        data, _, _ = self._client._request("GET", f"/connectors/{connector_id}")
        return Connector.from_dict(data)

    def list_resources(
        self, connector_id: str, *, parent_id: str | None = None
    ) -> list[ConnectorResourceItem]:
        """List resources available on a connector, each flagged ``selected``.

        :param parent_id: Drill into a folder (OneDrive). Providers that don't
            support navigation return 400.
        :raises MemsyAPIError: 409 while the OAuth token hasn't been attached
            yet — that's the signal to keep polling, see
            :meth:`wait_until_authorized`.
        """
        params = {"parent_id": parent_id} if parent_id is not None else None
        data, _, _ = self._client._request(
            "GET", f"/connectors/{connector_id}/resources", params=params
        )
        return [ConnectorResourceItem.from_dict(r) for r in data.get("resources", [])]

    def list_branches(self, connector_id: str, repo: str) -> list[ConnectorResourceItem]:
        """GitHub only: list branches for one repo (``repo`` is a repo
        container's ``external_id`` from :meth:`list_resources`).

        Listed lazily per repo so a large account's repo list never fans out
        over every branch. 400 on providers without branch support.
        """
        data, _, _ = self._client._request(
            "GET", f"/connectors/{connector_id}/branches", params={"repo": repo}
        )
        return [ConnectorResourceItem.from_dict(r) for r in data.get("resources", [])]

    def picker_config(self, connector_id: str) -> PickerConfig:
        """Google Drive only: mint a short-lived token + config for the browser
        Google Picker. Owner-only — an admin cannot mint one for someone else.
        """
        data, _, _ = self._client._request("GET", f"/connectors/{connector_id}/picker-token")
        return PickerConfig.from_dict(data)

    def wait_until_authorized(
        self,
        connector_id: str,
        *,
        timeout: float = 300.0,
        poll_interval: float = _POLL_INTERVAL,
    ) -> list[ConnectorResourceItem]:
        """Block until the end user finishes the provider's consent screen.

        ``list_resources`` answers 409 until the OAuth callback has attached the
        token, so this polls it and returns the resources once it succeeds.

        :raises TimeoutError: if the user never completes consent in time.
        """
        deadline = time.monotonic() + timeout
        while True:
            try:
                return self.list_resources(connector_id)
            except MemsyAPIError as exc:
                if exc.status_code != 409:
                    raise
                if time.monotonic() + poll_interval >= deadline:
                    raise TimeoutError(
                        f"Connector {connector_id} was not authorized within {timeout}s"
                    ) from exc
                time.sleep(poll_interval)

    # -- managing ------------------------------------------------------------

    def configure_resources(
        self,
        connector_id: str,
        resources: list[ResourceSelection] | list[ConnectorResourceItem],
    ) -> Connector:
        """
        Select which resources to sync and trigger an immediate backfill.

        This also flips the connector from ``pending`` to ``active``. The
        selection **replaces** the current one — send the full set every time.

        Accepts :class:`~memsy.models.ResourceSelection` objects or the
        :class:`~memsy.models.ConnectorResourceItem` values returned by
        :meth:`list_resources` (converted for you, preserving ``resource_type``).

        Org-scoped connectors: admins / API keys only. User-scoped: owner only.
        """
        data, _, _ = self._client._request(
            "PUT", f"/connectors/{connector_id}/resources", json=_selection_body(resources)
        )
        return Connector.from_dict(data)

    def sync(self, connector_id: str) -> Connector:
        """Trigger an immediate sync. 409 unless the connector is ``active``."""
        data, _, _ = self._client._request("POST", f"/connectors/{connector_id}/sync")
        return Connector.from_dict(data)

    def delete(self, connector_id: str) -> None:
        """Disconnect and revoke the connector's stored credentials."""
        self._client._request("DELETE", f"/connectors/{connector_id}")


class AsyncConnectorsResource:
    """Async wrapper for the control-plane ``/connectors`` endpoints.

    Mirrors :class:`ConnectorsResource` method-for-method; see it and the module
    docstring for flow and permission details.
    """

    def __init__(self, client: AsyncMemsyControlClient) -> None:
        self._client = client

    # -- discovery -----------------------------------------------------------

    async def list_providers(self) -> list[str]:
        """List provider slugs supported by this deployment."""
        data, _, _ = await self._client._request("GET", "/connectors/providers")
        return data.get("providers", [])

    async def status(self, provider: str) -> ConnectorStatus:
        """Whether a live connection exists for ``provider`` (member-safe)."""
        data, _, _ = await self._client._request("GET", f"/connectors/{provider}/status")
        return ConnectorStatus.from_dict(data)

    # -- connecting ----------------------------------------------------------

    async def create(self, provider: str) -> ConnectorConnection:
        """Start an OAuth connection; send the user to ``authorize_url``.

        Org-scoped providers (Slack, Notion, GitHub) require an org admin or an
        API key. S3 doesn't use OAuth — call :meth:`configure_s3`.
        """
        data, _, _ = await self._client._request("POST", f"/connectors/{provider}/connect")
        return ConnectorConnection.from_dict(data)

    async def configure_s3(
        self,
        *,
        access_key_id: str,
        secret_access_key: str,
        region: str,
        bucket: str,
        connector_id: str | None = None,
    ) -> Connector:
        """Connect (or re-configure) S3 with direct IAM credentials — no OAuth.

        Org-scoped: admins / API keys only.
        """
        data, _, _ = await self._client._request(
            "POST",
            "/connectors/s3/configure",
            json=_s3_body(access_key_id, secret_access_key, region, bucket, connector_id),
        )
        return Connector.from_dict(data)

    # -- reading -------------------------------------------------------------

    async def list(self) -> list[Connector]:
        """List connectors visible to the caller for this org."""
        data, _, _ = await self._client._request("GET", "/connectors")
        return [Connector.from_dict(c) for c in (data or [])]

    async def get(self, connector_id: str) -> Connector:
        """Retrieve a single connector."""
        data, _, _ = await self._client._request("GET", f"/connectors/{connector_id}")
        return Connector.from_dict(data)

    async def list_resources(
        self, connector_id: str, *, parent_id: str | None = None
    ) -> list[ConnectorResourceItem]:
        """List resources available on a connector, each flagged ``selected``.

        409 until the OAuth token has been attached — see
        :meth:`wait_until_authorized`.
        """
        params = {"parent_id": parent_id} if parent_id is not None else None
        data, _, _ = await self._client._request(
            "GET", f"/connectors/{connector_id}/resources", params=params
        )
        return [ConnectorResourceItem.from_dict(r) for r in data.get("resources", [])]

    async def list_branches(self, connector_id: str, repo: str) -> list[ConnectorResourceItem]:
        """GitHub only: list branches for one repo."""
        data, _, _ = await self._client._request(
            "GET", f"/connectors/{connector_id}/branches", params={"repo": repo}
        )
        return [ConnectorResourceItem.from_dict(r) for r in data.get("resources", [])]

    async def picker_config(self, connector_id: str) -> PickerConfig:
        """Google Drive only: mint a short-lived token for the browser Picker."""
        data, _, _ = await self._client._request("GET", f"/connectors/{connector_id}/picker-token")
        return PickerConfig.from_dict(data)

    async def wait_until_authorized(
        self,
        connector_id: str,
        *,
        timeout: float = 300.0,
        poll_interval: float = _POLL_INTERVAL,
    ) -> list[ConnectorResourceItem]:
        """Await the end user finishing consent, then return the resources.

        :raises TimeoutError: if consent isn't completed in time.
        """
        deadline = time.monotonic() + timeout
        while True:
            try:
                return await self.list_resources(connector_id)
            except MemsyAPIError as exc:
                if exc.status_code != 409:
                    raise
                if time.monotonic() + poll_interval >= deadline:
                    raise TimeoutError(
                        f"Connector {connector_id} was not authorized within {timeout}s"
                    ) from exc
                await asyncio.sleep(poll_interval)

    # -- managing ------------------------------------------------------------

    async def configure_resources(
        self,
        connector_id: str,
        resources: list[ResourceSelection] | list[ConnectorResourceItem],
    ) -> Connector:
        """Select resources to sync (replaces the current set), activate the
        connector, and trigger the backfill."""
        data, _, _ = await self._client._request(
            "PUT", f"/connectors/{connector_id}/resources", json=_selection_body(resources)
        )
        return Connector.from_dict(data)

    async def sync(self, connector_id: str) -> Connector:
        """Trigger an immediate sync. 409 unless the connector is ``active``."""
        data, _, _ = await self._client._request("POST", f"/connectors/{connector_id}/sync")
        return Connector.from_dict(data)

    async def delete(self, connector_id: str) -> None:
        """Disconnect and revoke the connector's stored credentials."""
        await self._client._request("DELETE", f"/connectors/{connector_id}")
