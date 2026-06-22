import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/server.ts", "src/http/server.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "node18",
  platform: "node",
});
