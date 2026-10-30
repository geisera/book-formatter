import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, mkdirSync } from "node:fs";
const jar = process.env.EPUBCHECK_JAR;
if (!jar || !existsSync(jar)) {
  console.error("Set EPUBCHECK_JAR to the official EPUBCheck JAR path.");
  process.exit(1);
}
mkdirSync("artifacts", { recursive: true });
await build({
  entryPoints: ["scripts/epub-fixtures.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: "artifacts/epub-fixtures.cjs",
});
const generator = spawnSync(process.execPath, ["artifacts/epub-fixtures.cjs"], {
  stdio: "inherit",
});
if (generator.status !== 0) process.exit(generator.status ?? 1);
for (const file of readdirSync("artifacts/epub").filter((x) =>
  x.endsWith(".epub"),
)) {
  console.log(`Checking ${file}`);
  const result = spawnSync(
    "java",
    [
      "-jar",
      jar,
      `artifacts/epub/${file}`,
      "--json",
      `artifacts/epub/${file}.report.json`,
    ],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
