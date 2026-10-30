import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import {
  buildEpub,
  preflight,
  snapshotChecksum,
  type FontAssets,
} from "../lib/epub";
import { createBook } from "../lib/model";
import { getEbookEdition } from "../lib/edition";
function fixture() {
  const book = createBook("A title & <escape>", "Author");
  book.id = "fixture";
  book.updatedAt = "2026-10-30T12:00:00Z";
  book.chapters[0].content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "A café & <script> “hello”.",
            marks: [{ type: "em" }, { type: "strong" }],
          },
        ],
      },
      { type: "scene_break" },
      { type: "paragraph", content: [{ type: "text", text: "A new scene." }] },
    ],
  };
  return book;
}
const options = { id: "test-export", createdAt: "2026-10-30T12:00:00Z" };
const fonts: FontAssets = {
  regular: new Uint8Array(readFileSync("public/epub-fonts/regular.woff")),
  italic: new Uint8Array(readFileSync("public/epub-fonts/italic.woff")),
  bold: new Uint8Array(readFileSync("public/epub-fonts/bold.woff")),
  license: new Uint8Array(
    readFileSync("public/licenses/Libre-Baskerville-OFL.txt"),
  ),
};
describe("local EPUB generation", () => {
  it("packages uncompressed mimetype first, navigation and escaped semantic XHTML", () => {
    const b = fixture(),
      before = structuredClone(b);
    const { bytes, record } = buildEpub(b, fonts, options);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0);
    expect(view.getUint16(28, true)).toBe(0);
    expect(strFromU8(bytes.slice(30, 38))).toBe("mimetype");
    const files = unzipSync(bytes);
    expect(strFromU8(files.mimetype)).toBe("application/epub+zip");
    expect(strFromU8(files["EPUB/nav.xhtml"])).toContain(
      'href="chapter-0001.xhtml"',
    );
    expect(strFromU8(files["EPUB/chapter-0001.xhtml"])).toContain(
      "<em><strong>A café &amp; &lt;script&gt; “hello”.</strong></em>",
    );
    expect(strFromU8(files["EPUB/package.opf"])).toContain('version="3.0"');
    expect(files["EPUB/fonts/regular.woff"]).toEqual(fonts.regular);
    expect(files["EPUB/fonts/OFL.txt"]).toEqual(fonts.license);
    expect(record.inputChecksum).toBe(snapshotChecksum(b));
    expect(record.epubCheck).toBe("not-run");
    expect(b).toEqual(before);
  });
  it("reproduces byte-identical files for the same snapshot, assets and build options", () => {
    const b = fixture();
    expect(buildEpub(b, fonts, options).record.artifactChecksum).toBe(
      buildEpub(b, fonts, options).record.artifactChecksum,
    );
    const modified = {
      ...b,
      editions: {
        ebook: { ...getEbookEdition(b), sceneOrnament: "diamonds" as const },
      },
    };
    const generated = buildEpub(modified, fonts, options);
    expect(generated.record.inputChecksum).not.toBe(snapshotChecksum(b));
    expect(
      strFromU8(unzipSync(generated.bytes)["EPUB/chapter-0001.xhtml"]),
    ).toContain("◆ ◆ ◆");
  });
  it("hides section headings but retains content and table-of-contents titles", () => {
    const b = fixture();
    b.chapters[0].showTitle = false;
    const files = unzipSync(buildEpub(b, fonts, options).bytes);
    const section = strFromU8(files["EPUB/chapter-0001.xhtml"]);
    const nav = strFromU8(files["EPUB/nav.xhtml"]);
    expect(section).not.toContain('<h1 id="chapter-title">');
    expect(section).toContain('aria-label="Chapter One"');
    expect(section).toContain("A café");
    expect(nav).toContain(">Chapter One</a>");
    b.chapters[0].showTitle = true;
    expect(strFromU8(unzipSync(buildEpub(b, fonts, options).bytes)["EPUB/chapter-0001.xhtml"]))
      .toContain('<h1 id="chapter-title">Chapter One</h1>');
  });
  it("preserves centered and right-aligned paragraphs through EPUB export", () => {
    const b = fixture();
    b.chapters[0].content = { type:"doc", content:[
      {type:"paragraph",attrs:{align:"center"},content:[{type:"text",text:"Centered dedication"}]},
      {type:"paragraph",attrs:{align:"right"},content:[{type:"text",text:"Signed by the author"}]},
    ]};
    const files = unzipSync(buildEpub(b, fonts, options).bytes);
    const chapter = strFromU8(files["EPUB/chapter-0001.xhtml"]);
    expect(chapter).toContain('class="opening align-center"');
    expect(chapter).toContain('class="align-right"');
    expect(chapter).toContain("Centered dedication");
    expect(strFromU8(files["EPUB/style.css"])).toContain(".align-center{text-align:center");
  });
  it("emits compatible page-start and section spacing without promising physical EPUB pages", () => {
    const b=fixture();
    b.chapters[0].pageLayout={start:"verso",vertical:"bottom",header:"hide",pageNumber:"hide",spaceBefore:24,spaceAfter:12};
    const files=unzipSync(buildEpub(b,fonts,options).bytes);
    const chapter=strFromU8(files["EPUB/chapter-0001.xhtml"]);
    expect(chapter).toContain('class="section-layout"');
    expect(chapter).toContain('break-before:page;page-break-before:always');
    expect(chapter).toContain('padding-top:2em;padding-bottom:1em');
    expect(strFromU8(files["EPUB/nav.xhtml"])).toContain(">Chapter One</a>");
  });
  it("generates a linked TOC from reordered book sections without typed contents text", () => {
    const b = fixture();
    const toc = { ...b.chapters[0], id: "toc-1", title: "Contents", sectionType: "toc" as const, content: { type: "doc", content: [{ type: "paragraph" }] } };
    const extra = { ...b.chapters[0], id: "chapter-2", title: "Afterward & Beyond", sectionType: "epilogue" as const };
    b.chapters = [toc, extra, b.chapters[0]];
    const bytes = buildEpub(b, fonts, options).bytes;
    const files = unzipSync(bytes);
    const generated = strFromU8(files["EPUB/chapter-0001.xhtml"]);
    expect(generated).toContain('epub:type="toc"');
    expect(generated).toContain('href="chapter-0002.xhtml"');
    expect(generated).toContain('Afterward &amp; Beyond');
    expect(generated).toContain('href="chapter-0003.xhtml"');
    expect(generated).not.toContain('href="chapter-0001.xhtml"');
    expect(strFromU8(files["EPUB/nav.xhtml"])).toContain('>Contents</a>');
  });
  it("supports system fonts without bundling unlicensed system binaries", () => {
    const b = fixture();
    b.editions = {
      ebook: {
        ...getEbookEdition(b),
        bodyFont: "georgia",
        sceneOrnament: "rule",
      },
    };
    const files = unzipSync(buildEpub(b, undefined, options).bytes);
    expect(files["EPUB/fonts/regular.woff"]).toBeUndefined();
    expect(strFromU8(files["EPUB/style.css"])).not.toContain("@font-face");
    expect(strFromU8(files["EPUB/chapter-0001.xhtml"])).toContain(
      '<hr class="scene-rule"/>',
    );
  });
  it("blocks empty content and missing metadata, and rejects missing fonts or invalid XML characters", () => {
    const empty = createBook("Book", "");
    expect(preflight(empty).filter((i) => i.severity === "error")).toHaveLength(
      2,
    );
    expect(() => buildEpub(empty, fonts, options)).toThrow("preflight");
    expect(() => buildEpub(fixture(), undefined, options)).toThrow(
      "font files",
    );
    expect(() =>
      buildEpub(
        fixture(),
        { ...fonts, regular: new TextEncoder().encode("<html>Sign in</html>") },
        options,
      ),
    ).toThrow("font file");
    const b = fixture();
    b.language = "not a language";
    expect(
      preflight(b).some(
        (x) => x.location === "Book details" && x.severity === "error",
      ),
    ).toBe(true);
    b.language = "en";
    b.title = "bad\u0001title";
    expect(() => buildEpub(b, fonts, options)).toThrow("XML");
  });
});
