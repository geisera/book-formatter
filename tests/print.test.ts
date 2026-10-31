import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { createBook, blankChapter, validateBook } from "../lib/model";
import { CLASSIC_PRINT, PRINT_PRESETS, PRINT_TRIMS, getPrintEdition, printPreset, validatePrintEdition } from "../lib/print-profile";
import { buildPrintPdf, type PrintFonts } from "../lib/print";
import { backupBook, restoreBook } from "../lib/backup";
import { presetFor } from "../lib/edition";
const fonts = Object.fromEntries(
  [
    ["regular", "regular"],
    ["italic", "italic"],
    ["bold", "bold"],
    ["boldItalic", "bold-italic"],
  ].map(([key, file]) => [
    key,
    new Uint8Array(readFileSync(`public/epub-fonts/${file}.woff`)),
  ]),
) as PrintFonts;
const options = { id: "proof", createdAt: "2026-10-30T12:00:00Z" };
function fixture() {
  const b = createBook("A print proof", "Test Author");
  b.chapters = Array.from({ length: 3 }, (_, i) => ({
    ...blankChapter(`Chapter ${i + 1}`),
    content: {
      type: "doc",
      content: Array.from({ length: 9 }, () => ({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "A careful traveller follows the road through the old forest. ".repeat(
              25,
            ),
          },
        ],
      })),
    },
  }));
  return b;
}
describe("offline print proof", () => {
  it("builds 6x9 pages with recto chapter starts, suppressed opening headers and mirrored gutters", async () => {
    const b = fixture(),
      before = structuredClone(b);
    const result = await buildPrintPdf(b, fonts, options);
    const pdf = await PDFDocument.load(result.bytes);
    expect(pdf.getPageCount()).toBe(result.record.pageCount);
    expect(pdf.getPageCount() % 2).toBe(0);
    for (const p of pdf.getPages())
      expect(p.getSize()).toEqual({ width: 432, height: 648 });
    for (const page of result.record.pages) {
      if (page.kind === "chapter") {
        expect(page.page % 2).toBe(1);
        expect(page.header).toBeUndefined();
      }
      if (page.kind === "body") expect(page.header).toBeTruthy();
      if (page.kind === "blank") {
        expect(page.lineCount).toBe(0);
        expect(page.footer).toBeUndefined();
      }
      expect(page.left).toBe(page.page % 2 ? 54 : 40.5);
    }
    expect(result.record.checks).toMatchObject({
      overflow: 0,
      splitViolations: 0,
      fonts: "embedded",
    });
    expect(b).toEqual(before);
  }, 20000);
  it("renders and preserves all supported paperback trim sizes", async () => {
    const book=fixture(), original=structuredClone(book.chapters);
    const counts:number[]=[];
    for(const trim of ["5x8","5.5x8.5","6x9"] as const){
      book.editions!.print=printPreset("classic","left",trim);
      expect(validatePrintEdition(book.editions!.print)).toEqual(book.editions!.print);
      const restored=restoreBook(backupBook(book));
      expect(getPrintEdition(restored).trim).toBe(trim);
      const built=await buildPrintPdf(restored,fonts,options);
      const pdf=await PDFDocument.load(built.bytes);
      const {width,height}=PRINT_TRIMS[trim];
      expect(built.record.profile.trim).toBe(trim);
      expect(built.record.filename).toContain(`-${trim}-proof.pdf`);
      expect(built.record.pageCount).toBe(pdf.getPageCount());
      expect(built.record.pageCount%2).toBe(0);
      for(const page of pdf.getPages())expect(page.getSize()).toEqual({width,height});
      expect(built.record.pages.filter(p=>p.kind==="chapter").every(p=>p.page%2===1)).toBe(true);
      expect(built.record.pages.every(p=>p.kind==="cover"||p.kind==="blank"||p.right<=width)).toBe(true);
      expect(built.record.checks.overflow).toBe(0);
      counts.push(built.record.pageCount);
    }
    expect(counts[0]).toBeGreaterThanOrEqual(counts[1]);
    expect(counts[1]).toBeGreaterThanOrEqual(counts[2]);
    expect(book.chapters).toEqual(original);
    const older=createBook("Old paperback","Writer");
    expect(getPrintEdition(older).trim).toBe("6x9");
    expect(getPrintEdition({...older,editions:{...older.editions!,print:printPreset("modern","left","5x8")}}).trim).toBe("5x8");
    expect(()=>validatePrintEdition({...CLASSIC_PRINT,trim:"7x10" as "6x9"})).toThrow("trim");
  },90000);
  it("keeps front cover off by default and adds it as an unnumbered PDF first page when selected", async () => {
    const b=fixture();
    b.cover={src:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAF0lEQVR4nGM0ckthIAUwkaR6VMMI0gAAFWAA9Kg1bTEAAAAASUVORK5CYII=",alt:"A picture of a tower"};
    const before=structuredClone(b);
    const plain=await buildPrintPdf(b,fonts,options);
    const withCover=await buildPrintPdf(b,fonts,{...options,includeFrontCover:true});
    const pdf=await PDFDocument.load(withCover.bytes);
    expect(plain.record.includeFrontCover).toBe(false);
    expect(withCover.record.includeFrontCover).toBe(true);
    expect(withCover.record.pageCount).toBe(plain.record.pageCount+2);
    expect(pdf.getPageCount()).toBe(withCover.record.pageCount);
    expect(withCover.record.pages[0]).toMatchObject({page:1,kind:"cover"});
    expect(withCover.record.pages[1]).toMatchObject({page:2,kind:"blank"});
    expect(withCover.record.pages[0].header).toBeUndefined();
    expect(withCover.record.pages[0].footer).toBeUndefined();
    expect(withCover.record.pages[2].kind).toBe("title");
    expect(withCover.record.pages[2].page).toBe(3);
    expect(withCover.record.pages.filter(p=>p.kind==="chapter").every(p=>p.page%2===1)).toBe(true);
    expect(withCover.record.filename).toContain("-with-cover-");
    expect(withCover.record.warnings.join(" ")).toContain("full-wrap");
    expect(b).toEqual(before);
    await expect(buildPrintPdf({...b,cover:undefined},fonts,{...options,includeFrontCover:true})).rejects.toThrow("Upload cover artwork");
  },20000);
  it("includes optional publishing metadata in PDF properties without rewriting printed title pages", async()=>{
    const book=fixture();
    book.metadata={subtitle:"The Long Road",publisher:"North Press",description:"A story about the road.",isbn:"978-0-306-40615-7",seriesName:"The Journey",seriesNumber:"3",publicationDate:"2026-10-31"};
    const original=structuredClone(book.chapters);
    const built=await buildPrintPdf(book,fonts,options);
    const pdf=await PDFDocument.load(built.bytes);
    expect(pdf.getTitle()).toBe("A print proof: The Long Road");
    expect(pdf.getSubject()).toBe("A story about the road.");
    expect(pdf.getKeywords()).toContain("isbn:9780306406157");
    expect(pdf.getKeywords()).toContain("publisher:North Press");
    expect(pdf.getKeywords()).toContain("series:The Journey #3");
    expect(pdf.getKeywords()).toContain("publication-date:2026-10-31");
    expect(book.chapters).toEqual(original);
  },20000);
  it("preserves a separate print profile through project backups and supplies defaults for old books", () => {
    const b = fixture();
    expect(getPrintEdition(restoreBook(backupBook(b)))).toEqual(CLASSIC_PRINT);
    delete b.editions;
    expect(getPrintEdition(validateBook(b))).toEqual(CLASSIC_PRINT);
    expect(() =>
      validateBook({
        ...b,
        editions: {
          ebook: createBook("", "").editions!.ebook,
          print: { ...CLASSIC_PRINT, inside: 10 },
        },
      }),
    ).toThrow("Unsupported print profile");
  });
  it("omits the heading when disabled without losing PDF body content", async () => {
    const book = fixture();
    book.chapters[0].title = "A very long section heading ".repeat(65);
    book.chapters[0].showTitle = false;
    const hidden = await buildPrintPdf(book, fonts, options);
    expect(hidden.record.pages.some(p => p.chapterId === book.chapters[0].id && p.kind === "chapter" && p.lineCount > 0)).toBe(true);
    book.chapters[0].showTitle = true;
    await expect(buildPrintPdf(book, fonts, options)).rejects.toThrow("chapter title is too long");
  }, 20000);
  it("renders centered and right-aligned text inside print margins", async () => {
    const book = fixture();
    book.chapters[0].content = {type:"doc",content:[
      {type:"paragraph",attrs:{align:"center"},content:[{type:"text",text:"A centered dedication"}]},
      {type:"paragraph",attrs:{align:"right"},content:[{type:"text",text:"An author's signature"}]},
      {type:"paragraph",attrs:{align:"left"},content:[{type:"text",text:"Ordinary left-aligned text"}]},
    ]};
    const built = await buildPrintPdf(book, fonts, options);
    expect(built.record.checks.overflow).toBe(0);
    const page = built.record.pages.find(p => p.chapterId === book.chapters[0].id && p.kind === "chapter");
    expect(page?.lineCount).toBeGreaterThan(3);
    expect(page?.minX).toBeGreaterThanOrEqual(page!.left);
    expect(page?.maxX).toBeLessThanOrEqual(page!.right);
  }, 20000);
  it("honors section parity and per-section header and folio visibility", async () => {
    const b = fixture();
    const first = b.chapters[0];
    first.pageLayout = {start:"verso",vertical:"center",header:"hide",pageNumber:"hide",spaceBefore:8,spaceAfter:8};
    const second = b.chapters[1];
    second.pageLayout = {start:"recto",header:"show",pageNumber:"show"};
    const result = await buildPrintPdf(b,fonts,options);
    const firstPages=result.record.pages.filter(p=>p.chapterId===first.id && p.kind!=="blank");
    const secondPages=result.record.pages.filter(p=>p.chapterId===second.id && p.kind!=="blank");
    expect(firstPages[0].page % 2).toBe(0);
    expect(firstPages.every(p=>p.header===undefined && p.footer===undefined)).toBe(true);
    expect(secondPages[0].page % 2).toBe(1);
    expect(secondPages[0].header).toBeDefined();
    // Main-matter folios restart at 1 and exclude the front matter and blanks.
    const firstMainPage=result.record.pages.find(p=>p.chapterId===first.id)!;
    expect(secondPages[0].footer).toBe(String(secondPages[0].page-firstMainPage.page+1));
    expect(result.record.checks.overflow).toBe(0);
  },20000);
  it("vertically offsets short dedication without losing body text", async () => {
    const b=fixture();
    b.chapters[0].showTitle=false;
    b.chapters[0].content={type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"For the readers."}]}]};
    b.chapters[0].pageLayout={vertical:"bottom",pageNumber:"hide",header:"hide",start:"next"};
    const lower=await buildPrintPdf(b,fonts,options);
    const low=lower.record.pages.find(p=>p.chapterId===b.chapters[0].id && p.kind==="chapter")!;
    b.chapters[0].pageLayout={...b.chapters[0].pageLayout,vertical:"top"};
    const upper=await buildPrintPdf(b,fonts,options);
    const high=upper.record.pages.find(p=>p.chapterId===b.chapters[0].id && p.kind==="chapter")!;
    expect(low.minY).toBeLessThan(high.minY);
    expect(low.lineCount).toBe(high.lineCount);
  },20000);
  it("generates a PDF table of contents with front roman and body Arabic folios", async () => {
    const b = fixture();
    const toc = { ...blankChapter("Contents"), sectionType: "toc" as const };
    const preface = { ...blankChapter("Preface"), sectionType: "preface" as const,
      content: { type:"doc", content:[{type:"paragraph", content:[{type:"text",text:"A few words before we begin."}]}]} };
    b.chapters = [preface, toc, ...b.chapters];
    const built = await buildPrintPdf(b, fonts, options);
    const tocPage = built.record.pages.find(p => p.chapterId === toc.id && p.kind === "chapter");
    const first = built.record.pages.find(p => p.chapterId === b.chapters[2].id && p.kind === "chapter");
    expect(tocPage).toBeDefined();
    expect(tocPage?.lineCount).toBeGreaterThanOrEqual(3);
    expect(tocPage?.footer).toMatch(/^[ivxlcdm]+$/);
    expect(first?.footer).toBe("1");
    expect(first?.page).toBeGreaterThan(tocPage!.page);
    const pdf = await PDFDocument.load(built.bytes);
    expect(pdf.getPageCount()).toBe(built.record.pageCount);
    expect(built.record.checks.overflow).toBe(0);
  }, 20000);
  it("embeds and paginates illustrations without clipping or dropping them from backups", async () => {
    const b=fixture();
    const src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAF0lEQVR4nGM0ckthIAUwkaR6VMMI0gAAFWAA9Kg1bTEAAAAASUVORK5CYII=";
    b.chapters[0].content={type:"doc",content:[
      {type:"paragraph",content:[{type:"text",text:"Before the illustration."}]},
      {type:"image",attrs:{src,alt:"An illustrated scene",width:75,align:"center",caption:"Figure 1: Valley map"}},
      {type:"paragraph",content:[{type:"text",text:"After the illustration."}]},
    ]};
    const restored=restoreBook(backupBook(b));
    expect(restored.chapters[0].content).toEqual(b.chapters[0].content);
    const built=await buildPrintPdf(b,fonts,options);
    const pdf=await PDFDocument.load(built.bytes);
    expect(pdf.getPageCount()).toBe(built.record.pageCount);
    const proof=built.record.pages.find(p=>p.chapterId===b.chapters[0].id && p.kind==="chapter")!;
    expect(proof.lineCount).toBeGreaterThan(3);
    expect(proof.minX).toBeGreaterThanOrEqual(proof.left);
    expect(proof.maxX).toBeLessThanOrEqual(proof.right);
    expect(built.record.checks.overflow).toBe(0);
  },20000);
  it("blocks unsupported glyphs and prevents silently replacing manuscript characters", async () => {
    const b = fixture();
    b.chapters[0].content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Unsupported emoji 🛸" }],
        },
      ],
    };
    await expect(buildPrintPdf(b, fonts, options)).rejects.toThrow(
      "cannot represent",
    );
  });
});

