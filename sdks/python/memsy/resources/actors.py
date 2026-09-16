from __future__ import annotations

from typing import TYPE_CHECKING, Literal
from urllib.parse import quote

from memsy.models import ActorListResponse, ActorResource

if TYPE_CHECKING:
    from memsy.async_client import AsyncMemsyClient
    from memsy.client import MemsyClient

#: Server-side sort orders for :meth:`ActorsResource.list`.
#:
#: There is deliberately no sort by memory count: the server caps its row scan,
#: and past that cap the counts are under-reported, so ordering by them would
#: silently produce a wrong ranking. See ``ActorListResponse.truncated``.
ActorSort = Literal[
    "first_memory_desc",
    "first_memory_asc",
    "last_memory_desc",
    "actor_id_asc",
]


def _seg(value: str) -> str:
    """Percent-encode an ``actor_id`` as one opaque URL path segment.

    Actor ids are caller-minted strings, and the connector-derived ones already
    carry structure. ``safe=""`` keeps a ``/`` or ``..`` in one from resolving outside 
    ``/actors/`` — matches ``encodeURIComponent`` in the Node SDK.
    """
    return quote(str(value), safe="")


def _list_params(
    org_id: str | None,
    limit: int,
    offset: int,
    sort: ActorSort,
    q: str | None,
) -> dict[str, object]:
    params: dict[str, object] = {"limit": limit, "offset": offset, "sort": sort}
    if org_id is not None:
        params["org_id"] = org_id
    if q is not None:
        params["q"] = q
    return params


class ActorsResource:
    """Sync wrapper for memsy-core ``/actors`` endpoints.

    Read-only by design. Actors are derived from the org's memories on every
    read rather than stored, so there is nothing to create, rename or delete —
    changing an ``actor_id`` would mean rewriting the events and memory scopes
    that carry it.
    """

    def __init__(self, client: MemsyClient) -> None:
        self._client = client

    def list(
        self,
        org_id: str | None = None,
        *,
        limit: int = 100,
        offset: int = 0,
        sort: ActorSort = "first_memory_desc",
        q: str | None = None,
    ) -> ActorListResponse:
        """
        List the actors that have memories in an org.

        :param org_id: Org to read. Defaults to the authenticated caller's org;
                       passing a different org raises
                       :class:`~memsy.exceptions.MemsyAPIError` (403).
        :param limit: Page size (1–500, default 100). Pages the deduped actor
                      list, not the underlying scan.
        :param offset: Pagination offset.
        :param sort: One of :data:`ActorSort`.
        :param q: Case-insensitive substring match on ``actor_id``.
        :returns: An envelope — check
                  :attr:`~memsy.models.ActorListResponse.truncated` before
                  trusting the counts on large orgs.
        """
        params = _list_params(org_id, limit, offset, sort, q)
        data, _, _ = self._client._request("GET", "/actors", params=params)
        return ActorListResponse.from_dict(data)

    def get(self, actor_id: str, org_id: str | None = None) -> ActorResource:
        """
        Retrieve a single derived actor.

        Raises :class:`~memsy.exceptions.MemsyAPIError` (404) when the actor has
        no memories in this org — including for an actor that has ingested
        events but whose events produced no memories yet.
        """
        params = {"org_id": org_id} if org_id is not None else None
        data, _, _ = self._client._request("GET", f"/actors/{_seg(actor_id)}", params=params)
        return ActorResource.from_dict(data)


class AsyncActorsResource:
    """Async wrapper for memsy-core ``/actors`` endpoints. See :class:`ActorsResource`."""

    def __init__(self, client: AsyncMemsyClient) -> None:
        self._client = client

    async def list(
        self,
        org_id: str | None = None,
        *,
        limit: int = 100,
        offset: int = 0,
        sort: ActorSort = "first_memory_desc",
        q: str | None = None,
    ) -> ActorListResponse:
        """List the actors that have memories in an org. See :meth:`ActorsResource.list`."""
        params = _list_params(org_id, limit, offset, sort, q)
        data, _, _ = await self._client._request("GET", "/actors", params=params)
        return ActorListResponse.from_dict(data)

    async def get(self, actor_id: str, org_id: str | None = None) -> ActorResource:
        """Retrieve a single derived actor. See :meth:`ActorsResource.get`."""
        params = {"org_id": org_id} if org_id is not None else None
        data, _, _ = await self._client._request("GET", f"/actors/{_seg(actor_id)}", params=params)
        return ActorResource.from_dict(data)
