from __future__ import annotations

from typing import TYPE_CHECKING

from memsy.models import UsageSummaryResponse, UsageTimeseriesResponse

if TYPE_CHECKING:
    from memsy.async_control import AsyncMemsyControlClient
    from memsy.control import MemsyControlClient


class UsageResource:
    """Sync wrapper for api/ /usage endpoints.

    Note: these endpoints require ``org:admin`` role. An API key issued to a
    non-admin member will receive ``AuthorizationError(error_code="admin_required")``.
    """

    def __init__(self, client: MemsyControlClient) -> None:
        self._client = client

    def summary(self) -> UsageSummaryResponse:
        """Return usage summary for the current billing period."""
        data, _, _ = self._client._request("GET", "/usage/summary")
        return UsageSummaryResponse.from_dict(data)

    def timeseries(
        self,
        *,
        dimension: str | None = None,
        granularity: str = "daily",
        period_start: str | None = None,
        period_end: str | None = None,
    ) -> UsageTimeseriesResponse:
        """
        Return timeseries usage data.

        :param dimension: Optional dimension filter (e.g. ``"api_calls"``).
        :param granularity: ``"daily"`` (default) or ``"hourly"``.
        :param period_start: ISO 8601 start date (inclusive).
        :param period_end: ISO 8601 end date (inclusive).
        """
        params: dict[str, object] = {"granularity": granularity}
        if dimension is not None:
            params["dimension"] = dimension
        if period_start is not None:
            params["period_start"] = period_start
        if period_end is not None:
            params["period_end"] = period_end
        data, _, _ = self._client._request("GET", "/usage/timeseries", params=params)
        return UsageTimeseriesResponse.from_dict(data)


class AsyncUsageResource:
    """Async wrapper for api/ /usage endpoints.

    Note: these endpoints require ``org:admin`` role. An API key issued to a
    non-admin member will receive ``AuthorizationError(error_code="admin_required")``.
    """

    def __init__(self, client: AsyncMemsyControlClient) -> None:
        self._client = client

    async def summary(self) -> UsageSummaryResponse:
        """Return usage summary for the current billing period."""
        data, _, _ = await self._client._request("GET", "/usage/summary")
        return UsageSummaryResponse.from_dict(data)

    async def timeseries(
        self,
        *,
        dimension: str | None = None,
        granularity: str = "daily",
        period_start: str | None = None,
        period_end: str | None = None,
    ) -> UsageTimeseriesResponse:
        """
        Return timeseries usage data.

        :param dimension: Optional dimension filter (e.g. ``"api_calls"``).
        :param granularity: ``"daily"`` (default) or ``"hourly"``.
        :param period_start: ISO 8601 start date (inclusive).
        :param period_end: ISO 8601 end date (inclusive).
        """
        params: dict[str, object] = {"granularity": granularity}
        if dimension is not None:
            params["dimension"] = dimension
        if period_start is not None:
            params["period_start"] = period_start
        if period_end is not None:
            params["period_end"] = period_end
        data, _, _ = await self._client._request("GET", "/usage/timeseries", params=params)
        return UsageTimeseriesResponse.from_dict(data)
