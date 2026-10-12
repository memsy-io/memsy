from __future__ import annotations

from typing import Any


class MemsyError(Exception):
    """Base exception for all Memsy SDK errors."""


class MemsyConnectionError(MemsyError):
    """Raised when the SDK cannot reach the Memsy endpoint (network or timeout)."""


class MemsyAPIError(MemsyError):
    """Raised when the Memsy API returns a non-2xx response."""

    def __init__(
        self,
        message: str,
        status_code: int,
        detail: str = "",
        error_code: str | None = None,
        response: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.detail = detail
        self.error_code = error_code
        self.response = response

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(status_code={self.status_code}, detail={self.detail!r})"


class AuthenticationError(MemsyAPIError):
    """Raised when the API key is missing or invalid (401)."""


class AuthorizationError(MemsyAPIError):
    """Raised when the API key lacks the required scope (403)."""

    def __init__(
        self,
        message: str,
        status_code: int = 403,
        detail: str = "",
        error_code: str | None = None,
        response: Any = None,
        required_scope: str | None = None,
    ) -> None:
        super().__init__(message, status_code, detail, error_code, response)
        self.required_scope = required_scope


class FeatureNotAvailable(MemsyAPIError):
    """Raised when the customer's tier doesn't include a feature (403)."""

    def __init__(
        self,
        message: str,
        status_code: int = 403,
        detail: str = "",
        error_code: str | None = None,
        response: Any = None,
        feature: str | None = None,
        current_tier: str | None = None,
        upgrade_url: str | None = None,
    ) -> None:
        super().__init__(message, status_code, detail, error_code, response)
        self.feature = feature
        self.current_tier = current_tier
        self.upgrade_url = upgrade_url


class OrgIdNotAllowedError(MemsyAPIError):
    """Raised when a free-tier client supplies org_id in the request body (400)."""


class SeatRequiredError(MemsyAPIError):
    """Raised when the endpoint requires an assigned seat (403)."""


class OrgLimitReachedError(MemsyAPIError):
    """Raised when the org tier limit is reached (403)."""

    def __init__(
        self,
        message: str,
        status_code: int = 403,
        detail: str = "",
        error_code: str | None = None,
        response: Any = None,
        limit: int | None = None,
        current: int | None = None,
    ) -> None:
        super().__init__(message, status_code, detail, error_code, response)
        self.limit = limit
        self.current = current


class KeyLimitReachedError(MemsyAPIError):
    """Raised when the API key tier limit is reached (403)."""

    def __init__(
        self,
        message: str,
        status_code: int = 403,
        detail: str = "",
        error_code: str | None = None,
        response: Any = None,
        limit: int | None = None,
        current: int | None = None,
    ) -> None:
        super().__init__(message, status_code, detail, error_code, response)
        self.limit = limit
        self.current = current


class BillingNotEnabledError(MemsyAPIError):
    """Raised when a billing endpoint is called but billing is not enabled (403)."""

    def __init__(
        self,
        message: str,
        status_code: int = 403,
        detail: str = "",
        error_code: str | None = None,
        response: Any = None,
        interest_path: str | None = None,
    ) -> None:
        super().__init__(message, status_code, detail, error_code, response)
        self.interest_path = interest_path


class SeatLimitReachedError(MemsyAPIError):
    """Raised when an org's seat limit is reached (409)."""

    def __init__(
        self,
        message: str,
        status_code: int = 409,
        detail: str = "",
        error_code: str | None = None,
        response: Any = None,
        purchased_seats: int | None = None,
        assigned_seats: int | None = None,
        pending_invites: int | None = None,
    ) -> None:
        super().__init__(message, status_code, detail, error_code, response)
        self.purchased_seats = purchased_seats
        self.assigned_seats = assigned_seats
        self.pending_invites = pending_invites


class RateLimitExceeded(MemsyAPIError):
    """Raised when rate limit is exceeded (429)."""

    def __init__(
        self,
        message: str,
        status_code: int = 429,
        detail: str = "",
        error_code: str | None = None,
        response: Any = None,
        retry_after: float | None = None,
    ) -> None:
        super().__init__(message, status_code, detail, error_code, response)
        self.retry_after = retry_after


class UsageLimitExceeded(MemsyAPIError):
    """Raised when usage quota is exceeded (429)."""

    def __init__(
        self,
        message: str,
        status_code: int = 429,
        detail: str = "",
        error_code: str | None = None,
        response: Any = None,
        dimension: str | None = None,
        current: int | None = None,
        limit: int | None = None,
        upgrade_url: str | None = None,
    ) -> None:
        super().__init__(message, status_code, detail, error_code, response)
        self.dimension = dimension
        self.current = current
        self.limit = limit
        self.upgrade_url = upgrade_url