describe("bounded PDF justification", () => {
  it("accepts justified print preferences and preserves them in backups", () => {
    const b = fixture();
    b.editions!.print = { ...CLASSIC_PRINT, alignment: "justify" };
    expect(validateBook(b).editions!.print?.alignment).toBe("justify");
    expect(getPrintEdition(restoreBook(backupBook(b))).alignment).toBe("justify");
    expect(() => validateBook({ ...b, editions: {
      ...b.editions, print: { ...CLASSIC_PRINT, alignment: "unsupported" },
    } })).toThrow("Unsupported print alignment");
  });
  it("generates a justified proof without modifying manuscript content", async () => {
    const b = fixture();
    b.editions!.print = { ...CLASSIC_PRINT, alignment: "justify" };
    const before = structuredClone(b.chapters);
    const result = await buildPrintPdf(b, fonts, options);
    expect(result.record.profile.alignment).toBe("justify");
    expect(result.record.checks.overflow).toBe(0);
    expect(result.record.warnings.join(" ")).toContain("capped word-space");
    expect(b.chapters).toEqual(before);
  }, 20000);
});

describe("versioned print templates", () => {
  it("validates all presets and rejects unversioned or altered profiles", () => {
    for (const id of ["classic", "modern", "gothic"] as const) {
      expect(validatePrintEdition(printPreset(id)).template).toEqual({ id, version: 1 });
      expect(printPreset(id).leading).toBe(PRINT_PRESETS[id].leading);
    }
    expect(() => validatePrintEdition({ ...printPreset("gothic"), leading: 60 })).toThrow("Unsupported print profile");
    expect(() => validatePrintEdition({ ...printPreset("modern"), template: { id: "modern", version: 2 } })).toThrow("Unsupported print template");
  });
  it("preserves print design separately from ebook design through local backups", () => {
    const b = fixture();
    const original = structuredClone(b.chapters);
    const ebook = structuredClone(b.editions!.ebook);
    b.editions!.ebook = presetFor("gothic");
    b.editions!.print = printPreset("gothic", "justify");
    const restored = restoreBook(backupBook(b));
    expect(restored.editions!.print).toEqual(b.editions!.print);
    expect(restored.editions!.ebook).toEqual(presetFor("gothic"));
    expect(ebook.template.id).toBe("classic");
    expect(restored.chapters.map(c => c.content)).toEqual(original.map(c => c.content));
  });
  for (const template of ["modern", "gothic"] as const) {
    it(`builds a valid offline ${template} PDF with independent layout and ornaments`, async () => {
      const b = fixture();
      const original = structuredClone(b);
      b.editions!.ebook = presetFor(template);
      b.editions!.print = printPreset(template, "justify");
      b.chapters[0].content = {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "A short opening." }] },
          { type: "scene_break" },
          ...Array.from({ length: 9 }, () => ({ type: "paragraph", content: [{
            type: "text", text: "The old road drew near the gate, while the wind shifted. ".repeat(25),
          }] })),
        ],
      };
      const snapshot = structuredClone(b);
      const result = await buildPrintPdf(b, fonts, options);
      const pdf = await PDFDocument.load(result.bytes);
      expect(pdf.getPageCount()).toBe(result.record.pageCount);
      expect(result.record.profile.template.id).toBe(template);
      expect(result.record.profile.alignment).toBe("justify");
      expect(result.record.checks).toMatchObject({ overflow: 0, splitViolations: 0, fonts: "embedded" });
      expect(result.record.pages.filter(p => p.kind === "chapter").every(p => p.page % 2 === 1)).toBe(true);
      expect(result.record.filename).toContain(template);
      expect(b).toEqual(snapshot);
      expect(b.editions!.ebook).toEqual(presetFor(template));
      expect(original.editions!.ebook.template.id).toBe("classic");
    }, 20000);
  }
});

