"""Where a memory came from, as this SDK reports it.

Two header levels that must not collapse into one: X-Memsy-Client names the
library and is always true, X-Memsy-Surface names whatever sits on top and only
a wrapper sets it. memsy-core resolves surface-then-client, so the SAME SDK is
recorded as sdk/python-sdk in an application and as the wrapper inside one.
Send only one of them and that distinction is gone.

Asserted on the constructed httpx client's default headers rather than on a
mocked request, because that is where all four clients set them — and four
constructors quietly disagreeing is the failure these tests exist to catch.
"""

from __future__ import annotations

import pytest

from memsy import (
    AsyncMemsyClient,
    AsyncMemsyControlClient,
    EventPayload,
    MemsyClient,
    MemsyControlClient,
)

_ALL_CLIENTS = [MemsyClient, AsyncMemsyClient, MemsyControlClient, AsyncMemsyControlClient]


def _headers(cls, **kw) -> dict[str, str]:
    client = cls(base_url="https://test.memsy.io", api_key="test_key", **kw)
    return dict(client._client.headers)


def _event(**kw) -> EventPayload:
    return EventPayload(
        actor_id="a1", session_id="s1", kind="user_message", content="hello", **kw
    )


class TestClientHeader:
    @pytest.mark.parametrize("cls", _ALL_CLIENTS)
    def test_every_client_identifies_the_library(self, cls):
        # The regression the shared default_headers() helper exists to prevent:
        # four constructors each built this dict independently, so a header
        # added to three of them would look done and silently mislabel the
        # fourth's traffic.
        assert _headers(cls)["x-memsy-client"] == "python-sdk"

    @pytest.mark.parametrize("cls", _ALL_CLIENTS)
    def test_authorization_survives(self, cls):
        # Guards the obvious regression in rebuilding this dict: dropping auth.
        assert _headers(cls)["authorization"] == "Bearer test_key"


class TestSurfaceHeader:
    @pytest.mark.parametrize("cls", _ALL_CLIENTS)
    def test_absent_when_the_caller_is_the_application(self, cls):
        # A plain application makes no claim about what sits on top of it, so
        # core falls back to the client header and records sdk/python-sdk.
        # Sending an empty surface would resolve the same way — core tries
        # `surface or client` — so this is about the two SDKs agreeing on the
        # wire, not about avoiding a wrong label.
        assert "x-memsy-surface" not in _headers(cls)

    @pytest.mark.parametrize("cls", _ALL_CLIENTS)
    def test_sent_when_a_wrapper_declares_itself(self, cls):
        headers = _headers(cls, surface="mcp")
        assert headers["x-memsy-surface"] == "mcp"
        # Both, not one: the client header stays true regardless.
        assert headers["x-memsy-client"] == "python-sdk"

    @pytest.mark.parametrize("cls", _ALL_CLIENTS)
    def test_an_empty_surface_is_treated_as_unset(self, cls):
        # surface="" is a caller mistake, not a claim. Core would resolve it
        # identically either way — `surface or client` falls through to the
        # client header — so this pins consistency with the Node SDK, which
        # also omits it, rather than guarding the stored value.
        assert "x-memsy-surface" not in _headers(cls, surface="")


class TestEventPayload:
    def test_the_three_fields_serialise(self):
        d = _event(
            source_id="acme/handbook:deploys.md",
            source_author_email="priya@acme.com",
            source_author_id="U0A1b2C3",
        ).to_dict()
        assert d["source_id"] == "acme/handbook:deploys.md"
        assert d["source_author_email"] == "priya@acme.com"
        assert d["source_author_id"] == "U0A1b2C3"

    def test_omitted_entirely_when_unset(self):
        # A caller who sets none of these must produce a body identical to one
        # built before the fields existed — present-and-null is not the same as
        # absent to a server that distinguishes them.
        d = _event().to_dict()
        assert "source_id" not in d
        assert "source_author_email" not in d
        assert "source_author_id" not in d

    def test_request_level_fields_never_appear_in_the_body(self):
        # source_type and source are headers. A body field would be a second,
        # unclamped route to a value core only honours from one place, which is
        # what makes connector and studio provenance unforgeable.
        d = _event(source_id="x").to_dict()
        assert "source_type" not in d
        assert "source" not in d
        assert "source_instance_id" not in d


