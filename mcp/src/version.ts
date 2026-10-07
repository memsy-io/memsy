import { readFileSync } from "node:fs";

/**
 * This package's version, read from the manifest at runtime.
 *
 * Runtime rather than a hand-maintained constant because that constant drifts:
 * it previously lagged at "0.1.0" while the package had moved on. Everything
 * that reports a version reads this one — the banner, --version, the MCP
 * handshake, and the provenance surface — so they cannot disagree.
 *
 * Lives in its own module rather than in server.ts because profiles.ts needs
 * it too, and server.ts already imports profiles.ts. Importing back would be
 * a cycle.
 *
 * Resolved relative to this module: dist/server.js -> ../package.json.
 */
export const VERSION: string = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version;
