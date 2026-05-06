from __future__ import annotations

from typing import TYPE_CHECKING, Any

from memsy.models import TeamResource

if TYPE_CHECKING:
    from memsy.async_client import AsyncMemsyClient
    from memsy.client import MemsyClient


class TeamsResource:
    """Sync wrapper for memsy-core /teams onboarding endpoints."""

    def __init__(self, client: MemsyClient) -> None:
        self._client = client

    def list(self, org_id: str, *, limit: int = 100, offset: int = 0) -> list[TeamResource]:
        """List team customization records for an org."""
        params = {"org_id": org_id, "limit": limit, "offset": offset}
        data, _, _ = self._client._request("GET", "/teams", params=params)
        return [TeamResource.from_dict(t) for t in (data or [])]

    def create(self, org_id: str, name: str, focus: str) -> TeamResource:
        """
        Create a team customization record.

        :param org_id: The org this team belongs to.
        :param name: Display name for the team.
        :param focus: Description of the team's memory promotion scope.
        """
        body = {"org_id": org_id, "name": name, "focus": focus}
        data, _, _ = self._client._request("POST", "/teams", json=body)
        return TeamResource.from_dict(data)

    def get(self, team_id: str, org_id: str) -> TeamResource:
        """Retrieve a single team customization record."""
        data, _, _ = self._client._request("GET", f"/teams/{team_id}", params={"org_id": org_id})
        return TeamResource.from_dict(data)

    def update(
        self,
        team_id: str,
        org_id: str,
        *,
        name: str | None = None,
        focus: str | None = None,
        promotion_prompt: str | None = None,
    ) -> TeamResource:
        """Partially update a team customization record."""
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if focus is not None:
            body["focus"] = focus
        if promotion_prompt is not None:
            body["promotion_prompt"] = promotion_prompt
        data, _, _ = self._client._request(
            "PATCH", f"/teams/{team_id}", params={"org_id": org_id}, json=body
        )
        return TeamResource.from_dict(data)

    def regenerate_prompt(self, team_id: str, org_id: str) -> TeamResource:
        """Re-run the LLM to regenerate the promotion_prompt for this team."""
        data, _, _ = self._client._request(
            "POST", f"/teams/{team_id}/regenerate-prompt", params={"org_id": org_id}
        )
        return TeamResource.from_dict(data)

    def delete(self, team_id: str, org_id: str) -> None:
        """Remove the team customization record. Memories with this team_id are unaffected."""
        self._client._request("DELETE", f"/teams/{team_id}", params={"org_id": org_id})


class AsyncTeamsResource:
    """Async wrapper for memsy-core /teams onboarding endpoints."""

    def __init__(self, client: AsyncMemsyClient) -> None:
        self._client = client

    async def list(self, org_id: str, *, limit: int = 100, offset: int = 0) -> list[TeamResource]:
        """List team customization records for an org."""
        params = {"org_id": org_id, "limit": limit, "offset": offset}
        data, _, _ = await self._client._request("GET", "/teams", params=params)
        return [TeamResource.from_dict(t) for t in (data or [])]

    async def create(self, org_id: str, name: str, focus: str) -> TeamResource:
        """
        Create a team customization record.

        :param org_id: The org this team belongs to.
        :param name: Display name for the team.
        :param focus: Description of the team's memory promotion scope.
        """
        body = {"org_id": org_id, "name": name, "focus": focus}
        data, _, _ = await self._client._request("POST", "/teams", json=body)
        return TeamResource.from_dict(data)

    async def get(self, team_id: str, org_id: str) -> TeamResource:
        """Retrieve a single team customization record."""
        data, _, _ = await self._client._request(
            "GET", f"/teams/{team_id}", params={"org_id": org_id}
        )
        return TeamResource.from_dict(data)

    async def update(
        self,
        team_id: str,
        org_id: str,
        *,
        name: str | None = None,
        focus: str | None = None,
        promotion_prompt: str | None = None,
    ) -> TeamResource:
        """Partially update a team customization record."""
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if focus is not None:
            body["focus"] = focus
        if promotion_prompt is not None:
            body["promotion_prompt"] = promotion_prompt
        data, _, _ = await self._client._request(
            "PATCH", f"/teams/{team_id}", params={"org_id": org_id}, json=body
        )
        return TeamResource.from_dict(data)

    async def regenerate_prompt(self, team_id: str, org_id: str) -> TeamResource:
        """Re-run the LLM to regenerate the promotion_prompt for this team."""
        data, _, _ = await self._client._request(
            "POST", f"/teams/{team_id}/regenerate-prompt", params={"org_id": org_id}
        )
        return TeamResource.from_dict(data)

    async def delete(self, team_id: str, org_id: str) -> None:
        """Remove the team customization record. Memories with this team_id are unaffected."""
        await self._client._request("DELETE", f"/teams/{team_id}", params={"org_id": org_id})