class TestCaptureMode:
    @pytest.mark.parametrize("cls", _ALL_CLIENTS)
    def test_sent_when_the_integration_declares_one(self, cls):
        # memsy-core has no `sdk` entry in its derivation table, on purpose:
        # only the integration knows whether it sweeps conversations or saves
        # deliberately. An SDK that cannot send this leaves capture_mode null
        # on every row it ever produces.
        assert _headers(cls, capture_mode="ambient")["x-memsy-capture"] == "ambient"

    @pytest.mark.parametrize("cls", _ALL_CLIENTS)
    def test_absent_when_the_integration_says_nothing(self, cls):
        assert "x-memsy-capture" not in _headers(cls)

    @pytest.mark.parametrize("cls", _ALL_CLIENTS)
    def test_rejects_a_value_core_would_drop(self, cls):
        with pytest.raises(ValueError, match="ambient"):
            _headers(cls, capture_mode="sometimes")


class TestProvenanceValidation:
    """Rejected at construction, not on every request.

    httpx refuses a header it cannot encode, so surface="acme-bot™" raised
    UnicodeEncodeError from deep inside the client — while "bad\\nvalue" was
    accepted outright, diverging from Node, which rejected it. Neither told the
    caller what the rule was.
    """

    @pytest.mark.parametrize(
        "surface", ["acme-bot™", "bad\nvalue", "has space", "a" * 65]
    )
    def test_rejects_what_core_would_rewrite(self, surface):
        with pytest.raises(ValueError, match=r"A-Za-z0-9"):
            MemsyClient(base_url="https://test.memsy.io", api_key="k", surface=surface)

    @pytest.mark.parametrize("surface", ["mcp", "mcp-hosted", "my-bot", "acme_agent", "v1.2"])
    def test_accepts_what_core_keeps_verbatim(self, surface):
        MemsyClient(base_url="https://test.memsy.io", api_key="k", surface=surface).close()

    @pytest.mark.parametrize("cls", _ALL_CLIENTS)
    def test_empty_is_not_configured_rather_than_invalid(self, cls):
        # os.environ.get("MEMSY_SURFACE", "") is an ordinary way to reach this.
        # Throwing on an unset variable would be hostile; the header is simply
        # omitted, matching the Node SDK.
        assert "x-memsy-surface" not in _headers(cls, surface="")

    def test_every_client_validates(self):
        # The same gap default_headers() exists to prevent: four constructors,
        # and a check added to three of them looks done.
        for cls in _ALL_CLIENTS:
            with pytest.raises(ValueError):
                cls(base_url="https://test.memsy.io", api_key="k", surface="nope!")


class TestBlankEventFields:
    """`source_id=row.file_id or ""` is the shape that produces these.

    A blank is worse than a value or an absence: it matches no real object,
    and is invisible to "events with no source" because the field exists — so
    the row escapes both halves of a question that should be exhaustive.
    """

    @pytest.mark.parametrize(
        "field", ["source_id", "source_author_email", "source_author_id"]
    )
    def test_empty_is_omitted(self, field):
        assert field not in _event(**{field: ""}).to_dict()

    def test_real_values_still_sent(self):
        assert _event(source_id="repo:file.py").to_dict()["source_id"] == "repo:file.py"

    def test_whitespace_is_not_caught_here(self):
        # Documented rather than fixed: " " is truthy in Python, so a
        # client-side falsy check cannot catch it. memsy-core's
        # _optional_strings_no_null strips before testing, which is why that
        # is the real guard and this is only consistency.
        assert _event(source_id=" ").to_dict()["source_id"] == " "
