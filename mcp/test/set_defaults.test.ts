import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  configPathForScope,
  persistProfileDefaults,
  reloadProfilesFromDisk,
  type Profile,
} from "../src/config.js";
import { actorIdSchema, computeEnvShadowingWarning } from "../src/tools/set_defaults.js";

const ORIGINAL_ENV = { ...process.env };

const SAMPLE_PROFILE: Profile = {
  apiKey: "msy_persisttest",
  baseUrl: "https://api.memsy.io/v1",
  orgLabel: "Sample",
};

describe("persistProfileDefaults", () => {
  let tmpDir: string;
  let originalCwd: string;

  beforeEach(() => {
    // realpathSync because mkdtempSync on macOS returns the /var/folders symlink
    // path while process.cwd() returns the resolved /private/var/folders form,
    // and comparing them with toBe() would otherwise fail.
    tmpDir = realpathSync(mkdtempSync(join(tmpdir(), "memsy-mcp-persist-")));
    originalCwd = process.cwd();
    process.chdir(tmpDir);
    // Redirect homedir() target by setting HOME so 'global' writes land in
    // the temp dir, not the developer's real ~/.memsy/config.json.
    process.env.HOME = tmpDir;
  });

  function preSeed(path: string, body: unknown): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(body));
  }

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...ORIGINAL_ENV };
  });

  it("creates a new config file when the global scope target doesn't exist", () => {
    const result = persistProfileDefaults(
      "global",
      "default",
      SAMPLE_PROFILE,
      { defaultRoleIds: ["ic"], defaultTeamIds: ["platform"] },
    );

    expect(result.created).toBe(true);
    expect(result.path).toBe(configPathForScope("global"));
    expect(existsSync(result.path)).toBe(true);

    const profiles = reloadProfilesFromDisk(result.path);
    expect(profiles.default.apiKey).toBe("msy_persisttest");
    expect(profiles.default.defaultRoleIds).toEqual(["ic"]);
    expect(profiles.default.defaultTeamIds).toEqual(["platform"]);
  });

  it("preserves siblings + active_profile pointer when updating", () => {
    // Pre-seed the global file with two profiles and an explicit active.
    const path = configPathForScope("global");
    preSeed(path, {
      active_profile: "work",
      profiles: {
        personal: { api_key: "msy_p", org_label: "Personal" },
        work: { api_key: "msy_w", org_label: "Work" },
      },
    });

    persistProfileDefaults(
      "global",
      "work",
      { ...SAMPLE_PROFILE, apiKey: "msy_w" },
      { defaultRoleIds: ["senior"] },
    );

    const profiles = reloadProfilesFromDisk(path);
    expect(profiles.work.apiKey).toBe("msy_w");
    expect(profiles.work.defaultRoleIds).toEqual(["senior"]);
    // sibling untouched
    expect(profiles.personal.apiKey).toBe("msy_p");
    // active_profile preserved
    const raw = JSON.parse(readFileSync(path, "utf8"));
    expect(raw.active_profile).toBe("work");
  });

  it("project scope writes under cwd, not HOME", () => {
    const result = persistProfileDefaults(
      "project",
      "default",
      SAMPLE_PROFILE,
      { defaultTeamIds: ["data-platform"] },
    );

    expect(result.path).toBe(join(tmpDir, ".memsy", "config.json"));
    expect(result.path).not.toContain(".memsy/config.json/.memsy"); // sanity
    const profiles = reloadProfilesFromDisk(result.path);
    expect(profiles.default.defaultTeamIds).toEqual(["data-platform"]);
  });

  it("refuses to clobber a corrupt config file", () => {
    const path = configPathForScope("global");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "{ this is not valid JSON");

    expect(() =>
      persistProfileDefaults("global", "default", SAMPLE_PROFILE, {
        defaultRoleIds: ["x"],
      }),
    ).toThrow(/not valid JSON/);
  });

  it("persists actor_id and leaves it untouched when later updates omit it", () => {
    const path = configPathForScope("global");
    preSeed(path, {
      profiles: {
        default: {
          api_key: "msy_d",
          default_role_ids: ["pre-existing-role"],
        },
      },
    });

    // First update: set actor_id.
    persistProfileDefaults(
      "global",
      "default",
      { apiKey: "msy_d", baseUrl: "https://api.memsy.io/v1" },
      { actorId: "claude-code" },
    );

    let profiles = reloadProfilesFromDisk(path);
    expect(profiles.default.actorId).toBe("claude-code");
    // pre-existing role survives.
    expect(profiles.default.defaultRoleIds).toEqual(["pre-existing-role"]);

    // Second update: only touch teams — actor_id must remain.
    persistProfileDefaults(
      "global",
      "default",
      { apiKey: "msy_d", baseUrl: "https://api.memsy.io/v1", actorId: "claude-code" },
      { defaultTeamIds: ["platform"] },
    );

    profiles = reloadProfilesFromDisk(path);
    expect(profiles.default.actorId).toBe("claude-code");
    expect(profiles.default.defaultTeamIds).toEqual(["platform"]);
  });

  it("rescues an in-memory-only actor_id pin when a later persist call omits actor_id (regression for code-review #3)", () => {
    const path = configPathForScope("global");
    // Prior persist=global wrote api_key + some role_ids but NO actor_id.
    preSeed(path, {
      profiles: {
        default: { api_key: "msy_d", default_role_ids: ["pre-existing-role"] },
      },
    });

    // Simulate ProfileManager state after a prior persist='none' set_defaults
    // that pinned actor_id in memory only.
    const inMemoryWithPin: Profile = {
      apiKey: "msy_d",
      baseUrl: "https://api.memsy.io/v1",
      actorId: "alex-dev",
    };

    // Now persist a DIFFERENT field, omitting actor_id from the update.
    persistProfileDefaults("global", "default", inMemoryWithPin, {
      defaultTeamIds: ["platform"],
    });

    const profiles = reloadProfilesFromDisk(path);
    // Pin must survive — without #3's fix, this would be undefined.
    expect(profiles.default.actorId).toBe("alex-dev");
    expect(profiles.default.defaultTeamIds).toEqual(["platform"]);
    // Pre-existing role still preserved.
    expect(profiles.default.defaultRoleIds).toEqual(["pre-existing-role"]);
  });

  it("does NOT clobber an existing on-disk actor_id with a different in-memory value", () => {
    // Reverse case: if the file already pins actor_id, the in-memory value
    // (which could be from a transient session-level set) must NOT win.
    // We're explicit: file is the source of truth for what's persisted; the
    // in-memory rescue only fills gaps.
    const path = configPathForScope("global");
    preSeed(path, {
      profiles: {
        default: { api_key: "msy_d", actor_id: "from-disk" },
      },
    });

    persistProfileDefaults(
      "global",
      "default",
      { apiKey: "msy_d", baseUrl: "https://api.memsy.io/v1", actorId: "in-memory" },
      { defaultRoleIds: ["ic"] },
    );

    const profiles = reloadProfilesFromDisk(path);
    expect(profiles.default.actorId).toBe("from-disk");
  });

  it("only touches fields the caller passes (clear vs leave-alone)", () => {
    const path = configPathForScope("global");
    preSeed(path, {
      profiles: {
        default: {
          api_key: "msy_d",
          default_role_ids: ["pre-existing-role"],
          default_team_ids: ["pre-existing-team"],
        },
      },
    });

    // Only update roles — teams should stay as they were.
    persistProfileDefaults(
      "global",
      "default",
      { apiKey: "msy_d", baseUrl: "https://api.memsy.io/v1" },
      { defaultRoleIds: ["new-role"] },
    );

    const profiles = reloadProfilesFromDisk(path);
    expect(profiles.default.defaultRoleIds).toEqual(["new-role"]);
    expect(profiles.default.defaultTeamIds).toEqual(["pre-existing-team"]);

    // Pass an empty array → explicit clear.
    persistProfileDefaults(
      "global",
      "default",
      { apiKey: "msy_d", baseUrl: "https://api.memsy.io/v1" },
      { defaultTeamIds: [] },
    );

    const after = reloadProfilesFromDisk(path);
    expect(after.default.defaultTeamIds).toEqual([]);
    // roles still the previous value
    expect(after.default.defaultRoleIds).toEqual(["new-role"]);
  });
});

