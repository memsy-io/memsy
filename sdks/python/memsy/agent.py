"""Agent self-signup: an AI agent gets its own Memsy org and API key, with no human.

The agent proves who it is with AgentID (https://agentid.com), using its AgentMail
inbox. Memsy starts the sign-in, a headless browser opens the AgentID page, the agent
approves it with its own AgentMail key, and Memsy hands back an ``msy_`` key once::

    from memsy import MemsyClient, agent_signup

    creds = agent_signup("https://api.memsy.io", "my-agent@agentmail.to", agentmail_api_key)
    client = MemsyClient(base_url=creds.base_url, api_key=creds.api_key)

Needs the ``agent`` extra and a Chromium build for Playwright::

    pip install "memsy[agent]" && playwright install chromium

Signing up again with the same inbox returns the same org with a new key.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from urllib.parse import quote, urlsplit

import httpx

from memsy._http import HttpCoreMixin
from memsy.exceptions import AgentSignupError, MemsyConnectionError

AGENTID_ORIGIN = "https://auth.agentid.com"
# AgentMail keys go here and nowhere else — never to a URL read from a page.
_AGENTMAIL_AUTHORIZE = "https://api.agentmail.to/v0/inboxes/{inbox_id}/authorize"
# AgentID's machine-readable description of a sign-in waiting for the agent.
_SESSION_ACTION_META = 'meta[name="agentid-session-action"]'
_POLL_INTERVAL = 2.0
# AgentID's waiting page renders in seconds; anything slower is a different page.
_PAGE_TIMEOUT = 30.0
DEFAULT_TIMEOUT = 300.0


@dataclass(frozen=True)
class AgentCredentials:
    """What an agent needs to use Memsy after signing up."""

    base_url: str  # for MemsyClient / AsyncMemsyClient
    control_url: str  # for MemsyControlClient / AsyncMemsyControlClient
    api_key: str = field(repr=False)
    key_id: str
    org_id: str
    user_id: str


def agent_signup(
    base_url: str,
    inbox_id: str,
    agentmail_api_key: str,
    *,
    org_name: str | None = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> AgentCredentials:
    """Sign an agent up to Memsy and return its credentials. Blocking.

    Args:
        base_url: Memsy API root, e.g. ``"https://api.memsy.io"``. A ``/v1`` or ``/api``
            client URL is accepted too.
        inbox_id: The agent's AgentMail inbox, e.g. ``"my-agent@agentmail.to"``.
        agentmail_api_key: The agent's AgentMail API key. It is sent only to
            ``api.agentmail.to``, never to Memsy or AgentID.
        org_name: Name for a new org. Ignored when the agent already has one.
        timeout: Seconds to wait for the whole sign-in.

    Raises:
        AgentSignupError: The sign-in could not be completed.
        MemsyAPIError: Memsy rejected a request (e.g. ``RateLimitExceeded``).

    From async code, use :func:`async_agent_signup` instead.
    """
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(
            async_agent_signup(
                base_url, inbox_id, agentmail_api_key, org_name=org_name, timeout=timeout
            )
        )
    raise AgentSignupError(
        "agent_signup() cannot run inside an event loop; await async_agent_signup() instead."
    )


async def async_agent_signup(
    base_url: str,
    inbox_id: str,
    agentmail_api_key: str,
    *,
    org_name: str | None = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> AgentCredentials:
    """Async version of :func:`agent_signup`."""
    root = _api_root(base_url)
    deadline = time.monotonic() + timeout
    async with _http_client() as http:
        start = await _start(http, root, org_name)
        deadline = min(deadline, time.monotonic() + float(start.get("expires_in") or timeout))
        authorize_url = start["authorize_url"]
        if _origin(authorize_url) != AGENTID_ORIGIN:
            raise AgentSignupError(
                f"Memsy returned a sign-in URL outside {AGENTID_ORIGIN}; refusing to open it."
            )
        # The browser must stay open until AgentID redirects it to Memsy's callback,
        # which is what provisions the agent, so poll while it is still running.
        async with _browser_approval(authorize_url, inbox_id, agentmail_api_key, http, timeout):
            result = await _poll(http, root, start, deadline)
    return AgentCredentials(
        base_url=f"{root}/v1",
        control_url=f"{root}/api",
        api_key=result["api_key"],
        key_id=result["key_id"],
        org_id=result["org_id"],
        user_id=result["user_id"],
    )


def _http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=30.0)


def _api_root(base_url: str) -> str:
    root = base_url.rstrip("/")
    for suffix in ("/v1", "/api"):
        if root.endswith(suffix):
            return root[: -len(suffix)]
    return root


def _origin(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


def _raise_for(response: httpx.Response) -> None:
    if response.is_success:
        return
    try:
        detail = response.json().get("detail")
    except ValueError:
        detail = None
    if detail == "agent_signup_not_enabled":
        raise AgentSignupError("Agent signup is not enabled on this Memsy deployment.")
    if response.status_code == 410:
        raise AgentSignupError(
            "This signup's API key was already issued and can't be shown again. "
            "Start a new signup; it returns the same org with a new key."
        )
    raise HttpCoreMixin()._classify_error(response)


async def _send(http: httpx.AsyncClient, method: str, url: str, **kwargs) -> httpx.Response:
    try:
        return await http.request(method, url, **kwargs)
    except httpx.HTTPError as exc:
        raise MemsyConnectionError(f"Could not reach {_origin(url)}: {exc}") from exc


async def _start(http: httpx.AsyncClient, root: str, org_name: str | None) -> dict:
    body = {"org_name": org_name} if org_name else {}
    response = await _send(http, "POST", f"{root}/api/agents/signup", json=body)
    _raise_for(response)
    return response.json()


async def _poll(http: httpx.AsyncClient, root: str, start: dict, deadline: float) -> dict:
    url = f"{root}/api/agents/signup/{quote(start['signup_id'], safe='')}"
    headers = {"Authorization": f"Bearer {start['poll_secret']}"}
    while True:
        response = await _send(http, "GET", url, headers=headers)
        _raise_for(response)
        result = response.json()
        if result.get("status") == "complete":
            return result
        if result.get("status") == "error":
            raise AgentSignupError(f"Memsy could not complete the signup: {result.get('error')}")
        if time.monotonic() >= deadline:
            raise AgentSignupError("Agent signup timed out waiting for the AgentID sign-in.")
        await asyncio.sleep(_POLL_INTERVAL)


def _auth_token_from_session_action(page_url: str, meta_content: str) -> str:
    """Read the auth token from AgentID's ``agentid-session-action`` page metadata."""
    if _origin(page_url) != AGENTID_ORIGIN:
        raise AgentSignupError(f"Expected an AgentID page at {AGENTID_ORIGIN}, got {page_url}")
    try:
        action = json.loads(meta_content)
    except ValueError as exc:
        raise AgentSignupError("AgentID's sign-in page metadata is not valid JSON.") from exc
    if (
        action.get("type") != "agentid_session_required"
        or action.get("issuer") != AGENTID_ORIGIN
        or not action.get("auth_token")
    ):
        raise AgentSignupError("AgentID's sign-in page did not describe a waiting sign-in.")
    return action["auth_token"]


