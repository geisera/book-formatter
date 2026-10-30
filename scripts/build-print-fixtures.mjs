import { build } from "esbuild";
import { spawnSync } from "node:child_process";
await build({
  entryPoints: ["scripts/print-fixtures.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "es2022",
  outfile: "artifacts/print-fixtures.cjs",
});
const result = spawnSync(process.execPath, ["artifacts/print-fixtures.cjs"], {
  stdio: "inherit",
});
process.exit(result.status ?? 1);