describe("computeEnvShadowingWarning (regression for code-review #5+#6)", () => {
  it("returns null when the caller didn't set actor_id at all", () => {
    expect(
      computeEnvShadowingWarning({
        argActorId: undefined,
        envActorId: "claude-code",
        effectiveActorId: "claude-code",
      }),
    ).toBeNull();
  });

  it("returns null when MEMSY_ACTOR_ID is unset", () => {
    expect(
      computeEnvShadowingWarning({
        argActorId: "alex-dev",
        envActorId: undefined,
        effectiveActorId: "alex-dev",
      }),
    ).toBeNull();
  });

  it("returns null when MEMSY_ACTOR_ID is empty string (matches resolveActorId truthy check)", () => {
    // #6: !== undefined was the old gate, which would have produced a false-
    // positive warning. Boolean() correctly treats empty string as 'unset'.
    expect(
      computeEnvShadowingWarning({
        argActorId: "alex-dev",
        envActorId: "",
        effectiveActorId: "alex-dev",
      }),
    ).toBeNull();
  });

  it("fires with the 'shadowing different value' message when env != args", () => {
    const msg = computeEnvShadowingWarning({
      argActorId: "alex-dev",
      envActorId: "claude-code",
      effectiveActorId: "claude-code",
    });
    expect(msg).toBeTypeOf("string");
    expect(msg).toContain("takes precedence");
    expect(msg).toContain("\"alex-dev\"");
    expect(msg).toContain("\"claude-code\"");
  });

  it("rejects whitespace-only or whitespace-bookended actor_id (regression for code-review #7)", () => {
    expect(actorIdSchema.safeParse("   ").success).toBe(false);
    expect(actorIdSchema.safeParse("\t\n").success).toBe(false);
    expect(actorIdSchema.safeParse(" claude-code").success).toBe(false);
    expect(actorIdSchema.safeParse("claude-code ").success).toBe(false);
    expect(actorIdSchema.safeParse("").success).toBe(false);
    // Accepts non-empty, non-bookended values
    expect(actorIdSchema.safeParse("claude-code").success).toBe(true);
    expect(actorIdSchema.safeParse("alex-dev").success).toBe(true);
    // Internal whitespace is OK (some users may want labels like "Alex Dev")
    expect(actorIdSchema.safeParse("Alex Dev").success).toBe(true);
  });

  it("ALSO fires when env equals args (regression for code-review #5: false-negative)", () => {
    // The old condition `refreshed.identity.actorId !== args.actor_id` would
    // skip the warning in this case — silently letting env be load-bearing.
    const msg = computeEnvShadowingWarning({
      argActorId: "claude-code",
      envActorId: "claude-code",
      effectiveActorId: "claude-code",
    });
    expect(msg).toBeTypeOf("string");
    expect(msg).toContain("matches the value you persisted");
    expect(msg).toContain("load-bearing");
  });
});