describe("Design is the source of truth for print templates", () => {
  it("derives a matching PDF preset and retains independent justification", () => {
    for (const template of ["classic", "modern", "gothic"] as const) {
      const b = fixture();
      b.editions!.ebook = presetFor(template);
      b.editions!.print = { ...CLASSIC_PRINT, alignment: "justify" };
      const effective = getPrintEdition(b);
      expect(effective.template.id).toBe(template);
      expect(effective.leading).toBe(PRINT_PRESETS[template].leading);
      expect(effective.alignment).toBe("justify");
      expect(getPrintEdition(restoreBook(backupBook(b)))).toEqual(effective);
    }
  });
  it("uses the ebook choice on existing projects with an obsolete separate print selection", async () => {
    const b = fixture();
    b.editions!.ebook = presetFor("modern");
    b.editions!.print = printPreset("gothic", "justify");
    const before = structuredClone(b);
    const pdf = await buildPrintPdf(b, fonts, options);
    expect(pdf.record.profile.template.id).toBe("modern");
    expect(pdf.record.profile.leading).toBe(PRINT_PRESETS.modern.leading);
    expect(pdf.record.profile.alignment).toBe("justify");
    expect(b).toEqual(before);
  }, 20000);
});

describe("independent paperback typography", () => {
  it("validates and round-trips paperback metrics without modifying ebook settings", () => {
    const book=fixture();
    const ebook=structuredClone(book.editions!.ebook);
    book.editions!.print={...getPrintEdition(book),fontSize:12,leading:18,paragraphSpacing:9,firstLineIndent:22,chapterOpeningSpace:35};
    expect(validatePrintEdition(book.editions!.print)).toEqual(book.editions!.print);
    const restored=restoreBook(backupBook(book));
    expect(getPrintEdition(restored)).toMatchObject({
      fontSize:12,leading:18,paragraphSpacing:9,firstLineIndent:22,chapterOpeningSpace:35
    });
    expect(restored.editions!.ebook).toEqual(ebook);
    for(const changes of [{fontSize:20},{leading:2},{paragraphSpacing:-1},{firstLineIndent:40},{chapterOpeningSpace:130}]){
      expect(()=>validatePrintEdition({...getPrintEdition(book),...changes})).toThrow("Unsupported print profile");
    }
  });
  it("uses custom paragraph spacing and line metrics in actual PDF pagination", async () => {
    const book=fixture();
    const standard=await buildPrintPdf(book,fonts,options);
    book.editions!.print={...getPrintEdition(book),fontSize:12,leading:18,paragraphSpacing:24,firstLineIndent:24,chapterOpeningSpace:50};
    const custom=await buildPrintPdf(book,fonts,options);
    expect(custom.record.profile).toMatchObject({fontSize:12,leading:18,paragraphSpacing:24,firstLineIndent:24,chapterOpeningSpace:50});
    expect(custom.record.pageCount).toBeGreaterThan(standard.record.pageCount);
    expect(custom.record.inputChecksum).not.toBe(standard.record.inputChecksum);
    expect(custom.record.checks.overflow).toBe(0);
  },60000);
});

