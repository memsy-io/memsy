from __future__ import annotations

from typing import TYPE_CHECKING, Any

from memsy.models import OrgResource

if TYPE_CHECKING:
    from memsy.async_client import AsyncMemsyClient
    from memsy.client import MemsyClient


class OrgsResource:
    """Sync wrapper for memsy-core /orgs onboarding endpoints."""

    def __init__(self, client: MemsyClient) -> None:
        self._client = client

    def list(self) -> list[OrgResource]:
        """List org customization records visible to this API key."""
        data, _, _ = self._client._request("GET", "/orgs")
        return [OrgResource.from_dict(o) for o in (data or [])]

    def create(self, org_id: str, name: str, focus: str) -> OrgResource:
        """
        Create an org customization record.

        :param org_id: The org ID (must match the API key's org scope).
        :param name: Display name for the org.
        :param focus: Description of what matters for this org's memory promotion.
        """
        body = {"org_id": org_id, "name": name, "focus": focus}
        data, _, _ = self._client._request("POST", "/orgs", json=body)
        return OrgResource.from_dict(data)

    def get(self, org_id: str) -> OrgResource:
        """Retrieve a single org customization record."""
        data, _, _ = self._client._request("GET", f"/orgs/{org_id}")
        return OrgResource.from_dict(data)

    def update(
        self,
        org_id: str,
        *,
        name: str | None = None,
        focus: str | None = None,
        promotion_prompt: str | None = None,
    ) -> OrgResource:
        """Partially update an org customization record."""
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if focus is not None:
            body["focus"] = focus
        if promotion_prompt is not None:
            body["promotion_prompt"] = promotion_prompt
        data, _, _ = self._client._request("PATCH", f"/orgs/{org_id}", json=body)
        return OrgResource.from_dict(data)

    def regenerate_prompt(self, org_id: str) -> OrgResource:
        """Re-run the LLM to regenerate the promotion_prompt for this org."""
        data, _, _ = self._client._request("POST", f"/orgs/{org_id}/regenerate-prompt")
        return OrgResource.from_dict(data)

    def delete(self, org_id: str) -> None:
        """Remove the org customization record. Memories with this org_id are unaffected."""
        self._client._request("DELETE", f"/orgs/{org_id}")


class AsyncOrgsResource:
    """Async wrapper for memsy-core /orgs onboarding endpoints."""

    def __init__(self, client: AsyncMemsyClient) -> None:
        self._client = client

    async def list(self) -> list[OrgResource]:
        """List org customization records visible to this API key."""
        data, _, _ = await self._client._request("GET", "/orgs")
        return [OrgResource.from_dict(o) for o in (data or [])]

    async def create(self, org_id: str, name: str, focus: str) -> OrgResource:
        """
        Create an org customization record.

        :param org_id: The org ID (must match the API key's org scope).
        :param name: Display name for the org.
        :param focus: Description of what matters for this org's memory promotion.
        """
        body = {"org_id": org_id, "name": name, "focus": focus}
        data, _, _ = await self._client._request("POST", "/orgs", json=body)
        return OrgResource.from_dict(data)

    async def get(self, org_id: str) -> OrgResource:
        """Retrieve a single org customization record."""
        data, _, _ = await self._client._request("GET", f"/orgs/{org_id}")
        return OrgResource.from_dict(data)

    async def update(
        self,
        org_id: str,
        *,
        name: str | None = None,
        focus: str | None = None,
        promotion_prompt: str | None = None,
    ) -> OrgResource:
        """Partially update an org customization record."""
        body: dict[str, Any] = {}
        if name is not None:
            body["name"] = name
        if focus is not None:
            body["focus"] = focus
        if promotion_prompt is not None:
            body["promotion_prompt"] = promotion_prompt
        data, _, _ = await self._client._request("PATCH", f"/orgs/{org_id}", json=body)
        return OrgResource.from_dict(data)

    async def regenerate_prompt(self, org_id: str) -> OrgResource:
        """Re-run the LLM to regenerate the promotion_prompt for this org."""
        data, _, _ = await self._client._request("POST", f"/orgs/{org_id}/regenerate-prompt")
        return OrgResource.from_dict(data)

    async def delete(self, org_id: str) -> None:
        """Remove the org customization record. Memories with this org_id are unaffected."""
        await self._client._request("DELETE", f"/orgs/{org_id}")
