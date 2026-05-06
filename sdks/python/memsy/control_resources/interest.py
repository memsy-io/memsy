from __future__ import annotations

from typing import TYPE_CHECKING, Any

from memsy.models import ProInterestResponse

if TYPE_CHECKING:
    from memsy.async_control import AsyncMemsyControlClient
    from memsy.control import MemsyControlClient


class InterestResource:
    """Sync wrapper for api/ /interest/pro endpoints."""

    def __init__(self, client: MemsyControlClient) -> None:
        self._client = client

    def express(
        self,
        email: str,
        name: str,
        *,
        company: str | None = None,
        use_case: str | None = None,
        notes: str | None = None,
    ) -> ProInterestResponse:
        """
        Express interest in the Pro plan.

        :param email: Contact email address.
        :param name: Contact name.
        :param company: Optional company name.
        :param use_case: Optional description of intended use.
        :param notes: Optional free-form notes.
        """
        body: dict[str, Any] = {"email": email, "name": name}
        if company is not None:
            body["company"] = company
        if use_case is not None:
            body["use_case"] = use_case
        if notes is not None:
            body["notes"] = notes
        data, _, _ = self._client._request("POST", "/interest/pro", json=body)
        return ProInterestResponse.from_dict(data)

    def status(self) -> bool:
        """Return whether the authenticated org has already expressed Pro interest."""
        data, _, _ = self._client._request("GET", "/interest/pro/status")
        return bool((data or {}).get("expressed", False))


class AsyncInterestResource:
    """Async wrapper for api/ /interest/pro endpoints."""

    def __init__(self, client: AsyncMemsyControlClient) -> None:
        self._client = client

    async def express(
        self,
        email: str,
        name: str,
        *,
        company: str | None = None,
        use_case: str | None = None,
        notes: str | None = None,
    ) -> ProInterestResponse:
        """
        Express interest in the Pro plan.

        :param email: Contact email address.
        :param name: Contact name.
        :param company: Optional company name.
        :param use_case: Optional description of intended use.
        :param notes: Optional free-form notes.
        """
        body: dict[str, Any] = {"email": email, "name": name}
        if company is not None:
            body["company"] = company
        if use_case is not None:
            body["use_case"] = use_case
        if notes is not None:
            body["notes"] = notes
        data, _, _ = await self._client._request("POST", "/interest/pro", json=body)
        return ProInterestResponse.from_dict(data)

    async def status(self) -> bool:
        """Return whether the authenticated org has already expressed Pro interest."""
        data, _, _ = await self._client._request("GET", "/interest/pro/status")
        return bool((data or {}).get("expressed", False))