describe("professional PDF pagination",()=>{
 it("keeps subheadings with text and preserves two-line widow/orphan protection",async()=>{
   const b=fixture();
   b.chapters=[{...blankChapter("Pagination"),content:{type:"doc",content:[
     ...Array.from({length:6},()=>({type:"paragraph",content:[{type:"text",text:"A regular paragraph fills part of the page. ".repeat(25)}]})),
     {type:"heading",attrs:{level:2},content:[{type:"text",text:"Critical subheading"}]},
     {type:"paragraph",content:[{type:"text",text:"A new section opens with a meaningful explanation. ".repeat(19)}]},
     ...Array.from({length:3},()=>({type:"paragraph",content:[{type:"text",text:"The following text continues the narrative. ".repeat(20)}]}))
   ]}}];
   const r=await buildPrintPdf(b,fonts,options);
   expect(r.record.checks.splitViolations).toBe(0);
   expect(r.record.checks.overflow).toBe(0);
   const loaded=await PDFDocument.load(r.bytes);
   expect(loaded.getPageCount()).toBe(r.record.pageCount);
   expect(r.record.pages.some(p=>p.kind==="body")).toBe(true);
 },30000);
 it("uses identical PDF byte generation for preview and export with same inputs",async()=>{
   const b=fixture();
   const a=await buildPrintPdf(b,fonts,options);
   const c=await buildPrintPdf(b,fonts,options);
   expect(a.record.inputChecksum).toBe(c.record.inputChecksum);
   expect(a.record.pageCount).toBe(c.record.pageCount);
   expect(a.record.pages).toEqual(c.record.pages);
 },30000);
});

