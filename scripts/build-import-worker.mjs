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

await build({
  entryPoints: ["lib/epub.worker.ts"],
  bundle: true,
  platform: "browser",
  conditions: ["worker"],
  format: "iife",
  target: "es2022",
  outfile: "public/epub-worker.js",
  minify: true,
  legalComments: "linked",
});
const { mkdir, copyFile } = await import("node:fs/promises");
await mkdir("public/epub-fonts", { recursive: true });
for (const [file, source] of [
  ["regular.woff", "400-normal"],
  ["italic.woff", "400-italic"],
  ["bold.woff", "700-normal"],
])
  await copyFile(
    `node_modules/@fontsource/libre-baskerville/files/libre-baskerville-latin-${source}.woff`,
    `public/epub-fonts/${file}`,
  );

await build({
  entryPoints: ["lib/print.worker.ts"],
  bundle: true,
  platform: "browser",
  conditions: ["worker"],
  format: "iife",
  target: "es2022",
  outfile: "public/print-worker.js",
  minify: true,
  legalComments: "linked",
});
await copyFile(
  "node_modules/@fontsource/libre-baskerville/files/libre-baskerville-latin-700-italic.woff",
  "public/epub-fonts/bold-italic.woff",
);
await mkdir("public/pdfjs", { recursive: true });
await copyFile(
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs",
  "public/pdfjs/pdf.worker.min.mjs",
);

await build({
  entryPoints:["workers/epubcheck-worker.ts"],
  bundle:true,platform:"browser",conditions:["browser","worker"],format:"esm",
  target:"es2022",outfile:"public/epubcheck-worker.js",minify:true,
  external:["@aws-sdk/client-s3","node:*"],
});
await copyFile("node_modules/epubcheck-standalone/dist/epubcheck-engine.js","public/epubcheck-engine.js");
