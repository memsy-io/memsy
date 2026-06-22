# Hosted (remote) Memsy MCP server — P0 spike

A Streamable-HTTP MCP server that ChatGPT (Developer Mode / Apps) talks to. It
is a **separate entry point** from the stdio server (`src/server.ts`), which is
left completely untouched. Same `MemsyClient` SDK underneath; different
transport + auth.

```
src/http/
  config.ts    env-driven config (service key, base url, issuer, resource, scopes)
  auth.ts      .well-known docs, CIMD, JWT verify, WWW-Authenticate challenge
  context.ts   per-request context: MemsyClient + actor_id/org_id from the JWT
  tools.ts     search / fetch / save  (annotations + structuredContent double-return)
  server.ts    Express app: /mcp, /.well-known/*, /authorize, /token, /healthz
```

## Auth model

Model A (plan step 7): the server holds **one service key** to memsy-core and
**forces `actor_id` / `org_id` from the validated JWT** on every call. No
per-user `msy_` keys are stored. The caller cannot widen actor scope.

## Run it

```bash
cd memsy/mcp
npm install            # pulls express, jose, and the MCP SDK (needs >=1.10 for
                       # StreamableHTTPServerTransport — see note below)
npm run build

# Fastest path to a working ChatGPT connection — skip real auth, fixed identity:
MCP_DEV_SKIP_AUTH=1 \
MCP_PUBLIC_URL=https://<your-tunnel>.ngrok.app \
MEMSY_BASE_URL=https://api.memsy.io/v1 \
MEMSY_SERVICE_API_KEY=msy_... \
npm run start:http
```

