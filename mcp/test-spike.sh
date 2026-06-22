#!/usr/bin/env bash
#
# test-spike.sh — smoke test the hosted (remote) Memsy MCP server.
#
# Validates transport boot, OAuth discovery, the 401 auth challenge, and the
# full PKCE authorize->token round trip. No ChatGPT or live memsy-core needed.
#
# Usage:
#   ./test-spike.sh            # run tests (assumes already built)
#   ./test-spike.sh --build    # build the workspace first, then test
#   PORT=9000 ./test-spike.sh  # override the port (default 8099)
#
# Exit code is 0 only if every check passes.

set -u

# --- locate things -----------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"   # .../memsy/mcp
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"                     # .../memsy
PORT="${PORT:-8099}"
BASE="http://localhost:$PORT"
SERVER_JS="$SCRIPT_DIR/dist/http/server.js"
SRV_PID=""
FAILED=0

# --- helpers -----------------------------------------------------------------
pass() { printf "  \033[32m✓\033[0m %s\n" "$1"; }
fail() { printf "  \033[31m✗\033[0m %s\n" "$1"; FAILED=1; }
hdr()  { printf "\n\033[1m%s\033[0m\n" "$1"; }

stop_server() {
  if [ -n "$SRV_PID" ] && kill -0 "$SRV_PID" 2>/dev/null; then
    kill "$SRV_PID" 2>/dev/null
    wait "$SRV_PID" 2>/dev/null
  fi
  SRV_PID=""
  # Backstop: kill any stray instance, then block until the port is actually
  # free. Without this, a new server can hit EADDRINUSE while a stale one keeps
  # answering /healthz — making the next section silently test the wrong server.
  pkill -f "$SERVER_JS" 2>/dev/null
  for _ in $(seq 1 50); do
    curl -s "$BASE/healthz" >/dev/null 2>&1 || return 0
    sleep 0.1
  done
}

# start_server VAR=val VAR=val ...  (env overrides for this boot)
start_server() {
  env "$@" \
    MCP_PUBLIC_URL="$BASE" PORT="$PORT" MEMSY_SERVICE_API_KEY="msy_dummy" \
    node "$SERVER_JS" >/tmp/memsy-mcp-spike.log 2>&1 &
  SRV_PID=$!
  # wait for THIS process to answer /healthz (max ~5s). If the process dies
  # (e.g. EADDRINUSE), fail loudly instead of testing a stale server.
  for _ in $(seq 1 50); do
    if ! kill -0 "$SRV_PID" 2>/dev/null; then
      echo "server process exited during startup; log:" >&2
      cat /tmp/memsy-mcp-spike.log >&2
      exit 1
    fi
    if curl -s "$BASE/healthz" >/dev/null 2>&1; then return 0; fi
    sleep 0.1
  done
  echo "server failed to start; log:" >&2
  cat /tmp/memsy-mcp-spike.log >&2
  exit 1
}

cleanup() { stop_server; }
trap cleanup EXIT INT TERM

# --- 0. optional build -------------------------------------------------------
if [ "${1:-}" = "--build" ]; then
  hdr "0. Build"
  ( cd "$ROOT_DIR" \
    && npm install \
    && npm run build -w @memsy-io/memsy \
    && npm run build -w @memsy-io/mcp ) || { echo "build failed"; exit 1; }
fi

if [ ! -f "$SERVER_JS" ]; then
  echo "error: $SERVER_JS not found — run with --build first." >&2
  exit 1
fi

# --- 1. discovery + 401 challenge (dev-skip auth) ----------------------------
hdr "1. Discovery + 401 challenge (dev-skip auth)"
start_server MCP_DEV_SKIP_AUTH=1

PRM="$(curl -s "$BASE/.well-known/oauth-protected-resource")"
echo "$PRM" | grep -q '"scopes_supported":\["memory:read","memory:write"\]' \
  && pass "protected-resource scopes are exactly memory:read + memory:write" \
  || fail "protected-resource scopes wrong: $PRM"

ASM="$(curl -s "$BASE/.well-known/oauth-authorization-server")"
echo "$ASM" | grep -q '"token_endpoint_auth_methods_supported":\["none"\]' \
  && pass "token_endpoint_auth_methods is [\"none\"] (CIMD public client)" \
  || fail "auth_methods wrong: $ASM"
echo "$ASM" | grep -q '"code_challenge_methods_supported":\["S256"\]' \
  && pass "PKCE methods are S256-only" \
  || fail "code_challenge_methods wrong: $ASM"

