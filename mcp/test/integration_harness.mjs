// Self-test harness: spawns the built MCP server over stdio and exercises every
// local-only code path (no network). Run with: node test/integration_harness.mjs

import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SERVER = resolve(new URL(import.meta.url).pathname, "../../dist/server.js");

// Strip parent MEMSY_* env so scenarios are hermetic.
function cleanEnv() {
  const out = { ...process.env };
  for (const k of Object.keys(out)) if (k.startsWith("MEMSY_")) delete out[k];
  return out;
}

function preview(value, max = 220) {
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function fmtToolResult(r) {
  if (!r) return "(no result)";
  const text = r.content?.[0]?.text;
  if (typeof text === "string") {
    try {
      return JSON.stringify(JSON.parse(text));
    } catch {
      return text;
    }
  }
  return JSON.stringify(r);
}

async function runScenario(name, { env = {}, configContents, requests, expectExitError = false }) {
  console.log(`\n=== ${name} ===`);

  let tmpDir = null;
  const args = [SERVER];

  if (configContents !== undefined) {
    tmpDir = mkdtempSync(join(tmpdir(), "mcp-harness-"));
    const configPath = join(tmpDir, "config.json");
    writeFileSync(configPath, JSON.stringify(configContents, null, 2));
    args.push("--config", configPath);
  }

  const child = spawn("node", args, {
    env: { ...cleanEnv(), ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdoutBuf = "";
  let stderrBuf = "";
  const responses = new Map(); // id → response

  child.stdout.on("data", (chunk) => {
    stdoutBuf += chunk;
    let nl;
    while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
      const line = stdoutBuf.slice(0, nl);
      stdoutBuf = stdoutBuf.slice(nl + 1);
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined) responses.set(msg.id, msg);
      } catch {
        /* not JSON, ignore */
      }
    }
  });

  child.stderr.on("data", (c) => {
    stderrBuf += c;
  });

  const exitPromise = new Promise((r) => child.once("exit", r));

  if (expectExitError) {
    const code = await Promise.race([
      exitPromise,
      new Promise((r) => setTimeout(() => r("TIMEOUT"), 3000)),
    ]);
    console.log(`  exit_code: ${code}`);
    console.log(`  stderr:    ${preview(stderrBuf.trim())}`);
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    return;
  }

  // Send requests one at a time, awaiting the response before the next —
  // mirrors how real MCP hosts (Claude Code, Inspector) drive the server.
  // Firing in a tight loop allows the SDK to interleave handlers, which is
  // not representative of production traffic.
  for (const req of requests) {
    const { _label, ...rpc } = req;
    void _label;
    child.stdin.write(`${JSON.stringify(rpc)}\n`);
    if (rpc.id !== undefined) {
      const deadline = Date.now() + 1500;
      while (!responses.has(rpc.id) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 20));
      }
    } else {
      // Notification — no response expected, just give the server a beat.
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  child.stdin.end();
  await Promise.race([exitPromise, new Promise((r) => setTimeout(r, 1500))]);

  console.log(`  startup:   ${preview(stderrBuf.trim().split("\n")[0] ?? "(no stderr)")}`);
  for (const req of requests) {
    if (req.id === undefined) continue;
    const resp = responses.get(req.id);
    const label = req._label ?? String(req.id);
    if (!resp) {
      console.log(`  [${label.padEnd(28)}] (no response)`);
      continue;
    }
    if (resp.error) {
      console.log(`  [${label.padEnd(28)}] ERROR ${resp.error.code}: ${preview(resp.error.message)}`);
      continue;
    }
    // Tool result → unwrap content[0].text JSON
    if (resp.result?.content) {
      const isError = resp.result.isError ? " (isError)" : "";
      console.log(`  [${label.padEnd(28)}] ok${isError}: ${preview(fmtToolResult(resp.result))}`);
    } else if (resp.result?.contents) {
      // resource read
      const text = resp.result.contents[0]?.text ?? "";
      console.log(`  [${label.padEnd(28)}] ok: ${preview(text)}`);
    } else if (resp.result?.tools) {
      console.log(`  [${label.padEnd(28)}] ok: ${resp.result.tools.length} tools`);
    } else if (resp.result?.resources) {
      console.log(
        `  [${label.padEnd(28)}] ok: ${resp.result.resources.length} resources (${resp.result.resources.map((r) => r.uri).join(", ")})`,
      );
    } else if (resp.result?.prompts) {
      console.log(
        `  [${label.padEnd(28)}] ok: ${resp.result.prompts.length} prompts (${resp.result.prompts.map((p) => p.name).join(", ")})`,
      );
    } else if (resp.result?.messages) {
      console.log(
        `  [${label.padEnd(28)}] ok: prompt rendered, ${resp.result.messages.length} msg(s)`,
      );
    } else {
      console.log(`  [${label.padEnd(28)}] ok: ${preview(resp.result)}`);
    }
  }

  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
}

const init = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "self-test", version: "0.0.0" },
  },
  _label: "initialize",
};
const initialized = { jsonrpc: "2.0", method: "notifications/initialized" };

