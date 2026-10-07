from __future__ import annotations

import re
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


# A surface as memsy-core parses it: `name` or `name/detail`. Core splits on
# the FIRST slash and sanitises each half separately, capping each at 64 — so
# the slash is structural and the cap is per segment, not on the whole string.
# An earlier version applied the per-segment charset to the whole value, which
# rejected `mcp/0.1.3` and would have rejected `connector/slack` too.
_SURFACE_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}(/[A-Za-z0-9._-]{1,64})?$")
_CAPTURE_MODES = ("ambient", "explicit")


def validate_provenance(surface: str | None, capture_mode: str | None) -> None:
    """Reject bad provenance options at CONSTRUCTION, not on every request.

    Rejected rather than sanitised, and early rather than late. httpx refuses a
    header it cannot encode, so `surface="acme-bot\u2122"` raises
    UnicodeEncodeError from deep inside the client — and Node, left alone,
    reports the same mistake as "Could not connect to Memsy" on every call
    including search. Neither tells the caller what the rule is.

    Quietly rewriting would be worse than erroring: core would store the
    sanitised form, and "why is my surface called acme-bot-" is a harder
    puzzle than a message naming the charset at the point of the mistake.

    Empty means NOT CONFIGURED and passes: `os.environ.get("MEMSY_SURFACE", "")`
    is an ordinary way to reach this, and the header is simply omitted.
    """
    if surface and not _SURFACE_RE.match(surface):
        raise ValueError(
            f"surface must be 'name' or 'name/detail', each 1-64 "
            f"characters of [A-Za-z0-9._-]; "
            f"received {surface!r}. memsy-core rewrites anything else, and a "
            f"character that cannot be sent as an HTTP header fails every request."
        )
    if capture_mode and capture_mode not in _CAPTURE_MODES:
        raise ValueError(
            f"capture_mode must be 'ambient' or 'explicit'; received "
            f"{capture_mode!r}. Core drops anything else, so the row would "
            f"silently carry no capture mode at all."
        )


def default_headers(
    api_key: str, surface: str | None = None, capture_mode: str | None = None
) -> dict[str, str]:
    """Headers every client sends on every request.

    Shared rather than repeated because there are FOUR clients here — sync and
    async, core and control — each building this dict at its own constructor. A
    header added to three of them is the kind of gap nothing fails on.

    X-Memsy-Client is the LIBRARY and is always true of this request;
    X-Memsy-Surface is whatever sits on top, set only by a wrapper that is
    itself the product the user chose. memsy-core resolves surface-then-client,
    so a plain application is recorded as sdk/python-sdk while the very same
    SDK inside a wrapper is recorded as that wrapper — without this layer
    knowing which it is in.

    Omitted rather than blank when there is no surface. Not for correctness —
    core resolves `surface or client`, so a blank surface falls through to the
    client header and records sdk/python-sdk either way. It is so the two SDKs
    put the same bytes on the wire for the same input; the Node client omits it
    too, and a difference there costs someone an afternoon diffing requests.
    """
    headers = {
        "Authorization": f"Bearer {api_key}",
        "X-Memsy-Client": "python-sdk",
    }
    if surface:
        headers["X-Memsy-Surface"] = surface
    # Only core can derive capture_mode for a KNOWN surface; `sdk` has no entry
    # in its table by design, so an SDK that does not send this leaves
    # capture_mode null on every row it produces.
    if capture_mode:
        headers["X-Memsy-Capture"] = capture_mode
    return headers


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
