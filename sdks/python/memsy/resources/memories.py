from __future__ import annotations

from typing import TYPE_CHECKING

from memsy.models import MemoryItemResource, MemoryListResponse, MemoryStatsResponse

if TYPE_CHECKING:
    from memsy.async_client import AsyncMemsyClient
    from memsy.client import MemsyClient


class MemoriesResource:
    """Sync wrapper for memsy-core /console/memories endpoints."""

    def __init__(self, client: MemsyClient) -> None:
        self._client = client

    def list(
        self,
        *,
        kind: str | None = None,
        type: str | None = None,
        status: str | None = None,
        sort: str = "observed_at_desc",
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> MemoryListResponse:
        """
        Browse memories for the authenticated org.

        :param kind: Filter by memory_kind (e.g. ``"semantic"``, ``"episodic"``, ``"procedural"``).
        :param type: Filter by type (e.g. ``"fact"``, ``"preference"``, ``"norm"``).
        :param status: Filter by status. Defaults to ``"active"`` on the server.
        :param sort: Sort order. One of ``"observed_at_desc"``, ``"observed_at_asc"``,
                     ``"strength_desc"``, ``"confidence_desc"``, ``"created_at_desc"``.
        :param search: Substring text filter applied server-side.
        :param limit: Page size (1–200, default 50).
        :param offset: Pagination offset.
        """
        params: dict[str, object] = {"sort": sort, "limit": limit, "offset": offset}
        if kind is not None:
            params["kind"] = kind
        if type is not None:
            params["type"] = type
        if status is not None:
            params["status"] = status
        if search is not None:
            params["search"] = search
        data, _, _ = self._client._request("GET", "/console/memories", params=params)
        return MemoryListResponse.from_dict(data)

    def stats(self) -> MemoryStatsResponse:
        """Return aggregate statistics for all memories in the authenticated org."""
        data, _, _ = self._client._request("GET", "/console/memories/stats")
        return MemoryStatsResponse.from_dict(data)

    def get(self, memory_id: str) -> MemoryItemResource:
        """Retrieve a single memory item by ID (UUID format required)."""
        data, _, _ = self._client._request("GET", f"/console/memories/{memory_id}")
        return MemoryItemResource.from_dict(data)


class AsyncMemoriesResource:
    """Async wrapper for memsy-core /console/memories endpoints."""

    def __init__(self, client: AsyncMemsyClient) -> None:
        self._client = client

    async def list(
        self,
        *,
        kind: str | None = None,
        type: str | None = None,
        status: str | None = None,
        sort: str = "observed_at_desc",
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> MemoryListResponse:
        """
        Browse memories for the authenticated org.

        :param kind: Filter by memory_kind (e.g. ``"semantic"``, ``"episodic"``, ``"procedural"``).
        :param type: Filter by type (e.g. ``"fact"``, ``"preference"``, ``"norm"``).
        :param status: Filter by status. Defaults to ``"active"`` on the server.
        :param sort: Sort order. One of ``"observed_at_desc"``, ``"observed_at_asc"``,
                     ``"strength_desc"``, ``"confidence_desc"``, ``"created_at_desc"``.
        :param search: Substring text filter applied server-side.
        :param limit: Page size (1–200, default 50).
        :param offset: Pagination offset.
        """
        params: dict[str, object] = {"sort": sort, "limit": limit, "offset": offset}
        if kind is not None:
            params["kind"] = kind
        if type is not None:
            params["type"] = type
        if status is not None:
            params["status"] = status
        if search is not None:
            params["search"] = search
        data, _, _ = await self._client._request("GET", "/console/memories", params=params)
        return MemoryListResponse.from_dict(data)

    async def stats(self) -> MemoryStatsResponse:
        """Return aggregate statistics for all memories in the authenticated org."""
        data, _, _ = await self._client._request("GET", "/console/memories/stats")
        return MemoryStatsResponse.from_dict(data)

    async def get(self, memory_id: str) -> MemoryItemResource:
        """Retrieve a single memory item by ID (UUID format required)."""
        data, _, _ = await self._client._request("GET", f"/console/memories/{memory_id}")
        return MemoryItemResource.from_dict(data)
