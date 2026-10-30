import { build } from "esbuild";
await build({
  entryPoints: ["lib/import.worker.ts"],
  bundle: true,
  platform: "browser",
  // Prefer DOM-free parser exports inside Web Workers.
  conditions: ["worker"],
  format: "iife",
  target: "es2022",
  outfile: "public/import-worker.js",
  minify: true,
  legalComments: "linked",
});
