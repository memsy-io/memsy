from __future__ import annotations

from typing import TYPE_CHECKING

from memsy.models import BillingSummary, Invoice

if TYPE_CHECKING:
    from memsy.async_control import AsyncMemsyControlClient
    from memsy.control import MemsyControlClient


class BillingResource:
    """Sync wrapper for api/ /billing endpoints.

    Note: these endpoints require ``org:admin`` role. An API key issued to a
    non-admin member will receive ``AuthorizationError(error_code="admin_required")``.
    Billing routes may also raise ``BillingNotEnabledError`` if the org is on the
    free tier.
    """

    def __init__(self, client: MemsyControlClient) -> None:
        self._client = client

    def summary(self) -> BillingSummary:
        """Return billing summary including tier, seats, and Stripe details."""
        data, _, _ = self._client._request("GET", "/billing/summary")
        return BillingSummary.from_dict(data)

    def invoices(self) -> list[Invoice]:
        """Return a list of past Stripe invoices. Returns empty list if billing is not enabled."""
        data, _, _ = self._client._request("GET", "/billing/invoices")
        return [Invoice.from_dict(i) for i in (data or [])]


class AsyncBillingResource:
    """Async wrapper for api/ /billing endpoints.

    Note: these endpoints require ``org:admin`` role. An API key issued to a
    non-admin member will receive ``AuthorizationError(error_code="admin_required")``.
    Billing routes may also raise ``BillingNotEnabledError`` if the org is on the
    free tier.
    """

    def __init__(self, client: AsyncMemsyControlClient) -> None:
        self._client = client

    async def summary(self) -> BillingSummary:
        """Return billing summary including tier, seats, and Stripe details."""
        data, _, _ = await self._client._request("GET", "/billing/summary")
        return BillingSummary.from_dict(data)

    async def invoices(self) -> list[Invoice]:
        """Return a list of past Stripe invoices. Returns empty list if billing is not enabled."""
        data, _, _ = await self._client._request("GET", "/billing/invoices")
        return [Invoice.from_dict(i) for i in (data or [])]
