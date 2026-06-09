#!/usr/bin/env bash
# identity-parity.sh — guards the cross-language actor_id contract.
#
# WHY THIS EXISTS
#   Turn-sync (scripts/post-response.sh, Python) writes memories tagged with an
#   actor_id; the MCP server (mcp/src/identity.ts, Node) derives the actor_id
#   that memsy_search / memsy_list_memories read back. If the two languages ever
#   disagree on the derivation, memories stored by one become INVISIBLE to recall
#   via the other — a silent, hard-to-diagnose failure. Both sides implement the
#   same primitive:
#
#       actor_id = sha256(parts.join("|")).hexdigest()[:16]
#
#   where, for the git-email tier, parts = [profile, git_email]. This test pins
#   that contract: it asserts Node and Python produce byte-identical output for a
#   battery of vectors (incl. unicode and an embedded separator), AND checks each
#   against a golden constant so an accidental algorithm change in EITHER language
#   is caught — not just a change that happens to drift both in lockstep.
#
# RUN
#   bash plugins/claude-code/tests/identity-parity.sh
#   (requires python3 and node — both are already prerequisites of the plugin)
#
# Exit 0 = parity holds. Exit 1 = a mismatch (do not ship).

set -eu

if ! command -v python3 >/dev/null 2>&1; then
  echo "SKIP: python3 not found" >&2
  exit 0
fi
if ! command -v node >/dev/null 2>&1; then
  echo "SKIP: node not found" >&2
  exit 0
fi

# Canonical derivation in each language. These MUST mirror, respectively:
#   - scripts/post-response.sh  ->  _hash_id(*parts)
#   - mcp/src/identity.ts       ->  the sha256(parts.join("|")).slice(0,16) path
py_hash() {
  python3 -c 'import hashlib,sys; print(hashlib.sha256("|".join(sys.argv[1:]).encode()).hexdigest()[:16])' "$@"
}
node_hash() {
  node -e 'const c=require("crypto");const a=process.argv.slice(1);process.stdout.write(c.createHash("sha256").update(a.join("|")).digest("hex").slice(0,16))' "$@"
}

# vector  =  "<profile>|<email>|<golden-actor-id>"
# Goldens were captured from a live node==python run (2026-06-08); regenerate by
# running py_hash / node_hash if you ever intentionally change the algorithm.
vectors=(
  "default|neel@calfus.com|6c197ffdb142f0f0"
  "work|dev@example.com|0c15228ea1bab1a5"
  "default|josé@münchen.de|3216ad8ef1b5f182"
  "personal|user@host.local|a68905cb222e2a97"
)

fail=0
for vec in "${vectors[@]}"; do
  IFS='|' read -r profile email golden <<<"$vec"
  py="$(py_hash "$profile" "$email")"
  nd="$(node_hash "$profile" "$email")"

  if [[ "$py" != "$nd" ]]; then
    printf 'FAIL  %-30s python=%s != node=%s\n' "$profile|$email" "$py" "$nd"
    fail=1
  elif [[ "$py" != "$golden" ]]; then
    printf 'FAIL  %-30s value=%s != golden=%s (algorithm changed?)\n' "$profile|$email" "$py" "$golden"
    fail=1
  else
    printf 'ok    %-30s %s\n' "$profile|$email" "$py"
  fi
done

if [[ "$fail" -ne 0 ]]; then
  echo "identity parity: FAILED — turn-sync and the MCP would derive different actor_ids" >&2
  exit 1
fi
echo "identity parity: OK — Node and Python agree across ${#vectors[@]} vectors"
