import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig, parseCliFlags } from "../src/config.js";

const ORIGINAL_ENV = { ...process.env };

function clearMemsyEnv(): void {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith("MEMSY_")) delete process.env[k];
  }
}

describe("loadConfig", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    clearMemsyEnv();
    tmpDir = mkdtempSync(join(tmpdir(), "memsy-mcp-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...ORIGINAL_ENV };
  });

  it("synthesizes a default profile from MEMSY_API_KEY when no file exists", () => {
    process.env.MEMSY_API_KEY = "msy_test_envonly";
    const cfg = loadConfig();
    expect(cfg.activeProfileName).toBe("default");
    expect(cfg.activeProfile.apiKey).toBe("msy_test_envonly");
    expect(cfg.activeProfile.baseUrl).toBe("https://api.memsy.io/v1");
  });

  it("reads a multi-profile config file", () => {
    const configPath = join(tmpDir, "config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        active_profile: "work",
        profiles: {
          personal: { api_key: "msy_p", org_label: "Personal" },
          work: { api_key: "msy_w", org_label: "Work", base_url: "https://staging.memsy.io" },
        },
      }),
    );

    const cfg = loadConfig({ configPath });
    expect(cfg.activeProfileName).toBe("work");
    expect(cfg.activeProfile.apiKey).toBe("msy_w");
    expect(cfg.activeProfile.baseUrl).toBe("https://staging.memsy.io");
    expect(Object.keys(cfg.profiles).sort()).toEqual(["personal", "work"]);
  });

  it("migrates a legacy flat config into a 'default' profile", () => {
    const configPath = join(tmpDir, "legacy.json");
    writeFileSync(
      configPath,
      JSON.stringify({ api_key: "msy_legacy", base_url: "https://api.memsy.io" }),
    );

    const cfg = loadConfig({ configPath });
    expect(cfg.activeProfileName).toBe("default");
    expect(cfg.activeProfile.apiKey).toBe("msy_legacy");
  });

  it("CLI --profile overrides env MEMSY_PROFILE", () => {
    const configPath = join(tmpDir, "c.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        active_profile: "personal",
        profiles: {
          personal: { api_key: "msy_p" },
          work: { api_key: "msy_w" },
        },
      }),
    );
    process.env.MEMSY_PROFILE = "personal";

    const cfg = loadConfig({ configPath, profile: "work" });
    expect(cfg.activeProfileName).toBe("work");
  });

  it("--api-key flag creates/overrides the named profile in memory", () => {
    const cfg = loadConfig({ apiKey: "msy_cli", baseUrl: "https://x.local" });
    expect(cfg.activeProfile.apiKey).toBe("msy_cli");
    expect(cfg.activeProfile.baseUrl).toBe("https://x.local");
  });

  it("throws a helpful error when no profile can be resolved", () => {
    expect(() => loadConfig()).toThrow(/No Memsy profile resolved/);
  });

  it("--api-key overrides the resolved active profile, not a separate 'default'", () => {
    // Regression for code-review finding #3: previously --api-key wrote to
    // profiles[flags.profile ?? 'default'] but activeName was resolved from
    // config.active_profile, so the override was silently dropped when the
    // file's active_profile was something other than 'default'.
    const configPath = join(tmpDir, "c.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        active_profile: "work",
        profiles: {
          personal: { api_key: "msy_p_old" },
          work: { api_key: "msy_w_old" },
        },
      }),
    );

    const cfg = loadConfig({ configPath, apiKey: "msy_NEW" });
    expect(cfg.activeProfileName).toBe("work");
    expect(cfg.activeProfile.apiKey).toBe("msy_NEW");
    // The 'personal' profile's key must be untouched.
    expect(cfg.profiles.personal.apiKey).toBe("msy_p_old");
  });

  it("--api-key + --profile applies to the explicitly chosen profile", () => {
    const configPath = join(tmpDir, "c.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        active_profile: "personal",
        profiles: {
          personal: { api_key: "msy_p_old" },
          work: { api_key: "msy_w_old" },
        },
      }),
    );

    const cfg = loadConfig({ configPath, apiKey: "msy_NEW", profile: "work" });
    expect(cfg.activeProfileName).toBe("work");
    expect(cfg.activeProfile.apiKey).toBe("msy_NEW");
    expect(cfg.profiles.personal.apiKey).toBe("msy_p_old");
  });
});

