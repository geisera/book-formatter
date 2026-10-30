import { decodeImage, embeddedImages } from "./images";
import { zipSync, strToU8, unzipSync } from "fflate";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import type { Node as ManuscriptNode } from "prosemirror-model";
import { schema, validateBook, showSectionTitle, getSectionLayout, type Book } from "./model";
import { getEbookEdition, type EbookEdition } from "./edition";
export const EPUB_RENDERER = "epub-1.1.0";
export type ExportIssue = {
  severity: "error" | "warning";
  location: string;
  message: string;
  action: string;
};
export type FontAssets = {
  regular: Uint8Array;
  italic: Uint8Array;
  bold: Uint8Array;
  license: Uint8Array;
};
export type ExportRecord = {
  id: string;
  bookId: string;
  title: string;
  createdAt: string;
  revision: number;
  renderer: string;
  edition: EbookEdition;
  language: string;
  inputChecksum: string;
  artifactChecksum: string;
  byteLength: number;
  localChecks: "passed";
  epubCheck: "not-run";
  warningCount: number;
  filename: string;
};
export const checksum = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
export const snapshotChecksum = (book: Book) =>
  checksum(strToU8(JSON.stringify(book)));
export function validLanguage(language: string): boolean {
  try {
    return !!language.trim() && Intl.getCanonicalLocales(language).length === 1;
  } catch {
    return false;
  }
}
export function preflight(book: Book): ExportIssue[] {
  const issues: ExportIssue[] = [];
  const add = (
    severity: ExportIssue["severity"],
    location: string,
    message: string,
    action: string,
  ) => issues.push({ severity, location, message, action });
  try {
    validateBook(book);
  } catch (e) {
    add(
      "error",
      "Project",
      e instanceof Error ? e.message : "Invalid project.",
      "Restore a valid project backup.",
    );
    return issues;
  }
  if (!book.title.trim())
    add(
      "error",
      "Book details",
      "The book needs a title.",
      "Enter a book title below.",
    );
  if (!book.author.trim())
    add(
      "error",
      "Book details",
      "The author name is missing.",
      "Enter the author or pen name below.",
    );
  if (!validLanguage(book.language ?? "en"))
    add(
      "error",
      "Book details",
      "The language code is invalid.",
      "Use a language tag such as en, en-US, fr or de.",
    );
  const seen = new Set<string>();
  book.chapters.forEach((chapter, i) => {
    const location = `Section ${i + 1}: ${chapter.title || "Untitled"}`;
    if (!chapter.title.trim())
      add(
        "error",
        location,
        "The section title is missing.",
        "Rename this section in Manuscript mode.",
      );
    if (chapter.sectionType === "toc" && schema.nodeFromJSON(chapter.content).textContent.trim())
      add("warning", location, "The contents page is generated; manually typed text in this section is not exported.", "Move this text to a separate section if it should appear in the book.");
    if (chapter.sectionType !== "toc" && !schema.nodeFromJSON(chapter.content).textContent.trim() && !embeddedImages(chapter.content).length)
      add(
        "error",
        location,
        "This section has no readable text.",
        "Add text to the section before exporting.",
      );
    const key = chapter.title.trim().toLocaleLowerCase();
    if (seen.has(key))
      add(
        "warning",
        location,
        "Another section has the same title.",
        "Check that both table-of-contents entries are intentional.",
      );
    seen.add(key);
  });
  if (book.importInfo?.diagnostics.some((d) => d.severity === "warning"))
    add(
      "warning",
      "Imported manuscript",
      "The import report contains conversion warnings; some DOCX images or layouts may require review.",
      "Review the import report and compare the manuscript with the original file.",
    );
  add(
    "warning",
    "Publication proof",
    "Cover art is not available in this export version.",
    "Review the exported ebook in a reader before distribution.",
  );
  return issues;
}
// XML 1.0 allows only these code points. Fail rather than silently dropping content.
function xml(value: string): string {
  if (
    /[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u.test(
      value,
    )
  )
    throw Error(
      "The manuscript contains characters XML cannot represent. Remove control characters and retry.",
    );
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
function inline(node: ManuscriptNode): string {
  const result: string[] = [];
  node.forEach((child) => {
    let text = xml(child.text ?? "").replaceAll("\n", "<br/>");
    for (const mark of child.marks) {
      if (mark.type.name === "strong") text = `<strong>${text}</strong>`;
      if (mark.type.name === "em") text = `<em>${text}</em>`;
    }
    result.push(text);
  });
  return result.join("");
}
function chapterBody(
  content: Record<string, unknown>,
  edition: EbookEdition,
  imagePaths: Map<string,string>,
): string {
  const doc = schema.nodeFromJSON(content);
  const blocks: string[] = [];
  let opening = true;
  doc.forEach((node) => {
    if (node.type.name === "image") {
      const path = imagePaths.get(node.attrs.src);
      if (!path) throw Error("Embedded illustration is missing from the EPUB package.");
      const align = node.attrs.align as string;
      blocks.push(`<figure class="illustration align-${align}"><img src="${path}" alt="${xml(node.attrs.alt)}" style="width:${node.attrs.width}%;height:auto;max-width:100%"/>${node.attrs.caption ? `<figcaption>${xml(node.attrs.caption)}</figcaption>` : ""}</figure>`);
      opening = true;
    } else if (node.type.name === "scene_break") {
      blocks.push(
        edition.sceneOrnament === "rule"
          ? '<hr class="scene-rule"/>'
          : `<div class="scene" role="separator" aria-label="Scene break">${edition.sceneOrnament === "diamonds" ? "◆ ◆ ◆" : "* * *"}</div>`,
      );
      opening = true;
    } else if (node.type.name === "heading") {
      blocks.push(`<h2${node.attrs.align ? ` class="align-${node.attrs.align}"` : ""}>${inline(node)}</h2>`);
      opening = true;
    } else {
      blocks.push(
        `<p${opening || node.attrs.align ? ` class="${[opening ? "opening" : "", node.attrs.align ? `align-${node.attrs.align}` : ""].filter(Boolean).join(" ")}"` : ""}>${inline(node) || "&#160;"}</p>`,
      );
      if (node.textContent.trim()) opening = false;
    }
  });
  return blocks.join("\n");
}
function xhtml(
  title: string,
  language: string,
  body: string,
  stylesheet = "style.css",
) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${xml(language)}" xml:lang="${xml(language)}"><head><meta charset="UTF-8"/><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="${stylesheet}"/></head><body>${body}</body></html>`;
}
export function editionCss(e: EbookEdition): string {
  return `${e.bodyFont === "baskerville" ? `@font-face{font-family:LibreBaskerville;src:url("fonts/regular.woff") format("woff");font-weight:400;font-style:normal}@font-face{font-family:LibreBaskerville;src:url("fonts/italic.woff") format("woff");font-weight:400;font-style:italic}@font-face{font-family:LibreBaskerville;src:url("fonts/bold.woff") format("woff");font-weight:700;font-style:normal}` : ""}
body{font-family:${e.bodyFont === "baskerville" ? "LibreBaskerville,Georgia,serif" : "Georgia,serif"};font-size:${e.fontSize / 16}em;line-height:${e.lineHeight};margin:1em;color:inherit;background:transparent}h1{font-size:1.65em;font-weight:normal;line-height:1.4;text-align:${e.headingStyle === "left" ? "left" : "center"};margin:${e.chapterSpacing}em 0 2em}h2{font-size:1.15em;line-height:1.5;margin:1.8em 0 1em}p{margin:0 0 ${e.paragraphSpacing}em;text-indent:${e.paragraphIndent}em;orphans:2;widows:2}.opening{text-indent:0}.scene{font-family:serif;text-align:center;letter-spacing:.15em;margin:1.6em 0;font-size:.8em}.scene-rule{width:3em;border:0;border-top:1px solid currentColor;margin:1.6em auto}.titlepage{text-align:center}.titlepage p{text-indent:0}.titlepage h1{margin-top:3em}.author{margin-top:1.5em}nav ol{padding-left:1.5em}nav li{margin-bottom:.6em}a{color:inherit}.illustration{margin:1.5em 0;break-inside:avoid}.illustration img{max-width:100%;height:auto}.illustration figcaption{font-size:.82em;font-style:italic;margin:.5em auto 0;text-align:center;text-indent:0}.illustration.align-left{text-align:left}.illustration.align-center{text-align:center}.illustration.align-right{text-align:right}.align-left{text-align:left;text-indent:0}.align-center{text-align:center;text-indent:0}.align-right{text-align:right;text-indent:0}.align-justify{text-align:justify;text-indent:0}
${e.template.id === "modern" ? "h1{font-size:1.5em;letter-spacing:-.025em;font-weight:600}.scene-rule{width:4em}" : e.template.id === "gothic" ? "h1{font-size:1.9em;letter-spacing:.09em;text-transform:uppercase}.scene{letter-spacing:.28em;margin:2em 0}" : ""}
`;
}

export function buildEpub(
  input: Book,
  fonts: FontAssets | undefined,
  options: { id: string; createdAt: string },
): { bytes: Uint8Array; record: ExportRecord; issues: ExportIssue[] } {
  const book = structuredClone(validateBook(input));
  const issues = preflight(book);
  if (issues.some((x) => x.severity === "error"))
    throw Error("Fix the preflight errors before exporting.");
  const edition = structuredClone(getEbookEdition(book));
  const language = book.language ?? "en";
  if (
    edition.bodyFont === "baskerville" &&
    (!fonts ||
      [fonts.regular, fonts.italic, fonts.bold, fonts.license].some(
        (x) => !x?.length,
      ))
  )
    throw Error(
      "The included font files are unavailable. Reopen the app online once, then retry offline.",
    );
  if (edition.bodyFont === "baskerville" && fonts) {
    for (const asset of [fonts.regular, fonts.italic, fonts.bold])
      if (
        asset.length < 4 ||
        new DataView(
          asset.buffer,
          asset.byteOffset,
          asset.byteLength,
        ).getUint32(0, false) !== 0x774f4646
      )
        throw Error(
          "An included font file is damaged or unavailable. Reopen the app online and retry.",
        );
    if (
      !new TextDecoder().decode(fonts.license).includes("SIL OPEN FONT LICENSE")
    )
      throw Error(
        "The included font license is unavailable. Reopen the app online and retry.",
      );
  }
  const timestamp = new Date(options.createdAt);
  if (!Number.isFinite(timestamp.getTime()))
    throw Error("Invalid export timestamp.");
  const modified = timestamp.toISOString().replace(/\.\d{3}Z$/, "Z");
  const inputChecksum = snapshotChecksum(book);
  const paths = book.chapters.map(
    (_, i) => `chapter-${String(i + 1).padStart(4, "0")}.xhtml`,
  );
  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    mimetype: [strToU8("application/epub+zip"), { level: 0 }],
  };
  const add = (path: string, text: string) => {
    files[path] = strToU8(text);
  };
  add(
    "META-INF/container.xml",
    '<?xml version="1.0" encoding="UTF-8"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  );
  const imagePaths = new Map<string,string>();
  const imageManifest: string[] = [];
  for (const chapter of book.chapters) {
    for (const image of embeddedImages(chapter.content)) {
      if (imagePaths.has(image.src)) continue;
      const decoded = decodeImage(image.src);
      const name = `image-${String(imagePaths.size + 1).padStart(4,"0")}.${decoded.extension}`;
      files[`EPUB/images/${name}`] = decoded.bytes;
      imagePaths.set(image.src, `images/${name}`);
      imageManifest.push(`<item id="image-${imagePaths.size}" href="images/${name}" media-type="${decoded.mediaType}"/>`);
    }
  }
  add("EPUB/style.css", editionCss(edition));
  add(
    "EPUB/title.xhtml",
    xhtml(
      book.title,
      language,
      `<section class="titlepage" epub:type="titlepage"><h1>${xml(book.title)}</h1><p class="author">${xml(book.author)}</p></section>`,
    ),
  );
  book.chapters.forEach((c, i) =>
    add(
      `EPUB/${paths[i]}`,
      xhtml(
        c.title,
        language,
        `<section class="section-layout" style="break-before:page;page-break-before:always;padding-top:${Math.round(getSectionLayout(c).spaceBefore / 12 * 100) / 100}em;padding-bottom:${Math.round(getSectionLayout(c).spaceAfter / 12 * 100) / 100}em" epub:type="${c.sectionType === "prologue" ? "prologue" : c.sectionType === "epilogue" ? "epilogue" : c.sectionType === "part" ? "part" : c.sectionType === "preface" ? "preface" : c.sectionType === "copyright" ? "copyright-page" : c.sectionType === "dedication" ? "dedication" : c.sectionType === "epigraph" ? "epigraph" : c.sectionType === "toc" ? "toc" : "chapter"}" ${showSectionTitle(c) ? 'aria-labelledby="chapter-title"' : `aria-label="${xml(c.title)}"`}>${showSectionTitle(c) ? `<h1 id="chapter-title">${xml(c.title)}</h1>` : ""}${c.sectionType === "toc" ? `<div class="generated-contents"><ol>${book.chapters.filter(entry => entry.id !== c.id && entry.sectionType !== "toc").map(entry => { const index = book.chapters.findIndex(x => x.id === entry.id); return `<li><a href="${paths[index]}">${xml(entry.title)}</a></li>`; }).join("")}</ol></div>` : chapterBody(c.content, edition, imagePaths)}</section>`,
      ),
    ),
  );
  add(
    "EPUB/nav.xhtml",
    xhtml(
      "Contents",
      language,
      `<nav epub:type="toc" id="toc" role="doc-toc"><h1>Contents</h1><ol><li><a href="title.xhtml">Title page</a></li>${book.chapters.map((c, i) => `<li><a href="${paths[i]}">${xml(c.title)}</a></li>`).join("")}</ol></nav>`,
    ),
  );
  const fontManifest =
    edition.bodyFont === "baskerville"
      ? '<item id="font-regular" href="fonts/regular.woff" media-type="font/woff"/><item id="font-italic" href="fonts/italic.woff" media-type="font/woff"/><item id="font-bold" href="fonts/bold.woff" media-type="font/woff"/><item id="font-license" href="fonts/OFL.txt" media-type="text/plain"/>'
      : "";
  if (edition.bodyFont === "baskerville" && fonts) {
    files["EPUB/fonts/regular.woff"] = fonts.regular;
    files["EPUB/fonts/italic.woff"] = fonts.italic;
    files["EPUB/fonts/bold.woff"] = fonts.bold;
    files["EPUB/fonts/OFL.txt"] = fonts.license;
  }
  add(
    "EPUB/package.opf",
    `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${xml(language)}"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="pub-id">urn:book-formatter:${xml(encodeURIComponent(book.id))}</dc:identifier><dc:title>${xml(book.title)}</dc:title><dc:creator>${xml(book.author)}</dc:creator><dc:language>${xml(language)}</dc:language><meta property="dcterms:modified">${modified}</meta><meta name="generator" content="Book Formatter ${EPUB_RENDERER}"/></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="title" href="title.xhtml" media-type="application/xhtml+xml"/><item id="style" href="style.css" media-type="text/css"/>${paths.map((p, i) => `<item id="chapter-${i + 1}" href="${p}" media-type="application/xhtml+xml"/>`).join("")}${fontManifest}${imageManifest.join("")}</manifest><spine><itemref idref="title"/><itemref idref="nav"/>${paths.map((_, i) => `<itemref idref="chapter-${i + 1}"/>`).join("")}</spine></package>`,
  );
  add(
    "META-INF/book-formatter-build.json",
    JSON.stringify(
      {
        renderer: EPUB_RENDERER,
        manuscriptSchema: book.schemaVersion,
        bookId: book.id,
        revision: book.revision,
        inputChecksum,
        createdAt: modified,
        edition,
        epubCheck: "not-run",
      },
      null,
      2,
    ),
  );
  // ZIP stores local DOS date fields; a local constructor fixes those fields across time zones.
  const mtime = new Date(2020, 0, 1, 0, 0, 0);
  const entries = Object.fromEntries(
    Object.entries(files).map(([path, value]) => [
      path,
      Array.isArray(value)
        ? [value[0], { level: 0, mtime }]
        : [value, { level: 6, mtime }],
    ]),
  );
  const bytes = zipSync(entries as Parameters<typeof zipSync>[0]);
  // Local package checks are intentionally narrower than EPUBCheck.
  const check = unzipSync(bytes);
  if (
    new TextDecoder().decode(check.mimetype) !== "application/epub+zip" ||
    paths.some((p) => !check[`EPUB/${p}`]) ||
    !check["EPUB/nav.xhtml"] ||
    !check["EPUB/package.opf"]
  )
    throw Error("Local package integrity checks failed.");
  const filename = `${
    book.title
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "book"
  }.epub`;
  return {
    bytes,
    issues,
    record: {
      id: options.id,
      bookId: book.id,
      title: book.title,
      createdAt: modified,
      revision: book.revision,
      renderer: EPUB_RENDERER,
      edition,
      language,
      inputChecksum,
      artifactChecksum: checksum(bytes),
      byteLength: bytes.length,
      localChecks: "passed",
      epubCheck: "not-run",
      warningCount: issues.filter((x) => x.severity === "warning").length,
      filename,
    },
  };
}