describe("page layout priorities",()=>{
 it("persists three layout priorities independently of ebook settings",()=>{
   for(const priority of ["automatic","balanced","flow"] as const){
     const b=fixture();const original=structuredClone(b.editions!.ebook);
     b.editions!.print={...getPrintEdition(b),layoutPriority:priority};
     expect(validatePrintEdition(b.editions!.print).layoutPriority).toBe(priority);
     expect(getPrintEdition(restoreBook(backupBook(b))).layoutPriority).toBe(priority);
     expect(b.editions!.ebook).toEqual(original);
   }
   expect(()=>validatePrintEdition({...CLASSIC_PRINT,layoutPriority:"bad" as "automatic"})).toThrow("layout priority");
 });
 it("renders all priorities with no lost pages or split violations",async()=>{
   for(const priority of ["automatic","balanced","flow"] as const){
     const b=fixture();
     b.editions!.print={...getPrintEdition(b),layoutPriority:priority};
     const pdf=await buildPrintPdf(b,fonts,options);
     expect(pdf.record.profile.layoutPriority).toBe(priority);
     expect(pdf.record.checks).toMatchObject({overflow:0,splitViolations:0});
     expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBe(pdf.record.pageCount);
   }
 },60000);
 it("keeps scene ornaments safely inside the page content area",async()=>{
   const b=fixture();
   b.chapters[0].content={type:"doc",content:[
     ...Array.from({length:6},()=>({type:"paragraph",content:[{type:"text",text:"A vivid scene occupies the printed page. ".repeat(20)}]})),
     {type:"scene_break"},
     {type:"paragraph",content:[{type:"text",text:"The next scene begins with an important discovery. ".repeat(8)}]}
   ]};
   const pdf=await buildPrintPdf(b,fonts,options);
   expect(pdf.record.checks.splitViolations).toBe(0);
   expect(pdf.record.checks.overflow).toBe(0);
 },30000);
});

