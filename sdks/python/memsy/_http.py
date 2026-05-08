from __future__ import annotations

from typing import Any

import httpx

from memsy.exceptions import (
    AuthenticationError,
    AuthorizationError,
    BillingNotEnabledError,
    FeatureNotAvailable,
    KeyLimitReachedError,
    MemsyAPIError,
    OrgIdNotAllowedError,
    OrgLimitReachedError,
    RateLimitExceeded,
    SeatLimitReachedError,
    SeatRequiredError,
    UsageLimitExceeded,
)
from memsy.models import RateLimitInfo, UsageInfo

DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_BACKOFF = 1.0


def _detail_from_body(body: dict[str, Any], fallback: str = "") -> str:
    """Extract a human-readable detail string from a parsed error body."""
    detail = body.get("detail")
    if isinstance(detail, dict):
        return detail.get("message", "") or detail.get("error", "")
    if isinstance(detail, str) and detail:
        return detail
    return body.get("message", "") or body.get("error", "") or fallback


def _get_error_body(response: httpx.Response) -> tuple[dict[str, Any], str | None]:
    """Return (effective_body_dict, error_code) from a non-2xx response.

    Unwraps FastAPI's {"detail": {...}} envelope when the detail value is a dict.
    """
    try:
        body = response.json()
    except Exception:
        return {}, None

    detail = body.get("detail")
    effective: dict[str, Any] = {**body, **detail} if isinstance(detail, dict) else body
    return effective, effective.get("error")


class HttpCoreMixin:
    """Shared HTTP helpers for MemsyClient and MemsyControlClient.

    Provides header parsing and error classification. The _request method
    is not shared because sync vs async implementations differ.
    """

    def _parse_response_headers(
        self, response: httpx.Response
    ) -> tuple[UsageInfo | None, RateLimitInfo | None]:
        # Pass response.headers directly — it's case-insensitive so header names resolve
        # correctly. Converting to dict() would lowercase keys and break lookups.
        usage = UsageInfo.from_headers(response.headers)
        rate_limit = RateLimitInfo.from_headers(response.headers)
        usage = usage if any(v is not None for v in vars(usage).values()) else None
        rate_limit = (
            rate_limit if rate_limit.limit is not None or rate_limit.remaining is not None else None
        )
        return usage, rate_limit

    def _classify_error(self, response: httpx.Response) -> MemsyAPIError:
        status_code = response.status_code
        # Single JSON parse covers both error-code dispatch and detail extraction.
        body, error_code = _get_error_body(response)
        detail = _detail_from_body(body, response.text)

        if status_code == 400 and error_code == "org_id_not_allowed":
            return OrgIdNotAllowedError(
                f"org_id not allowed on this tier: {detail}",
                status_code=status_code,
                detail=detail,
                error_code=error_code,
                response=response,
            )

        if status_code == 401:
            return AuthenticationError(
                f"Authentication failed: {detail}",
                status_code=status_code,
                detail=detail,
                error_code=error_code,
                response=response,
            )

        if status_code == 403:
            # AWS API Gateway HTTP API v2 returns 403 with body {"message":"Forbidden"}
            # when the Lambda authorizer denies — semantically that's an auth failure
            # (invalid/revoked/missing key), not a scope or permission problem. Map it to
            # AuthenticationError so callers' except blocks behave correctly.
            if (
                error_code is None
                and len(body) == 1
                and body.get("message") == "Forbidden"
            ):
                return AuthenticationError(
                    f"Authentication failed: {detail}",
                    status_code=status_code,
                    detail=detail,
                    error_code=error_code,
                    response=response,
                )
            if error_code == "feature_not_available":
                return FeatureNotAvailable(
                    f"Feature not available: {detail}",
                    status_code=status_code,
                    detail=detail,
                    error_code=error_code,
                    response=response,
                    feature=body.get("feature"),
                    current_tier=body.get("current_tier"),
                    upgrade_url=body.get("upgrade_url"),
                )
            if error_code == "seat_required":
                return SeatRequiredError(
                    f"Seat required: {detail}",
                    status_code=status_code,
                    detail=detail,
                    error_code=error_code,
                    response=response,
                )
            if error_code == "org_limit_reached":
                return OrgLimitReachedError(
                    f"Org limit reached: {detail}",
                    status_code=status_code,
                    detail=detail,
                    error_code=error_code,
                    response=response,
                    limit=body.get("limit"),
                    current=body.get("current"),
                )
            if error_code == "key_limit_reached":
                return KeyLimitReachedError(
                    f"API key limit reached: {detail}",
                    status_code=status_code,
                    detail=detail,
                    error_code=error_code,
                    response=response,
                    limit=body.get("limit"),
                    current=body.get("current"),
                )
            if error_code == "billing_not_enabled":
                return BillingNotEnabledError(
                    f"Billing not enabled: {detail}",
                    status_code=status_code,
                    detail=detail,
                    error_code=error_code,
                    response=response,
                    interest_path=body.get("interest_path"),
                )
            if error_code in ("wrong_scope", "insufficient_scope") or "scope" in detail.lower():
                return AuthorizationError(
                    f"Authorization failed: {detail}",
                    status_code=status_code,
                    detail=detail,
                    error_code=error_code,
                    response=response,
                    required_scope=body.get("required_scope") or body.get("scope"),
                )
            return AuthorizationError(
                f"Authorization failed: {detail}",
                status_code=status_code,
                detail=detail,
                error_code=error_code,
                response=response,
            )

        if status_code == 409 and error_code == "seat_limit_reached":
            return SeatLimitReachedError(
                f"Seat limit reached: {detail}",
                status_code=status_code,
                detail=detail,
                error_code=error_code,
                response=response,
                purchased_seats=body.get("purchased_seats"),
                assigned_seats=body.get("assigned_seats"),
                pending_invites=body.get("pending_invites"),
            )

        if status_code == 429:
            retry_after = response.headers.get("Retry-After")
            retry_after_float = float(retry_after) if retry_after else None
            if error_code == "usage_limit_exceeded" or "quota" in detail.lower():
                return UsageLimitExceeded(
                    f"Usage limit exceeded: {detail}",
                    status_code=status_code,
                    detail=detail,
                    error_code=error_code,
                    response=response,
                    dimension=body.get("dimension"),
                    current=body.get("current"),
                    limit=body.get("limit"),
                    upgrade_url=body.get("upgrade_url"),
                )
            return RateLimitExceeded(
                f"Rate limit exceeded: {detail}",
                status_code=status_code,
                detail=detail,
                error_code=error_code,
                response=response,
                retry_after=retry_after_float,
            )

        return MemsyAPIError(
            f"Memsy API error {status_code}: {detail}",
            status_code=status_code,
            detail=detail,
            error_code=error_code,
            response=response,
        )
