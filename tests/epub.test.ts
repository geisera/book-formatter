import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import {
  buildEpub,
  preflight,
  snapshotChecksum,
  type FontAssets,
} from "../lib/epub";
import { validateBook, createBook } from "../lib/model";
import {backupBook,restoreProject} from "../lib/backup";
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
  it("packages a locally embedded PNG as a linked EPUB illustration", () => {
    const b = fixture();
    const src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAF0lEQVR4nGM0ckthIAUwkaR6VMMI0gAAFWAA9Kg1bTEAAAAASUVORK5CYII=";
    b.chapters[0].content={type:"doc",content:[
      {type:"image",attrs:{src,alt:"Blue rectangle illustration",width:50,align:"right",caption:"Figure 1: A & B"}},
    ]};
    expect(validateBook(b)).toBe(b);
    const files=unzipSync(buildEpub(b,fonts,options).bytes);
    const chapter=strFromU8(files["EPUB/chapter-0001.xhtml"]);
    expect(chapter).toContain('src="images/image-0001.png"');
    expect(chapter).toContain('alt="Blue rectangle illustration"');
    expect(chapter).toContain('width:50%');
    expect(chapter).toContain("<figcaption>Figure 1: A &amp; B</figcaption>");
    expect(files["EPUB/images/image-0001.png"].length).toBeGreaterThan(30);
    expect(strFromU8(files["EPUB/package.opf"])).toContain('href="images/image-0001.png" media-type="image/png"');
    const invalid={...b,chapters:b.chapters.map(c=>({...c,content:{type:"doc",content:[{type:"image",attrs:{src:"https://bad.example/test.png",alt:"Unsafe",width:50,align:"center"}}]}}))};
    expect(()=>validateBook(invalid)).toThrow("Only embedded PNG");
  });
  it("embeds a separate official cover and includes it in EPUB navigation and reading order", () => {
    const b=fixture();
    const src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAF0lEQVR4nGM0ckthIAUwkaR6VMMI0gAAFWAA9Kg1bTEAAAAASUVORK5CYII=";
    b.cover={src,alt:"Cover: a tower above the city"};
    expect(validateBook(b)).toBe(b);
    const files=unzipSync(buildEpub(b,fonts,options).bytes);
    const packageXml=strFromU8(files["EPUB/package.opf"]);
    const cover=strFromU8(files["EPUB/cover.xhtml"]);
    expect(packageXml).toContain('id="cover-image" href="images/cover.png" media-type="image/png" properties="cover-image"');
    expect(packageXml).toContain('id="cover-page" href="cover.xhtml" media-type="application/xhtml+xml"');
    expect(packageXml).toContain('<spine><itemref idref="cover-page"/><itemref idref="title"/>');
    expect(cover).toContain('epub:type="cover"');
    expect(cover).toContain('src="images/cover.png"');
    expect(cover).toContain('alt="Cover: a tower above the city"');
    expect(strFromU8(files["EPUB/nav.xhtml"])).toContain('href="cover.xhtml"');
    expect(files["EPUB/images/cover.png"].length).toBeGreaterThan(30);
    expect(preflight(b).some(i=>i.message.includes("No cover image"))).toBe(false);
    const restored=restoreProject(backupBook(b));
    expect(restored.book.cover).toEqual(b.cover);
    const without=fixture();
    const plain=unzipSync(buildEpub(without,fonts,options).bytes);
    expect(plain["EPUB/cover.xhtml"]).toBeUndefined();
    expect(preflight(without).some(i=>i.message.includes("No cover image"))).toBe(true);
    expect(()=>validateBook({...b,cover:{src:"https://example.invalid/img.png",alt:"Unsafe"}})).toThrow("Only embedded PNG");
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

describe("edition-specific chapter headings in exported EPUB",()=>{
 it("numbers only manuscript chapters, scales front headings, preserves source and independent paperback settings",()=>{
  const b=fixture();
  b.chapters=[
    {...b.chapters[0],id:"front",title:"Preface",sectionType:"preface"},
    {...b.chapters[0],id:"one",title:"The Road",sectionType:"chapter"},
    {...b.chapters[0],id:"part",title:"Part Two",sectionType:"part"},
    {...b.chapters[0],id:"two",title:"The Return",sectionType:"chapter"},
  ];
  const original=structuredClone(b.chapters);
  const printBefore=structuredClone(b.editions?.print);
  b.editions!.ebook={...getEbookEdition(b),chapterNumberStyle:"roman",frontMatterTitleScale:1.3};
  const zipped=unzipSync(buildEpub(b,fonts,options).bytes);
  const read=(i:number)=>strFromU8(zipped[`EPUB/chapter-${String(i).padStart(4,"0")}.xhtml`]);
  expect(read(1)).toContain('class="section-layout front-matter"');
  expect(read(1)).not.toContain('class="chapter-number"');
  expect(read(2)).toContain('>I</span><h1 id="chapter-title">The Road</h1>');
  expect(read(3)).not.toContain('class="chapter-number"');
  expect(read(4)).toContain('>II</span><h1 id="chapter-title">The Return</h1>');
  expect(strFromU8(zipped["EPUB/style.css"])).toContain(".section-layout.front-matter h1{font-size:2.145em}");
  expect(b.chapters).toEqual(original);
  expect(b.editions!.print).toEqual(printBefore);
 });
 it("retains legacy title-only output and independently supports Arabic ebook labels",()=>{
  const b=fixture();
  const plain=strFromU8(unzipSync(buildEpub(b,fonts,options).bytes)["EPUB/chapter-0001.xhtml"]);
  expect(plain).not.toContain('class="chapter-number"');
  b.editions!.ebook={...getEbookEdition(b),chapterNumberStyle:"arabic"};
  const numbered=strFromU8(unzipSync(buildEpub(b,fonts,options).bytes)["EPUB/chapter-0001.xhtml"]);
  expect(numbered).toContain('>1</span><h1 id="chapter-title">Chapter One</h1>');
 });
});

describe("chapter number without visible chapter title",()=>{
 it("exports Arabic and Roman chapter numbers as headings without removing titles from EPUB navigation",()=>{
  const b=fixture();
  const original=structuredClone(b.chapters);
  for(const [style,label] of [["arabic","1"],["roman","I"]] as const){
    b.editions!.ebook={...getEbookEdition(b),chapterNumberStyle:style,showChapterTitle:false};
    const files=unzipSync(buildEpub(b,fonts,options).bytes);
    const section=strFromU8(files["EPUB/chapter-0001.xhtml"]);
    expect(section).toContain(`<h1 id="chapter-title" class="chapter-number number-only" aria-label="Chapter ${label}">${label}</h1>`);
    expect(section).not.toContain("<h1 id=\"chapter-title\">Chapter One</h1>");
    expect(strFromU8(files["EPUB/nav.xhtml"])).toContain(">Chapter One</a>");
    expect(b.chapters).toEqual(original);
  }
  b.editions!.ebook={...getEbookEdition(b),chapterNumberStyle:"none",showChapterTitle:false};
  const without=strFromU8(unzipSync(buildEpub(b,fonts,options).bytes)["EPUB/chapter-0001.xhtml"]);
  expect(without).not.toContain('id="chapter-title"');
  expect(without).toContain('aria-label="Chapter One"');
 });
});
