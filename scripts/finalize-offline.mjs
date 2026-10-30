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
  "book-formatter-v1",
  `book-formatter-${hash.digest("hex").slice(0, 16)}`,
);
sw = sw.replace(
  '["/","/icon.svg","/manifest.webmanifest"]',
  JSON.stringify([
    "/",
    ...assets.filter((p) => !p.endsWith(".html")).map((p) => "/" + p.slice(4)),
  ]),
);
await writeFile("out/sw.js", sw);
