from __future__ import annotations

from typing import TYPE_CHECKING

from memsy.models import EventListResponse

if TYPE_CHECKING:
    from memsy.async_control import AsyncMemsyControlClient
    from memsy.control import MemsyControlClient


class EventsResource:
    """Sync wrapper for api/ /console/events endpoint.

    Requires an assigned seat (``seat_required`` error if not).
    """

    def __init__(self, client: MemsyControlClient) -> None:
        self._client = client

    def list(
        self,
        *,
        actor_id: str | None = None,
        session_id: str | None = None,
        kind: str | None = None,
        sort: str = "ts_desc",
        limit: int = 50,
        offset: int = 0,
    ) -> EventListResponse:
        """
        Browse raw ingested events for the authenticated org.

        :param actor_id: Filter to events from a specific actor.
        :param session_id: Filter to events from a specific session.
        :param kind: Filter by event kind (e.g. ``"user_message"``).
        :param sort: ``"ts_desc"`` (default) or ``"ts_asc"``.
        :param limit: Page size (1–200, default 50).
        :param offset: Pagination offset.
        """
        params: dict[str, object] = {"sort": sort, "limit": limit, "offset": offset}
        if actor_id is not None:
            params["actor_id"] = actor_id
        if session_id is not None:
            params["session_id"] = session_id
        if kind is not None:
            params["kind"] = kind
        data, _, _ = self._client._request("GET", "/console/events", params=params)
        return EventListResponse.from_dict(data)


class AsyncEventsResource:
    """Async wrapper for api/ /console/events endpoint.

    Requires an assigned seat (``seat_required`` error if not).
    """

    def __init__(self, client: AsyncMemsyControlClient) -> None:
        self._client = client

    async def list(
        self,
        *,
        actor_id: str | None = None,
        session_id: str | None = None,
        kind: str | None = None,
        sort: str = "ts_desc",
        limit: int = 50,
        offset: int = 0,
    ) -> EventListResponse:
        """
        Browse raw ingested events for the authenticated org.

        :param actor_id: Filter to events from a specific actor.
        :param session_id: Filter to events from a specific session.
        :param kind: Filter by event kind (e.g. ``"user_message"``).
        :param sort: ``"ts_desc"`` (default) or ``"ts_asc"``.
        :param limit: Page size (1–200, default 50).
        :param offset: Pagination offset.
        """
        params: dict[str, object] = {"sort": sort, "limit": limit, "offset": offset}
        if actor_id is not None:
            params["actor_id"] = actor_id
        if session_id is not None:
            params["session_id"] = session_id
        if kind is not None:
            params["kind"] = kind
        data, _, _ = await self._client._request("GET", "/console/events", params=params)
        return EventListResponse.from_dict(data)