> **dev-skip still does full OAuth.** `MCP_DEV_SKIP_AUTH=1` only bypasses token
> *verification* on `/mcp` — ChatGPT doesn't know that and still runs the real
> `/authorize` → `/token` flow, so `/token` must be able to *sign* a token. If
> you don't set `MCP_JWT_SECRET`, the server now auto-generates an ephemeral one
> at boot (logged as a warning) so this works out of the box. Set
> `MCP_JWT_SECRET` explicitly for tokens that survive a restart. (Forgetting
> this is what produced repeated `/token` 500s and ChatGPT's "something went
> wrong" — see gotcha 4.)

Then expose `:8080` over HTTPS (e.g. `ngrok http 8080`) and in ChatGPT:
Settings → Apps → Advanced → **Developer Mode** → Create app → paste
`https://<your-tunnel>.ngrok.app/mcp`.

### Exercising real OAuth (no dev-skip)

```bash
MCP_PUBLIC_URL=https://<tunnel> \
MCP_JWT_SECRET=$(openssl rand -hex 32) \
MEMSY_SERVICE_API_KEY=msy_... \
npm run start:http
```

The spike's `/authorize` skips the Clerk login UI and mints a code for a dev
identity, then `/token` does real PKCE (S256) + CIMD validation and returns a
signed Bearer token. This is enough to verify ChatGPT's
authorize → token → Bearer round trip end to end.

## Env vars

| var | required | meaning |
|---|---|---|
| `MCP_PUBLIC_URL` | yes (prod) | public origin; basis for `.well-known` URLs, `resource`, `aud` |
| `MEMSY_SERVICE_API_KEY` | yes (unless dev-skip) | service key used to call memsy-core |
| `MEMSY_BASE_URL` | no | memsy-core hot-path URL (default `https://api.memsy.io/v1`) |
| `MCP_ISSUER` | no | OAuth issuer (default = public URL) |
| `MCP_RESOURCE` | no | expected token `aud` (default = public URL) |
| `MCP_JWT_SECRET` | dev | HS256 secret to sign/verify spike tokens |
| `MCP_JWKS_URL` | prod | JWKS to verify RS256 tokens (e.g. Clerk) |
| `MCP_LOGIN_URL` | no | where `/authorize` will redirect for login (P1) |
| `MCP_DEV_SKIP_AUTH` | no | `1` = skip verification, inject dev identity |
| `PORT` | no | bind port (default 8080) |

## Testing locally

These are the exact smoke tests used to verify the spike — no ChatGPT or
memsy-core needed. They check transport boot, discovery, the 401 challenge, and
the full PKCE round trip.

### 0. Build

```bash
# from the memsy/ workspace root
npm install
npm run build -w @memsy-io/memsy   # SDK first, so its dist/ types resolve
npm run build -w @memsy-io/mcp     # builds dist/http/server.js
```

### 1. Discovery + 401 challenge (dev-skip auth)

```bash
cd mcp
MCP_DEV_SKIP_AUTH=1 MCP_PUBLIC_URL=http://localhost:8099 PORT=8099 \
  MEMSY_SERVICE_API_KEY=msy_dummy node dist/http/server.js &

curl -s http://localhost:8099/.well-known/oauth-protected-resource | jq
curl -s http://localhost:8099/.well-known/oauth-authorization-server | jq
curl -s http://localhost:8099/healthz
# No bearer -> 401 with WWW-Authenticate header AND _meta["mcp/www_authenticate"]
curl -s -i -X POST http://localhost:8099/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' | head -12
```

Expect: `scopes_supported` is exactly `["memory:read","memory:write"]`,
`token_endpoint_auth_methods_supported` is `["none"]`,
`code_challenge_methods_supported` is `["S256"]`, and the `/mcp` call returns
`401` carrying both the header and the `_meta` challenge.

### 2. PKCE authorize → token round trip (real auth path)

Boot WITHOUT dev-skip and with a signing secret:

```bash
MCP_PUBLIC_URL=http://localhost:8099 PORT=8099 \
  MCP_JWT_SECRET=testsecret123 MEMSY_SERVICE_API_KEY=msy_dummy \
  node dist/http/server.js &
```

Then run the round-trip checker (Node, no deps):

```bash
node --input-type=module -e '
const crypto = await import("node:crypto");
const b64u = (b) => Buffer.from(b).toString("base64url");
const verifier = b64u(crypto.randomBytes(32));
const challenge = b64u(crypto.createHash("sha256").update(verifier).digest());
const RES = "http://localhost:8099";
const authUrl = `${RES}/authorize?redirect_uri=${encodeURIComponent("https://chatgpt.com/cb")}`
  + `&state=xyz&code_challenge=${challenge}&code_challenge_method=S256`
  + `&scope=${encodeURIComponent("memory:read memory:write")}&resource=${encodeURIComponent(RES)}`;
const a = await fetch(authUrl, { redirect: "manual" });
const code = new URL(a.headers.get("location")).searchParams.get("code");
console.log("authorize ->", a.status, "code:", !!code);
const t = await fetch(`${RES}/token`, { method:"POST",
  headers:{"content-type":"application/x-www-form-urlencoded"},
  body: new URLSearchParams({ grant_type:"authorization_code", code, code_verifier:verifier, resource: RES })});
const tok = await t.json();
const claims = JSON.parse(Buffer.from(tok.access_token.split(".")[1], "base64url").toString());
console.log("token ->", t.status, "scope:", tok.scope);
console.log("aud==resource:", claims.aud === RES, "| sub:", claims.sub, "| iss:", claims.iss);
// negatives: wrong verifier and replayed code must both 400
const a2 = await fetch(authUrl, { redirect:"manual" });
const code2 = new URL(a2.headers.get("location")).searchParams.get("code");
const bad = await fetch(`${RES}/token`, { method:"POST",
  headers:{"content-type":"application/x-www-form-urlencoded"},
  body: new URLSearchParams({ grant_type:"authorization_code", code: code2, code_verifier:"wrong", resource: RES })});
console.log("bad PKCE ->", bad.status, (await bad.json()).error);
const replay = await fetch(`${RES}/token`, { method:"POST",
  headers:{"content-type":"application/x-www-form-urlencoded"},
  body: new URLSearchParams({ grant_type:"authorization_code", code, code_verifier:verifier, resource: RES })});
console.log("replayed code ->", replay.status, (await replay.json()).error);
'
```

Expect: `token -> 200`, `aud==resource: true`, `scope: memory:read memory:write`,
and both negatives `-> 400 invalid_grant`.

### 3. Against ChatGPT (manual)

Expose the port over HTTPS (`ngrok http 8099`), set `MCP_PUBLIC_URL` to the
tunnel, and paste `<tunnel>/mcp` into ChatGPT → Settings → Apps → Advanced →
Developer Mode → Create app. The MCP Inspector
(`npx @modelcontextprotocol/inspector`) is also useful for driving the
initialize → `tools/list` → `search` handshake directly.

> Stop background servers when done: `kill %1` (or `pkill -f dist/http/server.js`).

## P0 validation checklist (from the plan)

- [ ] CIMD with `token_endpoint_auth_method: "none"` — advertised in
      `/.well-known/oauth-authorization-server`; `client_id` URL is fetched +
      validated in `auth.ts:resolveClientMetadata`. **Must also advertise
      `client_id_metadata_document_supported: true`** (see gotcha below).
- [ ] `structuredContent` + `content[]` double-return — `tools.ts:dualResult`.
- [ ] OAuth UI appears — needs all three: `.well-known` metadata, `securitySchemes`
      on each tool, and `_meta["mcp/www_authenticate"]` in the 401 (`server.ts:send401`).
- [ ] Tool annotations present (`readOnlyHint` / `destructiveHint` / `openWorldHint`).
- [ ] `resource` echoed into `aud` — bound at `/authorize`, verified at `/token`
      and on every `/mcp` call (`auth.ts:verifyAccessToken`, audience check).
- [ ] Scope list is exactly `memory:read` + `memory:write` — nothing else
      (`config.ts:scopesSupported`).

## Gotchas found testing against real ChatGPT

### 1. CIMD must be explicitly advertised — `token_endpoint_auth_methods: ["none"]` is NOT enough

ChatGPT's connector setup has a **Client registration → Registration method**
dropdown with three options: User-Defined OAuth Client, DCR, and CIMD. CIMD was
greyed out with:

> "CIMD is unavailable because the server did not advertise CIMD support."

The fix: the `.well-known/oauth-authorization-server` document must include the
capability flag from `draft-ietf-oauth-client-id-metadata-document`:

```json
"client_id_metadata_document_supported": true
```

We initially relied only on `token_endpoint_auth_methods_supported: ["none"]`,
which is necessary but **not sufficient** — ChatGPT keys the CIMD option off the
explicit flag. Added in `auth.ts:authorizationServerMetadata`. (Per OpenAI's
docs, this is also what makes ChatGPT prefer CIMD over DCR.)

Likewise, **DCR** stays greyed out unless a `registration_endpoint` (Registration
URL) is present in the metadata — we don't expose one, by design, since we want
CIMD.

### 2. ChatGPT caches OAuth discovery per connector URL

After adding the flag, the CIMD option *stayed* greyed out on the connector that
had already been (partially) added — ChatGPT had cached the pre-flag discovery
result. Re-opening the same half-added connector reuses the cache. To force a
fresh discovery, add a **brand-new** connector; when iterating locally behind a
free ngrok tunnel, the simplest cache-bust is to **rotate the tunnel URL**
(restart ngrok → new subdomain → never-before-seen URL → fresh fetch).

### 3. ngrok-free browser interstitial on `/authorize`

ChatGPT's server-side discovery/token fetches use a non-browser UA and bypass
the ngrok warning, but the **OAuth login popup opens `/authorize` in the user's
browser**, which hits ngrok's one-time "You are about to visit…" page. Click
**Visit Site** once and the `302` redirect proceeds. A paid ngrok domain (or any
non-interstitial host) removes this.

### 4. dev-skip does NOT skip `/token` minting — missing `MCP_JWT_SECRET` → 500

ChatGPT ran the real OAuth flow (CIMD `client_id` → `/authorize` 302 → `/token`)
even with `MCP_DEV_SKIP_AUTH=1`, because dev-skip only short-circuits token
*verification* on `/mcp`. The spike's `/token` still has to *sign* a token, and
`mintAccessToken` needs `MCP_JWT_SECRET`. Launched without it, every `/token`
returned 500 (seen as 3× retries in the ngrok inspector) and ChatGPT showed
"something went wrong with the connection."

Fix: `config.ts` now auto-generates an ephemeral signing secret when neither
`MCP_JWT_SECRET` nor `MCP_JWKS_URL` is set, so the dev-skip quickstart completes
OAuth out of the box. Set `MCP_JWT_SECRET` for stable, restart-surviving tokens.

> Debugging tip: the ngrok inspector (`http://localhost:4040`) shows every
> request ChatGPT makes with status codes — invaluable for spotting which step
> (discovery / authorize / token / mcp) actually failed.

### 5. ChatGPT chat lists connector tools but won't *invoke* them (client-side)

Validated against a real Plus account: after a clean connect, ChatGPT runs
`initialize` + `tools/list` (returns all tools, 200) on every turn, but **never
issues a `tools/call`** in a normal chat — it treats a selected connector as a
read/retrieval source, not an action surface. Renaming `save` → `remember`
(non-reserved name) made no difference: still no `tools/call`. And on that
account **Agent mode and the connector could not be enabled together**, so the
agentic path (where actions would execute) wasn't reachable either.

Conclusions:
- The **server is fully correct** — proven by driving the MCP protocol directly:
  `initialize` → `tools/call save` returns `{saved:true, event_ids:[...]}` (write
  reaches production core) and `tools/call search` returns real memories.
- In-chat **write-tool invocation is gated by ChatGPT's Developer Mode rollout**,
  not by anything in this server. Also note ChatGPT **caches `tools/list` at
  connect time** — to pick up tool changes you must fully remove + re-add the
  connector.
- The reliable ways to exercise the server today: the **MCP Inspector**
  (`npx @modelcontextprotocol/inspector`) drives `tools/call` interactively, and
  ChatGPT **Deep Research / Company Knowledge** is the path where ChatGPT
  proactively calls `search`/`fetch` (read). Write-in-chat awaits OpenAI's rollout.

## Known spike limitations (P1 work)

1. **`/authorize` + `/token` are stubs** — real Clerk login + code exchange and
   a persistent code store replace the in-memory `codes` map.
2. **Org isolation** — `MemsyClient.search()` filters by `actorId` only; with one
   cross-org service key, org scoping must be enforced core-side (per-org key or
   an org header/claim). See the `TODO(P1)` in `context.ts`.
3. **Search visibility is org-wide, not actor-scoped.** `search` omits `actorId`
   (mirroring the stdio server's documented default) so a ChatGPT user finds
   memories created via any channel — needed for the shared-memory pitch and for
   finding pre-existing memories. `save` still attributes to the JWT actor. For
   **multi-user orgs this exposes every member's memories to each user** — decide
   per deployment whether to scope `search` to `ctx.actorId`. See the `TODO(P1)`
   in `tools.ts`. (We hit this during testing: actor-scoped search returned 0
   results because the dev identity owned no memories.)
3. **Stateless transport only** — no SSE session resumption; each POST is
   independent. Fine for the spike and for horizontal scaling.

> **SDK version note:** `StreamableHTTPServerTransport` requires
> `@modelcontextprotocol/sdk >= 1.10`. The dependency is `^1.0.0`, so a fresh
> `npm install` resolves the latest 1.x and works — verified building + running
> against **1.29.0**. If your lockfile pins an older 1.0.x, bump it.
>
> **Workspace install:** this package is part of the `memsy/` npm workspace
> (`@memsy-io/memsy` lives in `sdks/node`). Run `npm install` from the **`memsy/`
> root**, not from `mcp/`, and build the SDK once (`npm run build -w
> @memsy-io/memsy`) so its `dist/` types resolve — otherwise both this server
> and the stdio server report `Cannot find module '@memsy-io/memsy'`.