async def _agentmail_approve(
    http: httpx.AsyncClient, inbox_id: str, agentmail_api_key: str, auth_token: str
) -> None:
    url = _AGENTMAIL_AUTHORIZE.format(inbox_id=quote(inbox_id, safe=""))
    response = await _send(
        http,
        "POST",
        url,
        headers={"Authorization": f"Bearer {agentmail_api_key}"},
        json={"auth_token": auth_token, "accept_disclosure": True},
    )
    if not response.is_success:
        raise AgentSignupError(
            f"AgentMail rejected the sign-in approval ({response.status_code}): "
            f"{response.text[:200]}"
        )


@contextlib.asynccontextmanager
async def _browser_approval(
    authorize_url: str,
    inbox_id: str,
    agentmail_api_key: str,
    http: httpx.AsyncClient,
    timeout: float,
) -> AsyncIterator[None]:
    """Open the AgentID page headlessly, approve it, and keep the browser open."""
    try:
        from playwright.async_api import Error as PlaywrightError
        from playwright.async_api import async_playwright
    except ImportError as exc:
        raise AgentSignupError(
            'Agent signup needs Playwright: pip install "memsy[agent]" '
            "&& playwright install chromium"
        ) from exc

    async with async_playwright() as playwright:
        try:
            browser = await playwright.chromium.launch(headless=True)
        except PlaywrightError as exc:
            raise AgentSignupError(
                f"Could not start Chromium; run `playwright install chromium`. ({exc})"
            ) from exc
        try:
            page = await browser.new_page()
            await page.goto(authorize_url, wait_until="domcontentloaded")
            meta = page.locator(_SESSION_ACTION_META)
            try:
                await meta.wait_for(state="attached", timeout=min(timeout, _PAGE_TIMEOUT) * 1000)
            except PlaywrightError as exc:
                raise AgentSignupError(
                    f"AgentID's sign-in page never showed a waiting sign-in ({page.url})."
                ) from exc
            token = _auth_token_from_session_action(
                page.url, await meta.get_attribute("content") or ""
            )
            await _agentmail_approve(http, inbox_id, agentmail_api_key, token)
            yield
        finally:
            await browser.close()