describe("offline PDF hyphenation and justification",()=>{
 it("validates and round-trips language, exclusions and consecutive line limits",()=>{
   const b=fixture();const original=structuredClone(b.editions!.ebook);
   b.editions!.print={...getPrintEdition(b),hyphenate:false,hyphenationLanguage:"en-gb",maxConsecutiveHyphens:1,hyphenationExceptions:"Sorn, Karsk"};
   expect(validatePrintEdition(b.editions!.print)).toEqual(b.editions!.print);
   expect(getPrintEdition(restoreBook(backupBook(b)))).toMatchObject({hyphenate:false,hyphenationLanguage:"en-gb",maxConsecutiveHyphens:1,hyphenationExceptions:"Sorn, Karsk"});
   expect(b.editions!.ebook).toEqual(original);
   expect(()=>validatePrintEdition({...getPrintEdition(b),hyphenationLanguage:"fr" as "en-us"})).toThrow("hyphenation");
 });
 it("generates valid PDF with and without hyphenation without rewriting prose",async()=>{
   const b=fixture();const before=structuredClone(b.chapters);
   for(const hyphenate of [true,false]){
     b.editions!.print={...getPrintEdition(b),hyphenate,alignment:"justify"};
     const result=await buildPrintPdf(b,fonts,options);
     expect(result.record.profile.hyphenate).toBe(hyphenate);
     expect(result.record.checks).toMatchObject({overflow:0,splitViolations:0});
     expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(result.record.pageCount);
     expect(b.chapters).toEqual(before);
   }
 },60000);
});

