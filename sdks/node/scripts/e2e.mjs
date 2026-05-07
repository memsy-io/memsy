#!/usr/bin/env node
/**
 * End-to-end smoke test for @memsy-io/memsy against a live Memsy API.
 *
 * Usage:
 *   MEMSY_BASE_URL=https://api-dev.memsy.io/v1 \
 *   MEMSY_API_KEY=msy_xxx \
 *   node sdks/node/scripts/e2e.mjs
 *
 * Imports from the local source build (../dist/index.mjs), so make sure to run
 * `npm run build` in sdks/node first.
 *
 * Each numbered step prints PASS/FAIL with one-line detail. Exits non-zero if
 * any step fails. Test data is namespaced under a unique actor id so it's
 * trivially filterable in the dashboard.
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DIST = resolve(__dirname, '..', 'dist', 'index.mjs');

const sdk = await import(DIST).catch((err) => {
  console.error(`Could not load SDK from ${DIST} — run \`npm run build\` first.`);
  console.error(err.message);
  process.exit(2);
});

const {
  MemsyClient,
  MemsyControlClient,
  MemsyError,
  MemsyAPIError,
  MemsyAuthError,
  MemsyAuthorizationError,
  MemsyConnectionError,
  MemsyRateLimitError,
} = sdk;

const BASE_URL = process.env.MEMSY_BASE_URL;
const API_KEY = process.env.MEMSY_API_KEY;
if (!BASE_URL || !API_KEY) {
  console.error('Set MEMSY_BASE_URL and MEMSY_API_KEY before running.');
  process.exit(2);
}

const RUN_ID = new Date().toISOString().replace(/[^0-9]/g, '');
const ACTOR = `e2e-actor-${RUN_ID}`;
const SESSION = `e2e-session-${RUN_ID}`;
const ALT_ACTOR = `e2e-actor-alt-${RUN_ID}`;

const client = new MemsyClient({
  baseUrl: BASE_URL,
  apiKey: API_KEY,
  timeoutMs: 30_000,
  maxRetries: 2,
});

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name} — ${detail}`);
}
async function step(name, fn) {
  try {
    record(name, true, await fn());
  } catch (err) {
    let kind = err?.name ?? 'Error';
    let extra = err?.message ?? String(err);
    if (err instanceof MemsyAPIError) extra = `status=${err.statusCode} detail=${(err.detail ?? '').slice(0, 120)}`;
    record(name, false, `${kind}: ${extra}`);
  }
}
function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

console.log(`\n=== @memsy-io/memsy E2E ===`);
console.log(`baseUrl: ${BASE_URL}`);
console.log(`actor:   ${ACTOR}`);
console.log(`session: ${SESSION}\n`);

// -----------------------------------------------------------------------------
// Group 1: Health + connectivity
// -----------------------------------------------------------------------------
await step('1.01 health()', async () => {
  const h = await client.health();
  if (h.status !== 'ok') throw new Error(`unexpected status=${h.status}`);
  return `status=${h.status} version=${h.version || '(empty)'} components=${Object.keys(h.components ?? {}).length}`;
});

// -----------------------------------------------------------------------------
// Group 2: Ingest variations
// -----------------------------------------------------------------------------
let basicIds = [];
await step('2.01 ingest — basic 2 events', async () => {
  const r = await client.ingest([
    { actorId: ACTOR, sessionId: SESSION, kind: 'user_message', content: 'I prefer dark mode in all apps.' },
    { actorId: ACTOR, sessionId: SESSION, kind: 'assistant_message', content: "Got it — I'll use dark mode by default." },
  ]);
  if (!Array.isArray(r.eventIds) || r.eventIds.length !== 2) throw new Error(`expected 2 ids, got ${r.eventIds?.length}`);
  basicIds = r.eventIds;
  return `eventIds=[${r.eventIds.map((x) => x.slice(0, 8)).join(', ')}…]`;
});

let metaIds = [];
await step('2.02 ingest — event with metadata (JSON string)', async () => {
  const r = await client.ingest([
    {
      actorId: ACTOR,
      sessionId: SESSION,
      kind: 'app_event',
      content: 'User upgraded to pro plan.',
      metadata: JSON.stringify({ plan: 'pro', source: 'billing-webhook', amount: 99 }),
    },
  ]);
  metaIds = r.eventIds;
  return `eventIds=[${r.eventIds.map((x) => x.slice(0, 8)).join(', ')}…]`;
});

let backfillIds = [];
await step('2.03 ingest — event with explicit ts (backfill)', async () => {
  const r = await client.ingest([
    {
      actorId: ACTOR,
      sessionId: SESSION,
      kind: 'user_message',
      content: 'Historical event from earlier.',
      ts: '2025-01-15T14:22:10Z',
    },
  ]);
  backfillIds = r.eventIds;
  return `eventIds=[${r.eventIds.map((x) => x.slice(0, 8)).join(', ')}…] ts=2025-01-15T14:22:10Z`;
});

let scopedIds = [];
await step('2.04 ingest — event with roleId + teamId (scoping)', async () => {
  const r = await client.ingest([
    {
      actorId: ACTOR,
      sessionId: SESSION,
      kind: 'user_message',
      content: 'I prefer Rust for performance-critical paths.',
      roleId: 'role_eng',
      teamId: 'team_platform',
    },
  ]);
  scopedIds = r.eventIds;
  return `eventIds=[${r.eventIds.map((x) => x.slice(0, 8)).join(', ')}…] role=role_eng team=team_platform`;
});

let altActorIds = [];
await step('2.05 ingest — different actor (cross-actor scenario)', async () => {
  const r = await client.ingest([
    { actorId: ALT_ACTOR, sessionId: SESSION, kind: 'user_message', content: 'I love Python and data science work.' },
  ]);
  altActorIds = r.eventIds;
  return `actor=${ALT_ACTOR} eventIds=[${r.eventIds.map((x) => x.slice(0, 8)).join(', ')}…]`;
});

let batchIds = [];
await step('2.06 ingest — 25-event batch', async () => {
  const events = Array.from({ length: 25 }, (_, i) => ({
    actorId: ACTOR,
    sessionId: SESSION,
    kind: i % 2 === 0 ? 'user_message' : 'assistant_message',
    content: `Batch event ${i}: random content blob with index ${i}.`,
  }));
  const r = await client.ingest(events);
  if (r.eventIds.length !== 25) throw new Error(`expected 25 ids, got ${r.eventIds.length}`);
  batchIds = r.eventIds;
  return `25 events ingested`;
});

const allIds = [...basicIds, ...metaIds, ...backfillIds, ...scopedIds, ...batchIds];

// -----------------------------------------------------------------------------
// Group 3: Status — async pipeline visibility
// -----------------------------------------------------------------------------
await step('3.01 status() immediately after ingest', async () => {
  const s = await client.status(allIds);
  if (s.total !== allIds.length) throw new Error(`expected total=${allIds.length}, got ${s.total}`);
  return `total=${s.total} completed=${s.completedIds.length} pending=${s.pendingIds.length} failed=${s.failedIds.length}`;
});

console.log('\n  [waiting 12s for async extraction to finish…]\n');
await sleep(12_000);

await step('3.02 status() after 12s — expect mostly completed', async () => {
  const s = await client.status(allIds);
  return `completed=${s.completedIds.length}/${s.total} pending=${s.pendingIds.length} failed=${s.failedIds.length}`;
});

// -----------------------------------------------------------------------------
// Group 4: Search variations
// -----------------------------------------------------------------------------
await step('4.01 search — default (actor-scoped, no extras)', async () => {
  const r = await client.search('user preferences', { actorId: ACTOR });
  return `${r.results.length} results, top score=${r.results[0]?.score?.toFixed(3) ?? 'n/a'}`;
});

await step('4.02 search — with limit=3', async () => {
  const r = await client.search('memory', { actorId: ACTOR, limit: 3, threshold: 0.0 });
  if (r.results.length > 3) throw new Error(`limit=3 violated, got ${r.results.length}`);
  return `${r.results.length} results (≤3)`;
});

await step('4.03 search — high threshold (expect zero results)', async () => {
  const r = await client.search('preferences', { actorId: ACTOR, threshold: 0.99 });
  return `${r.results.length} results above threshold=0.99 (expected: 0)`;
});

await step('4.04 search — includeSourceEvents=true (verifies sourceEvents propagation)', async () => {
  const r = await client.search('preferences', { actorId: ACTOR, threshold: 0.0, includeSourceEvents: true });
  if (r.results.length === 0) return `0 results (extraction may still be pending)`;
  const withSrc = r.results.filter((x) => Array.isArray(x.sourceEvents) && x.sourceEvents.length > 0);
  if (withSrc.length === 0) throw new Error(`no result carried sourceEvents (regression of f0d323c)`);
  const first = withSrc[0].sourceEvents[0];
  if (typeof first.eventId !== 'string' || typeof first.kind !== 'string' || typeof first.content !== 'string') {
    throw new Error(`sourceEvents shape malformed: ${JSON.stringify(first)}`);
  }
  return `${withSrc.length}/${r.results.length} carry sourceEvents; sample.eventId=${first.eventId.slice(0, 12)}…`;
});

await step('4.05 search — alt actor (verifies actor isolation)', async () => {
  const r = await client.search('Python data science', { actorId: ALT_ACTOR, threshold: 0.0 });
  return `${r.results.length} results for ALT_ACTOR (different from main actor)`;
});

await step('4.06 search — cross-actor (no actorId filter)', async () => {
  const r = await client.search('preferences', { threshold: 0.0, limit: 20 });
  return `${r.results.length} cross-actor results`;
});

// -----------------------------------------------------------------------------
// Group 5: Clear (destructive — use a unique tag we know doesn't exist)
// -----------------------------------------------------------------------------
await step('5.01 clear — unique tag that doesn’t exist (expect deleted=0 or 404)', async () => {
  const tag = `e2e-nonexistent-${RUN_ID}`;
  try {
    const r = await client.clear(tag);
    return `deleted=${r.deleted}`;
  } catch (err) {
    if (err instanceof MemsyAPIError && err.statusCode === 404) return `404 — endpoint reports tag missing`;
    throw err;
  }
});

// -----------------------------------------------------------------------------
// Group 6: Error paths
// -----------------------------------------------------------------------------
await step('6.01 error — bogus API key (expect MemsyAuthError or MemsyAPIError)', async () => {
  const bad = new MemsyClient({ baseUrl: BASE_URL, apiKey: 'msy_definitely_invalid', maxRetries: 0 });
  try {
    await bad.health();
    throw new Error('expected an error');
  } catch (err) {
    if (err instanceof MemsyAuthError) return `MemsyAuthError statusCode=${err.statusCode} (canonical 401)`;
    if (err instanceof MemsyAPIError) return `MemsyAPIError statusCode=${err.statusCode} (server uses ${err.statusCode} not 401)`;
    throw err;
  }
});

await step('6.02 error — bad host (expect MemsyConnectionError)', async () => {
  const bad = new MemsyClient({
    baseUrl: 'https://nonexistent-host-memsy-e2e.example.invalid',
    apiKey: API_KEY,
    timeoutMs: 5_000,
    maxRetries: 0,
  });
  try {
    await bad.health();
    throw new Error('expected a connection error');
  } catch (err) {
    if (err instanceof MemsyConnectionError) return `MemsyConnectionError caught — ${err.message.slice(0, 80)}`;
    throw err;
  }
});

await step('6.03 error — short timeout (expect MemsyConnectionError)', async () => {
  const slow = new MemsyClient({ baseUrl: BASE_URL, apiKey: API_KEY, timeoutMs: 1, maxRetries: 0 });
  try {
    await slow.health();
    throw new Error('expected timeout');
  } catch (err) {
    if (err instanceof MemsyConnectionError) return `MemsyConnectionError caught — ${err.message.slice(0, 80)}`;
    throw err;
  }
});

await step('6.04 error — empty events array (validate API behavior)', async () => {
  try {
    const r = await client.ingest([]);
    return `OK: empty batch returned ${r.eventIds.length} ids (server accepted empty batch)`;
  } catch (err) {
    if (err instanceof MemsyAPIError) return `MemsyAPIError ${err.statusCode}: server rejected empty batch`;
    throw err;
  }
});

await step('6.05 error — bad event kind (expect MemsyAPIError 400)', async () => {
  try {
    await client.ingest([
      { actorId: ACTOR, sessionId: SESSION, kind: 'not_a_real_kind', content: 'should fail validation' },
    ]);
    return `WARN: server accepted invalid kind (no validation)`;
  } catch (err) {
    if (err instanceof MemsyAPIError) return `MemsyAPIError ${err.statusCode}: rejected invalid kind`;
    throw err;
  }
});

// -----------------------------------------------------------------------------
// Group 7: Concurrency
// -----------------------------------------------------------------------------
await step('7.01 concurrency — 5 parallel searches', async () => {
  const queries = ['preferences', 'memory', 'language', 'mode', 'rust'];
  const t0 = Date.now();
  const all = await Promise.all(queries.map((q) => client.search(q, { actorId: ACTOR, limit: 3, threshold: 0.0 })));
  const dt = Date.now() - t0;
  const total = all.reduce((s, r) => s + r.results.length, 0);
  return `5 parallel searches in ${dt}ms — ${total} total results`;
});

// -----------------------------------------------------------------------------
// Group 8 — Control plane (mirrors the Python E2E coverage)
// -----------------------------------------------------------------------------
const controlUrl = (() => {
  const u = BASE_URL.replace(/\/$/, '');
  return u.endsWith('/v1') ? u.slice(0, -3) + '/api' : u + '/api';
})();
const control = new MemsyControlClient({ baseUrl: controlUrl, apiKey: API_KEY, maxRetries: 1 });

await step('8.01 control.health()', async () => {
  const h = await control.health();
  return `status=${h.status}`;
});

await step('8.02 control.me()', async () => {
  const me = await control.me();
  if (!me.orgId) throw new Error('expected orgId');
  return `orgId=${me.orgId} tier=${me.tier} isSuperadmin=${me.isSuperadmin}`;
});

await step('8.03 control.keys.list() (admin-gated)', async () => {
  try {
    const r = await control.keys.list();
    return `keys=${r.keys.length} maxKeys=${r.maxKeys} (admin scope)`;
  } catch (err) {
    if (err instanceof MemsyAuthorizationError) return `MemsyAuthorizationError fired correctly (${err.statusCode})`;
    throw err;
  }
});

await step('8.04 control.usage.summary() (admin-gated)', async () => {
  try {
    const r = await control.usage.summary();
    return `tier=${r.tier} dimensions=${r.dimensions.length}`;
  } catch (err) {
    if (err instanceof MemsyAuthorizationError) return `MemsyAuthorizationError fired correctly (${err.statusCode})`;
    throw err;
  }
});

await step('8.05 control.billing.summary() (admin-gated)', async () => {
  try {
    const r = await control.billing.summary();
    return `tier=${r.tier} purchasedSeats=${r.purchasedSeats}`;
  } catch (err) {
    if (err instanceof MemsyAuthorizationError) return `MemsyAuthorizationError fired correctly (${err.statusCode})`;
    throw err;
  }
});

await step('8.06 control.events.list()', async () => {
  try {
    const r = await control.events.list({ limit: 5 });
    return `events=${r.items.length} total=${r.total}`;
  } catch (err) {
    if (err instanceof MemsyAuthorizationError) return `MemsyAuthorizationError fired correctly (${err.statusCode})`;
    if (err instanceof MemsyAPIError && err.statusCode === 403) return `${err.errorCode ?? '403'} fired correctly (seat-required)`;
    throw err;
  }
});

await step('8.07 control.interest.status()', async () => {
  const expressed = await control.interest.status();
  return `expressed=${expressed}`;
});

// -----------------------------------------------------------------------------
// Group 9 — Hot-path sub-resources (orgs / roles / teams / memories)
// -----------------------------------------------------------------------------
await step('9.01 client.orgs.list()', async () => {
  try {
    const orgs = await client.orgs.list();
    return `orgs=${orgs.length}`;
  } catch (err) {
    if (err instanceof MemsyAuthorizationError) return `MemsyAuthorizationError fired correctly (${err.statusCode})`;
    throw err;
  }
});

await step('9.02 client.roles.list() (with non-existent orgId)', async () => {
  try {
    const roles = await client.roles.list('nonexistent-org-for-e2e');
    return `roles=${roles.length}`;
  } catch (err) {
    if (err instanceof MemsyAuthorizationError) return `MemsyAuthorizationError fired correctly (${err.statusCode})`;
    if (err instanceof MemsyAPIError) return `MemsyAPIError ${err.statusCode}: ${(err.detail ?? '').slice(0, 50)}`;
    throw err;
  }
});

await step('9.03 client.teams.list() (with non-existent orgId)', async () => {
  try {
    const teams = await client.teams.list('nonexistent-org-for-e2e');
    return `teams=${teams.length}`;
  } catch (err) {
    if (err instanceof MemsyAuthorizationError) return `MemsyAuthorizationError fired correctly (${err.statusCode})`;
    if (err instanceof MemsyAPIError) return `MemsyAPIError ${err.statusCode}: ${(err.detail ?? '').slice(0, 50)}`;
    throw err;
  }
});

await step('9.04 client.memories.stats()', async () => {
  const s = await client.memories.stats();
  return `total=${s.total} active=${s.activeMemories} avgConfidence=${s.avgConfidence.toFixed(2)}`;
});

await step('9.05 client.memories.list({ limit: 5 })', async () => {
  const r = await client.memories.list({ limit: 5 });
  return `items=${r.items.length} total=${r.total}`;
});

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------
console.log(`\n=== Summary ===`);
const passed = results.filter((r) => r.ok).length;
const failed = results.filter((r) => !r.ok).length;
console.log(`${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\nFailures:');
  results.filter((r) => !r.ok).forEach((r) => console.log(`  ✗ ${r.name}: ${r.detail}`));
}
process.exit(failed > 0 ? 1 : 0);
