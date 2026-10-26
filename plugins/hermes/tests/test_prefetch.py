import json
import sys
import types
from pathlib import Path

# Import the plugin package from plugins/hermes, whichever directory pytest starts in.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# The plugin imports Hermes' base class; stub it so the test runs without Hermes installed.
_agent = types.ModuleType("agent")
_mp = types.ModuleType("agent.memory_provider")
_mp.MemoryProvider = type("MemoryProvider", (), {})
sys.modules.setdefault("agent", _agent)
sys.modules.setdefault("agent.memory_provider", _mp)

from memory_provider import MemsyMemoryProvider  # noqa: E402


def _provider(response: dict) -> MemsyMemoryProvider:
    p = MemsyMemoryProvider.__new__(MemsyMemoryProvider)
    p._api_key = "test-key"
    p._search_body = lambda query, limit, threshold: {"query": query}
    p._post = lambda path, body: json.dumps(response)
    return p


# Shape of memsy-core's SearchResponse (memsy/http/schemas.py): results[] of
# {id, content, score, metadata}.
_SEARCH_RESPONSE = {
    "results": [
        {
            "id": "m1",
            "content": "User prefers tea",
            "score": 0.9,
            "metadata": {"memory_type": "preference"},
        },
        {"id": "m2", "content": "User lives in Pune", "score": 0.7, "metadata": None},
    ]
}


def test_prefetch_injects_results_from_search_response():
    out = _provider(_SEARCH_RESPONSE).prefetch("drinks")
    assert out.startswith("Relevant Memsy memories")
    assert "- User prefers tea" in out
    assert "- User lives in Pune" in out


def test_prefetch_truncates_long_content():
    long = {"results": [{"id": "m1", "content": "x" * 500, "score": 0.9}]}
    out = _provider(long).prefetch("q")
    assert "- " + "x" * 200 in out
    assert "x" * 201 not in out


def test_prefetch_empty_when_no_results():
    assert _provider({"results": []}).prefetch("drinks") == ""


def test_prefetch_skips_results_without_content():
    assert _provider({"results": [{"id": "m1", "content": "", "score": 0.9}]}).prefetch("q") == ""


def test_prefetch_empty_without_api_key():
    p = _provider(_SEARCH_RESPONSE)
    p._api_key = ""
    assert p.prefetch("drinks") == ""