const call = (id, name, args, label) => ({
  jsonrpc: "2.0",
  id,
  method: "tools/call",
  params: { name, arguments: args },
  _label: label ?? name,
});
const read = (id, uri, label) => ({
  jsonrpc: "2.0",
  id,
  method: "resources/read",
  params: { uri },
  _label: label ?? uri,
});
const getPrompt = (id, name, args, label) => ({
  jsonrpc: "2.0",
  id,
  method: "prompts/get",
  params: { name, arguments: args },
  _label: label ?? `prompt:${name}`,
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario A: env-only auth, exercise every local-only path + every error path.
// ─────────────────────────────────────────────────────────────────────────────
await runScenario("A: env-only auth — local paths + error surface", {
  env: { MEMSY_API_KEY: "msy_HARNESS_FAKE_KEY" },
  requests: [
    init,
    initialized,
    { jsonrpc: "2.0", id: 2, method: "tools/list", _label: "tools/list" },
    { jsonrpc: "2.0", id: 3, method: "resources/list", _label: "resources/list" },
    { jsonrpc: "2.0", id: 4, method: "prompts/list", _label: "prompts/list" },

    // local-only tools
    call(10, "memsy_list_orgs", {}),

    // local-only resources
    read(20, "memsy://actor/current"),
    read(21, "memsy://session/current"),
    read(22, "memsy://profile/current"),

    // schema validation errors (no network)
    call(40, "memsy_search", { query: "" }, "search_empty_query"),
    call(41, "memsy_ingest", { events: [] }, "ingest_empty_batch"),
    call(42, "memsy_ingest", { events: [{ kind: "wrong_kind", content: "x" }] }, "ingest_bad_kind"),

    // unknown profile — local error
    call(50, "memsy_use_org", { profile: "does_not_exist" }, "use_org_unknown"),

    // unknown tool name → JSON-RPC error
    call(60, "memsy_does_not_exist", {}, "unknown_tool"),

    // prompts
    getPrompt(70, "recall-context", { topic: "test", limit: "3" }, "prompt:recall"),
    getPrompt(71, "summarize-and-store", { kind: "app_event" }, "prompt:store"),
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario B: multi-profile config — list_orgs + use_org switching.
// ─────────────────────────────────────────────────────────────────────────────
await runScenario("B: multi-profile — switch + identity re-derive", {
  configContents: {
    active_profile: "personal",
    profiles: {
      personal: {
        api_key: "msy_p_fake",
        base_url: "https://api.memsy.io/v1",
        org_label: "Personal",
      },
      work: {
        api_key: "msy_w_fake",
        base_url: "https://api.memsy.io/v1",
        org_label: "Work",
      },
    },
  },
  requests: [
    init,
    initialized,
    call(2, "memsy_list_orgs", {}, "list_orgs_before"),
    read(3, "memsy://profile/current", "profile_before"),
    read(4, "memsy://actor/current", "actor_before"),
    call(5, "memsy_use_org", { profile: "work" }, "switch_to_work"),
    read(6, "memsy://profile/current", "profile_after"),
    read(7, "memsy://actor/current", "actor_after"),
    call(8, "memsy_list_orgs", {}, "list_orgs_after"),
    // Switch back to verify symmetric path
    call(9, "memsy_use_org", { profile: "personal" }, "switch_back"),
    read(10, "memsy://profile/current", "profile_back"),
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario C: legacy flat config (no `profiles` map) → auto-migrate to default.
// ─────────────────────────────────────────────────────────────────────────────
await runScenario("C: legacy flat config — auto-migrate to default", {
  configContents: {
    api_key: "msy_legacy_fake",
    base_url: "https://api.memsy.io/v1",
  },
  requests: [
    init,
    initialized,
    call(2, "memsy_list_orgs", {}, "list_orgs"),
    read(3, "memsy://profile/current", "profile_current"),
  ],
});

// ─────────────────────────────────────────────────────────────────────────────
// Scenario D: CLI --profile override of env MEMSY_PROFILE.
// ─────────────────────────────────────────────────────────────────────────────
await runScenario("D: CLI flag overrides env (--profile beats MEMSY_PROFILE)", {
  env: { MEMSY_PROFILE: "personal" },
  configContents: {
    active_profile: "personal",
    profiles: {
      personal: { api_key: "msy_p", org_label: "Personal" },
      work: { api_key: "msy_w", org_label: "Work" },
    },
  },
  requests: [
    init,
    initialized,
    call(2, "memsy_list_orgs", {}, "list_orgs"),
    read(3, "memsy://profile/current", "active_profile"),
  ],
});
// NOTE: this scenario doesn't actually pass --profile via runScenario; we
// only verify env MEMSY_PROFILE has effect here. CLI flag precedence is
// covered by the vitest unit tests in test/config.test.ts.

// ─────────────────────────────────────────────────────────────────────────────
// Scenario E: no key, no config → boot must fail with a helpful message.
// ─────────────────────────────────────────────────────────────────────────────
await runScenario("E: no auth → boot failure with helpful error", {
  expectExitError: true,
});

console.log("\nAll scenarios complete.");
