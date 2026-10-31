import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await walk(p);
    else if (
      p.endsWith(".js") ||
      p.endsWith(".mjs") ||
      p.endsWith(".css") ||
      p.endsWith(".html") ||
      p.endsWith(".svg") ||
      p.endsWith(".webmanifest") ||
      p.endsWith(".woff2") ||
      p.endsWith(".woff") ||
      (p.endsWith(".txt") &&
        (p.startsWith("out/licenses/") || p.endsWith(".LICENSE.txt")))
    )
      files.push(p);
  }
}
await walk("out");
const assets = files.filter((p) => p !== "out/sw.js");
const hash = createHash("sha256");
for (const p of assets.sort()) hash.update(await readFile(p));
let sw = await readFile("public/sw.js", "utf8");
sw = sw.replace(
  /book-formatter-v\d+/,
  `book-formatter-${hash.digest("hex").slice(0, 16)}`,
);
const precache = [
  "/", "/help/",
  ...assets.filter((p) => !p.endsWith(".html")).map((p) => "/" + p.slice(4)),
];
for (const required of ["/print-worker.js","/epub-worker.js","/epub-fonts/regular.woff",
  "/epub-fonts/italic.woff","/epub-fonts/bold.woff","/epub-fonts/bold-italic.woff",
  "/pdfjs/pdf.worker.min.mjs"]) {
  if (!precache.includes(required)) throw Error("Required offline asset missing from build: " + required);
}
const installPattern = /cache\\.addAll\\(\\[[^\\]]*\\]\\)/;
if (!installPattern.test(sw)) throw Error("Service worker precache manifest anchor not found.");
sw = sw.replace(installPattern, `cache.addAll(${JSON.stringify([...new Set(precache)])})`);
await writeFile("out/sw.js", sw);