describe("parseCliFlags", () => {
  it("parses recognized flags and ignores others", () => {
    const flags = parseCliFlags([
      "--profile",
      "work",
      "--api-key",
      "msy_x",
      "--unknown",
      "value",
    ]);
    expect(flags.profile).toBe("work");
    expect(flags.apiKey).toBe("msy_x");
  });

  it("rejects flag-shaped values (forgot to supply real value)", () => {
    // Regression for code-review finding #7: previously `--api-key --profile work`
    // would silently set apiKey to "--profile" and drop the real --profile.
    expect(() => parseCliFlags(["--api-key", "--profile", "work"])).toThrow(
      /Missing value for --api-key/,
    );
    expect(() => parseCliFlags(["--profile"])).toThrow(/Missing value for --profile/);
    expect(() => parseCliFlags(["--config", "-"])).toThrow(/Missing value for --config/);
  });
});

describe("loadConfig — robustness fixes", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    clearMemsyEnv();
    tmpDir = mkdtempSync(join(tmpdir(), "memsy-mcp-test-"));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...ORIGINAL_ENV };
  });

  it("synthesizes the env-backed profile under MEMSY_PROFILE's name (not always 'default')", () => {
    // Regression for code-review finding #2: previously `MEMSY_API_KEY=msy_x
    // MEMSY_PROFILE=work` with no config file threw 'profile not found'.
    process.env.MEMSY_API_KEY = "msy_envonly";
    process.env.MEMSY_PROFILE = "work";

    const cfg = loadConfig();
    expect(cfg.activeProfileName).toBe("work");
    expect(cfg.activeProfile.apiKey).toBe("msy_envonly");
  });

  it("skips malformed profiles in the config file instead of failing the whole load", () => {
    // Regression for code-review finding #4: a single profile missing api_key
    // would throw and block startup, even with --profile pointing at a valid one.
    const configPath = join(tmpDir, "c.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        active_profile: "personal",
        profiles: {
          personal: { api_key: "msy_p" },
          // half-edited: no api_key
          broken: { org_label: "Broken" },
        },
      }),
    );

    const cfg = loadConfig({ configPath });
    expect(cfg.activeProfileName).toBe("personal");
    expect(cfg.activeProfile.apiKey).toBe("msy_p");
    expect(cfg.profiles).not.toHaveProperty("broken");
  });

  it("merges MEMSY_DEFAULT_ROLE_IDS / MEMSY_DEFAULT_TEAM_IDS / MEMSY_ACTOR_ID into a file-loaded profile", () => {
    // Regression for code-review finding #8: env defaults were only applied
    // when the profile came from env synthesis or CLI override — file
    // profiles silently ignored these env vars.
    const configPath = join(tmpDir, "c.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        active_profile: "work",
        profiles: {
          work: { api_key: "msy_w" },
        },
      }),
    );
    process.env.MEMSY_DEFAULT_ROLE_IDS = "ic,senior";
    process.env.MEMSY_DEFAULT_TEAM_IDS = "platform";
    process.env.MEMSY_ACTOR_ID = "alice";

    const cfg = loadConfig({ configPath });
    expect(cfg.activeProfile.defaultRoleIds).toEqual(["ic", "senior"]);
    expect(cfg.activeProfile.defaultTeamIds).toEqual(["platform"]);
    expect(cfg.activeProfile.actorId).toBe("alice");
  });

  it("does NOT override an explicit profile field with the env default", () => {
    // Ensure the merge is "fill in if missing", not "always override".
    const configPath = join(tmpDir, "c.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        active_profile: "work",
        profiles: {
          work: { api_key: "msy_w", actor_id: "explicit-actor" },
        },
      }),
    );
    process.env.MEMSY_ACTOR_ID = "env-actor";

    const cfg = loadConfig({ configPath });
    expect(cfg.activeProfile.actorId).toBe("explicit-actor");
  });
});