describe("print proof progress events",()=>{
 it("reports real stages and monotonic section pagination before returning PDF",async()=>{
  const book=fixture();
  const events:{percent:number;stage:string}[]=[];
  const result=await buildPrintPdf(book,fonts,{...options,onProgress:(percent,stage)=>events.push({percent,stage})});
  expect(events.length).toBeGreaterThanOrEqual(4);
  expect(events[0].percent).toBe(5);
  expect(events.some(e=>e.stage.startsWith("Laying out section"))).toBe(true);
  expect(events.at(-1)).toEqual({percent:92,stage:"Writing PDF"});
  expect(events.every((e,i)=>i===0||e.percent>=events[i-1].percent)).toBe(true);
  expect(result.record.pageCount).toBeGreaterThan(0);
 },30000);
});

describe("chapter-ending pagination regression",()=>{
 it("keeps compact chapter endings valid across balanced, automatic and flow settings",async()=>{
  const b=fixture();
  const original=structuredClone(b.chapters);
  b.chapters=[{...b.chapters[0],content:{type:"doc",content:[
   ...Array.from({length:15},()=>({type:"paragraph",content:[{type:"text",text:"The far gate stood beneath the morning clouds. ".repeat(24)}]})),
   {type:"paragraph",content:[{type:"text",text:"A final exchange made the decision inevitable. ".repeat(8)}]},
   {type:"paragraph",content:[{type:"text",text:"Then the door opened and the chapter ended."}]}
  ]}}];
  const saved=structuredClone(b.chapters);
  for(const layoutPriority of ["automatic","balanced","flow"] as const){
   b.editions!.print={...getPrintEdition(b),layoutPriority};
   const result=await buildPrintPdf(b,fonts,options);
   expect(result.record.checks).toMatchObject({overflow:0,splitViolations:0});
   expect(result.record.pages.filter(p=>p.chapterId===b.chapters[0].id).length).toBeGreaterThan(1);
   expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(result.record.pageCount);
   expect(b.chapters).toEqual(saved);
  }
  expect(original).toHaveLength(3);
 },60000);
});

