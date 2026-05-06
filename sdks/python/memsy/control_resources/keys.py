from __future__ import annotations

from typing import TYPE_CHECKING, Any

from memsy.models import ApiKeyListResponse, CreateKeyResponse

if TYPE_CHECKING:
    from memsy.async_control import AsyncMemsyControlClient
    from memsy.control import MemsyControlClient


class KeysResource:
    """Sync wrapper for api/ /keys endpoints.

    Note: all endpoints here require ``org:admin`` role. An API key issued to a
    non-admin member will receive ``AuthorizationError(error_code="admin_required")``.
    Key creation may raise ``KeyLimitReachedError`` when the tier cap is hit.
    """

    def __init__(self, client: MemsyControlClient) -> None:
        self._client = client

    def list(self) -> ApiKeyListResponse:
        """List all API keys for the org along with tier quota info."""
        data, _, _ = self._client._request("GET", "/keys")
        return ApiKeyListResponse.from_dict(data)

    def create(
        self,
        name: str,
        scopes: tuple[str, ...] | list[str] = ("read", "write"),
        expires_at: str | None = None,
    ) -> CreateKeyResponse:
        """
        Create a new API key.

        The ``raw_key`` in the response is only returned once — store it securely.

        :param name: Human-readable label for this key.
        :param scopes: Permission scopes. Defaults to ``("read", "write")``.
        :param expires_at: Optional ISO 8601 expiry datetime.
        """
        body: dict[str, Any] = {"name": name, "scopes": list(scopes)}
        if expires_at is not None:
            body["expires_at"] = expires_at
        data, _, _ = self._client._request("POST", "/keys", json=body)
        return CreateKeyResponse.from_dict(data)

    def delete(self, key_id: str) -> None:
        """Revoke and delete an API key."""
        self._client._request("DELETE", f"/keys/{key_id}")

    def usage(self, key_id: str) -> list[dict[str, Any]]:
        """Return usage records for a specific API key."""
        data, _, _ = self._client._request("GET", f"/keys/{key_id}/usage")
        return data.get("usage", [])


class AsyncKeysResource:
    """Async wrapper for api/ /keys endpoints.

    Note: all endpoints here require ``org:admin`` role. An API key issued to a
    non-admin member will receive ``AuthorizationError(error_code="admin_required")``.
    Key creation may raise ``KeyLimitReachedError`` when the tier cap is hit.
    """

    def __init__(self, client: AsyncMemsyControlClient) -> None:
        self._client = client

    async def list(self) -> ApiKeyListResponse:
        """List all API keys for the org along with tier quota info."""
        data, _, _ = await self._client._request("GET", "/keys")
        return ApiKeyListResponse.from_dict(data)

    async def create(
        self,
        name: str,
        scopes: tuple[str, ...] | list[str] = ("read", "write"),
        expires_at: str | None = None,
    ) -> CreateKeyResponse:
        """
        Create a new API key.

        The ``raw_key`` in the response is only returned once — store it securely.

        :param name: Human-readable label for this key.
        :param scopes: Permission scopes. Defaults to ``("read", "write")``.
        :param expires_at: Optional ISO 8601 expiry datetime.
        """
        body: dict[str, Any] = {"name": name, "scopes": list(scopes)}
        if expires_at is not None:
            body["expires_at"] = expires_at
        data, _, _ = await self._client._request("POST", "/keys", json=body)
        return CreateKeyResponse.from_dict(data)

    async def delete(self, key_id: str) -> None:
        """Revoke and delete an API key."""
        await self._client._request("DELETE", f"/keys/{key_id}")

    async def usage(self, key_id: str) -> list[dict[str, Any]]:
        """Return usage records for a specific API key."""
        data, _, _ = await self._client._request("GET", f"/keys/{key_id}/usage")
        return data.get("usage", [])
