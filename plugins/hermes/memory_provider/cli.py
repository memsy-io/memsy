"""CLI commands for the Memsy memory provider.

Registers: hermes memsy status
           hermes memsy config

Only shown when memory.provider: memsy is active in config.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request


def _status() -> None:
    api_key = os.environ.get("MEMSY_API_KEY", "")
    base_url = os.environ.get("MEMSY_BASE_URL", "https://api.memsy.io")

    if not api_key:
        print("✗ MEMSY_API_KEY not set")
        print("  Set it with: export MEMSY_API_KEY=msy_...")
        return

    try:
        req = urllib.request.Request(
            f"{base_url}/health",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        print(f"✓ Memsy connected — {data.get('status', 'ok')}")
        print(f"  Base URL : {base_url}")
        print(f"  API key  : {api_key[:8]}...")
        if "version" in data:
            print(f"  Version  : {data['version']}")
    except urllib.error.URLError as exc:
        print(f"✗ Memsy unreachable: {exc.reason}")
    except Exception as exc:
        print(f"✗ Error: {exc}")


def _config() -> None:
    api_key = os.environ.get("MEMSY_API_KEY", "")
    base_url = os.environ.get("MEMSY_BASE_URL", "https://api.memsy.io (default)")
    print(f"MEMSY_API_KEY  : {'set (' + api_key[:8] + '...)' if api_key else 'not set'}")
    print(f"MEMSY_BASE_URL : {base_url}")
    print()
    print("To change: export MEMSY_API_KEY=msy_...  before starting Hermes")
    print("Or run:    hermes memory setup")


def _handle(args) -> None:
    subcmd = getattr(args, "memsy_cmd", None)
    if subcmd == "status":
        _status()
    elif subcmd == "config":
        _config()
    else:
        print("Usage: hermes memsy <status|config>")


def register_cli(subparser) -> None:
    subs = subparser.add_subparsers(dest="memsy_cmd")
    subs.add_parser("status", help="Check Memsy connectivity and active API key")
    subs.add_parser("config", help="Show current Memsy config and env vars")
    subparser.set_defaults(func=_handle)
