"""The ``memsy`` command.

``memsy agent signup`` signs an AI agent up to Memsy with its AgentMail inbox and
prints shell exports for the new key, so a script can do::

    eval "$(memsy agent signup --inbox my-agent@agentmail.to --base-url https://api.memsy.io)"

The AgentMail key is read only from the ``AGENTMAIL_API_KEY`` environment variable, so
it never lands in shell history or a process listing.
"""

from __future__ import annotations

import argparse
import os
import shlex
import sys

from memsy.agent import agent_signup
from memsy.exceptions import MemsyError


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="memsy")
    commands = parser.add_subparsers(dest="command", required=True)
    agent = commands.add_parser("agent", help="AI agent commands")
    agent_commands = agent.add_subparsers(dest="agent_command", required=True)
    signup = agent_commands.add_parser(
        "signup",
        help="Sign this agent up with its AgentMail inbox and print its Memsy key",
        description="Needs AGENTMAIL_API_KEY in the environment and the memsy[agent] extra.",
    )
    signup.add_argument("--inbox", required=True, help="AgentMail inbox, e.g. bot@agentmail.to")
    signup.add_argument(
        "--base-url",
        default=os.environ.get("MEMSY_BASE_URL"),
        help="Memsy API root (default: $MEMSY_BASE_URL)",
    )
    signup.add_argument("--org-name", help="Name for a new org (ignored if one exists)")
    args = parser.parse_args(argv)

    agentmail_api_key = os.environ.get("AGENTMAIL_API_KEY")
    if not agentmail_api_key:
        print("memsy: set AGENTMAIL_API_KEY to the agent's AgentMail key", file=sys.stderr)
        return 2
    if not args.base_url:
        print("memsy: pass --base-url or set MEMSY_BASE_URL", file=sys.stderr)
        return 2

    try:
        creds = agent_signup(args.base_url, args.inbox, agentmail_api_key, org_name=args.org_name)
    except MemsyError as exc:
        print(f"memsy: agent signup failed: {exc}", file=sys.stderr)
        return 1

    print(
        f"Signed up: org={creds.org_id} user={creds.user_id} key_id={creds.key_id}", file=sys.stderr
    )
    print(f"export MEMSY_BASE_URL={shlex.quote(creds.base_url)}")
    print(f"export MEMSY_API_KEY={shlex.quote(creds.api_key)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
