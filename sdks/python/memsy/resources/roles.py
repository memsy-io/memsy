from __future__ import annotations

from typing import TYPE_CHECKING, Any

from memsy.models import RoleResource

if TYPE_CHECKING:
    from memsy.async_client import AsyncMemsyClient
    from memsy.client import MemsyClient


class RolesResource:
    """Sync wrapper for memsy-core /roles onboarding endpoints."""

    def __init__(self, client: MemsyClient) -> None:
        self._client = client

    def list(self, org_id: str, *, limit: int = 100, offset: int = 0) -> list[RoleResource]:
        """List role customization records for an org."""
        params = {"org_id": org_id, "limit": limit, "offset": offset}
        data, _, _ = self._client._request("GET", "/roles", params=params)
        return [RoleResource.from_dict(r) for r in (data or [])]

    def create(self, org_id: str, name: str, focus: str) -> RoleResource:
        """
        Create a role customization record.

        :param org_id: The org this role belongs to.
        :param name: Display name for the role.
        :param focus: Description of the role's memory promotion scope.
        """
        body = {"org_id": org_id, "name": name, "focus": focus}
        data, _, _ = self._client._request("POST", "/roles", json=body)
        return RoleResource.from_dict(data)

    def get(self, role_id: str, org_id: str) -> RoleResource:
        """Retrieve a single role customization record."""
        data, _, _ = self._client._request("GET", f"/roles/{role_id}", params={"org_id": org_id})
        return RoleResource.from_dict(data)

    def update(
        self,
        role_id: str,
        org_id: str,
        *,
        name: str | None = None,
        focus: str | None = None,
        promotion_prompt: str | None = None,
    ) -> RoleResource:
        """Partially update a role customization record."""
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if focus is not None:
            body["focus"] = focus
        if promotion_prompt is not None:
            body["promotion_prompt"] = promotion_prompt
        data, _, _ = self._client._request(
            "PATCH", f"/roles/{role_id}", params={"org_id": org_id}, json=body
        )
        return RoleResource.from_dict(data)

    def regenerate_prompt(self, role_id: str, org_id: str) -> RoleResource:
        """Re-run the LLM to regenerate the promotion_prompt for this role."""
        data, _, _ = self._client._request(
            "POST", f"/roles/{role_id}/regenerate-prompt", params={"org_id": org_id}
        )
        return RoleResource.from_dict(data)

    def delete(self, role_id: str, org_id: str) -> None:
        """Remove the role customization record. Memories with this role_id are unaffected."""
        self._client._request("DELETE", f"/roles/{role_id}", params={"org_id": org_id})


class AsyncRolesResource:
    """Async wrapper for memsy-core /roles onboarding endpoints."""

    def __init__(self, client: AsyncMemsyClient) -> None:
        self._client = client

    async def list(self, org_id: str, *, limit: int = 100, offset: int = 0) -> list[RoleResource]:
        """List role customization records for an org."""
        params = {"org_id": org_id, "limit": limit, "offset": offset}
        data, _, _ = await self._client._request("GET", "/roles", params=params)
        return [RoleResource.from_dict(r) for r in (data or [])]

    async def create(self, org_id: str, name: str, focus: str) -> RoleResource:
        """
        Create a role customization record.

        :param org_id: The org this role belongs to.
        :param name: Display name for the role.
        :param focus: Description of the role's memory promotion scope.
        """
        body = {"org_id": org_id, "name": name, "focus": focus}
        data, _, _ = await self._client._request("POST", "/roles", json=body)
        return RoleResource.from_dict(data)

    async def get(self, role_id: str, org_id: str) -> RoleResource:
        """Retrieve a single role customization record."""
        data, _, _ = await self._client._request(
            "GET", f"/roles/{role_id}", params={"org_id": org_id}
        )
        return RoleResource.from_dict(data)

    async def update(
        self,
        role_id: str,
        org_id: str,
        *,
        name: str | None = None,
        focus: str | None = None,
        promotion_prompt: str | None = None,
    ) -> RoleResource:
        """Partially update a role customization record."""
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if focus is not None:
            body["focus"] = focus
        if promotion_prompt is not None:
            body["promotion_prompt"] = promotion_prompt
        data, _, _ = await self._client._request(
            "PATCH", f"/roles/{role_id}", params={"org_id": org_id}, json=body
        )
        return RoleResource.from_dict(data)

    async def regenerate_prompt(self, role_id: str, org_id: str) -> RoleResource:
        """Re-run the LLM to regenerate the promotion_prompt for this role."""
        data, _, _ = await self._client._request(
            "POST", f"/roles/{role_id}/regenerate-prompt", params={"org_id": org_id}
        )
        return RoleResource.from_dict(data)

    async def delete(self, role_id: str, org_id: str) -> None:
        """Remove the role customization record. Memories with this role_id are unaffected."""
        await self._client._request("DELETE", f"/roles/{role_id}", params={"org_id": org_id})