describe("facing-page balancing",()=>{
 it("keeps verso/recto geometry, chapter openings, and local manuscript intact",async()=>{
  const b=fixture();
  b.chapters=[{...b.chapters[0],content:{type:"doc",content:[
    ...Array.from({length:8},()=>({type:"paragraph",content:[{type:"text",text:"A distant landmark emerged beyond the river. ".repeat(33)}]})),
    {type:"paragraph",content:[{type:"text",text:"The last conversation continued long into the night. ".repeat(130)}]}
  ]}}];
  const before=structuredClone(b.chapters);
  const results=[];
  for(const layoutPriority of ["automatic","balanced"] as const){
    b.editions!.print={...getPrintEdition(b),layoutPriority};
    const proof=await buildPrintPdf(b,fonts,options);
    expect(proof.record.checks).toMatchObject({splitViolations:0,overflow:0});
    expect(proof.record.pages.filter(p=>p.kind==="chapter").every(p=>p.page%2===1)).toBe(true);
    for(const page of proof.record.pages){
      if(page.kind==="blank")continue;
      expect(page.left).toBeGreaterThan(0);
      expect(page.right).toBeLessThan(PRINT_TRIMS["6x9"].width);
    }
    expect((await PDFDocument.load(proof.bytes)).getPageCount()).toBe(proof.record.pageCount);
    expect(b.chapters).toEqual(before);
    results.push(proof.record);
  }
  expect(results[1].profile.layoutPriority).toBe("balanced");
 },60000);
});

describe("paperback heading presentation",()=>{
 it("renders optional chapter labels and scalable front headings without modifying source",async()=>{
  const b=fixture();
  b.chapters=[{...blankChapter("Foreword"),sectionType:"preface",content:{type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"Before the journey."}]}]}},...b.chapters];
  const source=structuredClone(b.chapters);
  for(const chapterNumberStyle of ["arabic","roman","none"] as const){
    b.editions!.print={...getPrintEdition(b),chapterNumberStyle,frontMatterTitleScale:1.2};
    const built=await buildPrintPdf(b,fonts,options);
    expect(built.record.profile).toMatchObject({chapterNumberStyle,frontMatterTitleScale:1.2});
    expect(built.record.checks).toMatchObject({overflow:0,splitViolations:0});
    expect(built.record.pages.filter(p=>p.kind==="chapter").every(p=>p.page%2===1)).toBe(true);
    expect(b.chapters).toEqual(source);
  }
 },60000);
 it("rejects unsupported heading presentation settings and preserves round-trip configuration",()=>{
  const b=fixture();
  b.editions!.print={...getPrintEdition(b),chapterNumberStyle:"roman",frontMatterTitleScale:1.3};
  const restored=restoreBook(backupBook(b));
  expect(getPrintEdition(restored)).toMatchObject({chapterNumberStyle:"roman",frontMatterTitleScale:1.3});
  expect(()=>validatePrintEdition({...getPrintEdition(b),frontMatterTitleScale:3})).toThrow("front matter");
  expect(()=>validatePrintEdition({...getPrintEdition(b),chapterNumberStyle:"words" as "roman"})).toThrow("chapter numbering");
 });
});