HEALTH="$(curl -s "$BASE/healthz")"
[ "$HEALTH" = '{"status":"ok"}' ] && pass "/healthz ok" || fail "/healthz: $HEALTH"

# unauthenticated /mcp -> 401 with WWW-Authenticate header AND _meta challenge
RESP="$(curl -s -i -X POST "$BASE/mcp" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}')"
echo "$RESP" | grep -qi '^HTTP/1.1 401' \
  && pass "/mcp without token -> 401" || fail "/mcp status not 401"
echo "$RESP" | grep -qi '^WWW-Authenticate: Bearer' \
  && pass "WWW-Authenticate header present" || fail "WWW-Authenticate header missing"
echo "$RESP" | grep -q 'mcp/www_authenticate' \
  && pass "_meta[\"mcp/www_authenticate\"] present in body" || fail "_meta challenge missing"

stop_server

# --- 2. PKCE authorize -> token round trip (real auth path) ------------------
hdr "2. PKCE authorize -> token round trip"
start_server MCP_JWT_SECRET=testsecret123

# All positive + negative checks in one node block. Exits non-zero if any fail.
BASE="$BASE" node --input-type=module -e '
import crypto from "node:crypto";
const b64u = (b) => Buffer.from(b).toString("base64url");
const RES = process.env.BASE;
let failed = 0;
const ok = (c, m) => { console.log(`  ${c ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${m}`); if (!c) failed++; };

// Fresh PKCE pair + an authorized code.
const newPair = () => {
  const verifier = b64u(crypto.randomBytes(32));
  const challenge = b64u(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
};
const authorize = async (challenge) => {
  const url = `${RES}/authorize?redirect_uri=${encodeURIComponent("https://chatgpt.com/cb")}`
    + `&state=xyz&code_challenge=${challenge}&code_challenge_method=S256`
    + `&scope=${encodeURIComponent("memory:read memory:write")}&resource=${encodeURIComponent(RES)}`;
  const r = await fetch(url, { redirect: "manual" });
  const loc = r.headers.get("location");
  return { status: r.status, code: loc ? new URL(loc).searchParams.get("code") : null };
};
const token = (params) => fetch(`${RES}/token`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(params),
});

// Happy path.
const { verifier, challenge } = newPair();
const a = await authorize(challenge);
ok(a.status === 302 && !!a.code, `authorize -> 302 with code (got ${a.status})`);

const t = await token({ grant_type: "authorization_code", code: a.code, code_verifier: verifier, resource: RES });
const tok = await t.json();
ok(t.status === 200 && !!tok.access_token, `token -> 200 Bearer issued (got ${t.status})`);
if (tok.access_token) {
  const claims = JSON.parse(Buffer.from(tok.access_token.split(".")[1], "base64url").toString());
  ok(claims.aud === RES, `aud === resource (${claims.aud})`);
  ok(tok.scope === "memory:read memory:write", `scope == memory:read memory:write (${tok.scope})`);
  ok(!!claims.sub, `sub (actor_id) present (${claims.sub})`);
}

// Negative: wrong PKCE verifier must be rejected.
const p1 = newPair();
const a1 = await authorize(p1.challenge);
const bad = await token({ grant_type: "authorization_code", code: a1.code, code_verifier: "wrong-verifier", resource: RES });
ok(bad.status === 400, `wrong PKCE verifier -> 400 (got ${bad.status})`);

// Negative: a code is one-time use — replay must be rejected.
const p2 = newPair();
const a2 = await authorize(p2.challenge);
const body = { grant_type: "authorization_code", code: a2.code, code_verifier: p2.verifier, resource: RES };
const first = await token(body);
const replay = await token(body);
ok(first.status === 200 && replay.status === 400, `replayed code rejected -> first 200, replay 400 (got ${first.status}/${replay.status})`);

process.exit(failed === 0 ? 0 : 3);
'
[ $? -ne 0 ] && FAILED=1

stop_server

# --- summary -----------------------------------------------------------------
hdr "Result"
if [ "$FAILED" -eq 0 ]; then
  printf "\033[32mAll checks passed.\033[0m\n"
  echo "Next: real end-to-end needs a real MEMSY_SERVICE_API_KEY + ngrok + ChatGPT Developer Mode."
  exit 0
else
  printf "\033[31mSome checks failed.\033[0m Server log: /tmp/memsy-mcp-spike.log\n"
  exit 1
fi
