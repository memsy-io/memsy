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
