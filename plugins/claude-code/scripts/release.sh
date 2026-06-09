#!/usr/bin/env bash
# release.sh — bump the Memsy Claude Code plugin version so users actually
# receive updates.
#
# WHY THIS EXISTS
#   Claude Code keys plugin updates off the `version` field. With an explicit
#   version, `claude plugin update` / `/plugin update` deliver changes ONLY
#   after you bump it — pushing commits alone does nothing (Claude Code keeps
#   the cached copy and reports "already at the latest version"). See
#   https://code.claude.com/docs/en/plugins-reference#version-management
#
#   The version lives in two places that must agree (plugin.json is
#   authoritative; the marketplace entry is what the listing shows). This script
#   bumps BOTH in lockstep so they can never drift, with a surgical edit that
#   leaves the rest of each file untouched.
#
# USAGE
#   ./scripts/release.sh                  # show the current version
#   ./scripts/release.sh patch            # 0.1.0 -> 0.1.1  (bug fixes)
#   ./scripts/release.sh minor            # 0.1.0 -> 0.2.0  (new features)
#   ./scripts/release.sh major            # 0.1.0 -> 1.0.0  (breaking changes)
#   ./scripts/release.sh 1.4.2            # set an explicit semver
#   ./scripts/release.sh patch --commit   # also stage + commit the bump
#
#   After running, push the commit. Users then update with:
#       claude plugin update memsy@memsy          (or /plugin update)

set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
plugin_dir="$(dirname "$here")"                       # plugins/claude-code
repo_root="$(git -C "$plugin_dir" rev-parse --show-toplevel)"
manifest="$plugin_dir/.claude-plugin/plugin.json"     # authoritative
marketplace="$repo_root/.claude-plugin/marketplace.json"

for f in "$manifest" "$marketplace"; do
  [[ -f "$f" ]] || { echo "error: not found: $f" >&2; exit 1; }
done
command -v python3 >/dev/null 2>&1 || { echo "error: python3 required" >&2; exit 1; }

print_help() { sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; }

spec=""
do_commit=0
for a in "$@"; do
  case "$a" in
    --commit)        do_commit=1 ;;
    --current)       spec="__show__" ;;
    -h|--help)       print_help; exit 0 ;;
    patch|minor|major) spec="$a" ;;
    *)
      if [[ "$a" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then spec="$a"
      else echo "error: unknown argument '$a' (expected patch|minor|major|X.Y.Z|--commit|--current)" >&2; exit 2; fi ;;
  esac
done
[[ -z "$spec" ]] && spec="__show__"

# Compute + (optionally) apply the bump in python; prints "OLD NEW" on stdout.
out="$(python3 - "$manifest" "$marketplace" "$spec" <<'PY'
import json, re, sys

manifest, marketplace, spec = sys.argv[1], sys.argv[2], sys.argv[3]
VER_RE = re.compile(r'("version"\s*:\s*")([^"]+)(")')
SEMVER = re.compile(r'^\d+\.\d+\.\d+$')

def current(path):
    with open(path) as f:
        m = VER_RE.search(f.read())
    return m.group(2) if m else None

cur = current(manifest)
if not cur or not SEMVER.match(cur):
    sys.stderr.write(f"error: plugin.json version is missing or not semver: {cur!r}\n"); sys.exit(2)

mk = current(marketplace)
if mk and mk != cur:
    sys.stderr.write(f"warning: marketplace version ({mk}) differs from plugin.json ({cur}); both will be set to the new value\n")

if spec == '__show__':
    print(cur, cur); sys.exit(0)

major, minor, patch = (int(x) for x in cur.split('.'))
if   spec == 'patch': new = f"{major}.{minor}.{patch + 1}"
elif spec == 'minor': new = f"{major}.{minor + 1}.0"
elif spec == 'major': new = f"{major + 1}.0.0"
elif SEMVER.match(spec): new = spec
else:
    sys.stderr.write(f"error: expected patch|minor|major or X.Y.Z, got {spec!r}\n"); sys.exit(2)

if new == cur:
    sys.stderr.write(f"error: new version equals current ({cur}); nothing to do\n"); sys.exit(2)

# Surgical, single-field replacement preserves each file's existing formatting.
for path in (manifest, marketplace):
    with open(path) as f:
        txt = f.read()
    txt2, n = VER_RE.subn(rf'\g<1>{new}\g<3>', txt, count=1)
    if n != 1:
        sys.stderr.write(f"error: expected exactly one version field in {path} (found {n})\n"); sys.exit(2)
    # Sanity: the file must still parse as JSON after the edit.
    try:
        json.loads(txt2)
    except Exception as e:
        sys.stderr.write(f"error: edit would corrupt {path}: {e}\n"); sys.exit(2)
    with open(path, 'w') as f:
        f.write(txt2)

print(cur, new)
PY
)"

read -r OLD NEW <<<"$out"

if [[ "$spec" == "__show__" ]]; then
  echo "memsy (claude-code) version: $OLD"
  echo "Bump it with:  ./scripts/release.sh patch|minor|major   (or an explicit X.Y.Z)"
  exit 0
fi

echo "✓ version bumped: $OLD → $NEW"
echo "    $manifest"
echo "    $marketplace"

if [[ "$do_commit" == 1 ]]; then
  git -C "$repo_root" add "$manifest" "$marketplace"
  git -C "$repo_root" commit -q -m "chore(claude-code): release v$NEW"
  echo "✓ committed: chore(claude-code): release v$NEW"
fi

echo ""
echo "Next: push the commit. Users then receive it with:"
echo "    claude plugin update memsy@memsy        (or /plugin update)"
