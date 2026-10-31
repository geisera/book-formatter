import { recoverDocxImages } from "../lib/docx-images";
import "fake-indexeddb/auto";
import { afterEach, describe, it, expect } from "vitest";
import { zipSync, unzipSync, strFromU8, strToU8 } from "fflate";
import {
  importBytes,
  inspectDocx,
  parseConvertedHtml,
  parseMarkdown,
  parsePlainText,
} from "../lib/import";
import {
  importedBook,
  splitChapters,
  suggestedSplit,
} from "../lib/import-model";
import { schema, createBook } from "../lib/model";
import { db, saveImportedBook } from "../lib/storage";
import { backupBook, restoreProject } from "../lib/backup";
import { docxFixture } from "./fixtures";
afterEach(async () => {
  await db.books.clear();
  await db.sources.clear();
});
describe("semantic manuscript import", () => {
  it("preserves emphasis and scene breaks while detecting chapter headings", () => {
    const draft = parseMarkdown(
      "# Chapter One\n\nA **bold** and *quiet* opening.\n\n***\n\n# Chapter Two\n\nThe end.",
    );
    const chapters = splitChapters(draft, "auto");
    expect(chapters.map((x) => x.title)).toEqual([
      "Chapter One",
      "Chapter Two",
    ]);
    const doc = schema.nodeFromJSON(chapters[0].content);
    expect(doc.child(1).type.name).toBe("scene_break");
    expect(doc.child(0).child(1).marks[0].type.name).toBe("strong");
    expect(doc.child(0).child(3).marks[0].type.name).toBe("em");
  });
  it("keeps front matter and nested headings without losing text", () => {
    const d = parseMarkdown(
      "# A Novel\n\nDedication.\n\n## One\n\nFirst.\n\n### Inside\n\nMore.\n\n## Two\n\nSecond.",
    );
    expect(suggestedSplit(d)).toBe("h2");
    const c = splitChapters(d, "auto");
    expect(c.map((x) => x.title)).toEqual(["Opening matter", "One", "Two"]);
    expect(schema.nodeFromJSON(c[1].content).textContent).toContain("Inside");
    expect(splitChapters(d, "none")).toHaveLength(1);
  });
  it("detects text chapters without requiring blank lines", () => {
    const d = parsePlainText(
      "Prologue\r\nRain fell.\r\n\r\n***\r\nChapter 1\r\nAnother paragraph.",
    );
    expect(splitChapters(d, "auto").map((c) => c.title)).toEqual([
      "Prologue",
      "Chapter 1",
    ]);
  });
  it("never turns imported HTML or URLs into executable editor nodes", () => {
    const d = parseConvertedHtml(
      '<h1>Opening</h1><p><a href="javascript:alert(1)">Click</a> <img src="https://example.invalid/tracker" alt="Map"/></p><script>alert(1)</script><table><tr><td>A</td><td>B</td></tr></table>',
      "test.docx",
    );
    const c = splitChapters(d, "auto");
    expect(JSON.stringify(c)).not.toContain("javascript:");
    expect(JSON.stringify(c)).not.toContain("tracker");
    expect(JSON.stringify(c)).not.toContain("alert(1)");
    expect(JSON.stringify(c)).toContain("[Image: Map]");
    expect(d.diagnostics.length).toBeGreaterThanOrEqual(4);
  });
  it("warns about flattened lists and literal Markdown HTML", () => {
    const d = parseMarkdown(
      "# One\n\n- first\n- second\n\n<script>alert(1)</script>",
    );
    expect(d.diagnostics.some((x) => x.message.includes("Lists"))).toBe(true);
    expect(d.diagnostics.some((x) => x.message.includes("Raw HTML"))).toBe(
      true,
    );
    expect(
      schema.nodeFromJSON(splitChapters(d, "auto")[0].content).textContent,
    ).toContain("<script>");
  });
  it("rejects empty files and non UTF text and accepts BOM-marked UTF16", async () => {
    expect(() => parsePlainText(" \n\n")).toThrow("No readable");
    await expect(importBytes(new Uint8Array([0xff]), "x.txt")).rejects.toThrow(
      "encoding",
    );
    const bytes = new Uint8Array([
      0xff,
      0xfe,
      ...Array.from("Story").flatMap((c) => [c.charCodeAt(0), 0]),
    ]);
    expect(
      (await importBytes(bytes, "x.txt")).blocks[0].content?.[0].text,
    ).toBe("Story");
  });
  it("accepts a minimal DOCX but rejects traversal and expansion bombs", () => {
    expect(inspectDocx(docxFixture())).toEqual([]);
    expect(() => inspectDocx(zipSync({ "../bad.xml": strToU8("x") }))).toThrow(
      "unsafe",
    );
    expect(() =>
      inspectDocx(zipSync({ "word/document.xml": new Uint8Array(16_000_000) })),
    ).toThrow("expansion");
    expect(() =>
      inspectDocx(
        zipSync({
          "[Content_Types].xml": strToU8("x"),
          "word/document.xml": strToU8("<!DOCTYPE x><w:doc/>"),
        }),
      ),
    ).toThrow("entities");
  });
  it("turns embedded DOCX image data into ordered manuscript image blocks", () => {
    const src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAF0lEQVR4nGM0ckthIAUwkaR6VMMI0gAAFWAA9Kg1bTEAAAAASUVORK5CYII=";
    const draft=parseConvertedHtml(
      `<h1>Chapter One</h1><p>Before <img src="${src}" alt="Map of the valley"/> after</p><p>Following paragraph.</p>`,
      "illustrated.docx"
    );
    expect(draft.blocks.map(b=>b.type)).toEqual(["heading","paragraph","image","paragraph","paragraph"]);
    const chapters=splitChapters(draft,"auto");
    const doc=schema.nodeFromJSON(chapters[0].content);
    expect(doc.child(0).textContent).toContain("Before");
    expect(doc.child(1).type.name).toBe("image");
    expect(doc.child(1).attrs.alt).toBe("Map of the valley");
    expect(doc.child(2).textContent).toContain("after");
    expect(doc.child(3).textContent).toContain("Following");
    const project=importedBook(draft,chapters,"Test","Author",strToU8("source"));
    expect(restoreProject(backupBook(project.book,project.source)).book.chapters[0].content).toEqual(chapters[0].content);
  });
  it("attaches a labeled DOCX caption to the preceding image", () => {
    const src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAF0lEQVR4nGM0ckthIAUwkaR6VMMI0gAAFWAA9Kg1bTEAAAAASUVORK5CYII=";
    const draft=parseConvertedHtml(`<p><img src="${src}" alt="An illustration"/></p><p>Figure 1: The watchtower.</p><p>Further prose.</p>`,"captions.docx");
    expect(draft.blocks.map(b=>b.type)).toEqual(["image","paragraph"]);
    expect(draft.blocks[1].content?.[0].text).toBe("Further prose.");
    expect(draft.blocks[0].attrs?.caption).toBe("Figure 1: The watchtower.");
    expect(splitChapters(draft,"none")[0].content).toMatchObject({type:"doc"});
  });
  it("imports images nested inside hyperlinks and formatting wrappers without placeholders", () => {
    const src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAF0lEQVR4nGM0ckthIAUwkaR6VMMI0gAAFWAA9Kg1bTEAAAAASUVORK5CYII=";
    const draft=parseConvertedHtml(
      `<h1>Chapter One</h1><p>Before <a href="https://example.org/"><strong>linked <img src="${src}"/></strong></a> after</p><p><em><img src="${src}" alt="Nested illustration"/></em></p>`,
      "nested-illustrations.docx",
    );
    const images=draft.blocks.filter(block=>block.type==="image");
    expect(images).toHaveLength(2);
    expect(images[0].attrs?.alt).toBe("Imported illustration 1");
    expect(images[1].attrs?.alt).toBe("Nested illustration");
    expect(draft.blocks.map(b=>b.type)).toEqual(["heading","paragraph","image","paragraph","image"]);
    expect(JSON.stringify(draft.blocks)).not.toContain("[Image:");
    const chapter=splitChapters(draft,"auto")[0];
    expect(schema.nodeFromJSON(chapter.content).child(1).type.name).toBe("image");
    expect(draft.diagnostics.some(d=>d.message.includes("alternative text"))).toBe(true);
  });
  it("recovers the real embedded PNG through DOCX relationship when conversion leaves a placeholder", () => {
    const original=unzipSync(docxFixture());
    const src="iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAF0lEQVR4nGM0ckthIAUwkaR6VMMI0gAAFWAA9Kg1bTEAAAAASUVORK5CYII=";
    original["word/media/image1.png"]=Uint8Array.from(atob(src),c=>c.charCodeAt(0));
    original["word/_rels/document.xml.rels"]=strToU8(
      strFromU8(original["word/_rels/document.xml.rels"]).replace("</Relationships>",
        '<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/></Relationships>'));
    original["word/document.xml"]=strToU8(
      strFromU8(original["word/document.xml"]).replace("</w:body>",
        '<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><a:graphic><a:blip r:embed="rId6"/></a:graphic></wp:inline></w:drawing></w:r></w:p></w:body>'));
    const draft=parseConvertedHtml('<h1>Chapter One</h1><p>Before <img alt=""/> after.</p>',"test.docx");
    const recovered=recoverDocxImages(zipSync(original),draft);
    expect(recovered.blocks.map(b=>b.type)).toEqual(["heading","paragraph","image","paragraph"]);
    expect(recovered.blocks[2].attrs?.src).toContain("data:image/png;base64,");
    expect(JSON.stringify(recovered.blocks)).not.toContain("[Image:");
    const chapters=splitChapters(recovered,"auto");
    expect(schema.nodeFromJSON(chapters[0].content).child(1).type.name).toBe("image");
    expect(recovered.diagnostics.some(d=>d.message.includes("Recovered 1 image"))).toBe(true);
  });
  it("keeps remote DOCX image references as inert placeholders", () => {
    const draft=parseConvertedHtml('<p>Start <img src="https://example.org/track.png" alt="Bad source"/> end.</p>',"bad.docx");
    expect(draft.blocks.some(b=>b.type==="image")).toBe(false);
    expect(JSON.stringify(draft.blocks)).toContain("[Image: Bad source]");
    expect(JSON.stringify(draft.blocks)).not.toContain("example.org");
  });
  it("imports a real DOCX drawing relationship into an embedded raster block", async () => {
    const archive=unzipSync(docxFixture());
    const imageBase64="iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAF0lEQVR4nGM0ckthIAUwkaR6VMMI0gAAFWAA9Kg1bTEAAAAASUVORK5CYII=";
    archive["word/media/illustration.png"]=Uint8Array.from(atob(imageBase64),c=>c.charCodeAt(0));
    const originalXml=strFromU8(archive["word/document.xml"]);
    const drawing='<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><wp:extent cx="127000" cy="127000"/><wp:docPr id="1" name="Image 1" descr="Map of the fictional city"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="illustration.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage1"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:prstGeom prst="rect"/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
    archive["word/document.xml"]=strToU8(originalXml.replace("</w:body>",drawing+"</w:body>"));
    archive["word/_rels/document.xml.rels"]=strToU8(strFromU8(archive["word/_rels/document.xml.rels"]).replace("</Relationships>",'<Relationship Id="rIdImage1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/illustration.png"/></Relationships>'));
    archive["[Content_Types].xml"]=strToU8(strFromU8(archive["[Content_Types].xml"]).replace("</Types>",'<Default Extension="png" ContentType="image/png"/></Types>'));
    const bytes=zipSync(archive);
    const draft=await importBytes(bytes,"illustrated.docx");
    const images=draft.blocks.filter(b=>b.type==="image");
    expect(images).toHaveLength(1);
    expect(images[0].attrs?.src).toMatch(/^data:image\/png;base64,/);
    const chapters=splitChapters(draft,"auto");
    expect(chapters.some(c=>JSON.stringify(c.content).includes('Map of the fictional city'))).toBe(true);
    const project=importedBook(draft,chapters,"Illustrated","Author",bytes);
    const restored=restoreProject(backupBook(project.book,project.source));
    expect(restored.book.chapters.map(c=>c.content)).toEqual(project.book.chapters.map(c=>c.content));
  });
  it("stores original bytes atomically and carries them through backup/restore", async () => {
    const bytes = strToU8("# One\n\nA story.");
    const d = await importBytes(bytes, "novel.md");
    const p = importedBook(d, splitChapters(d, "auto"), "Novel", "Tony", bytes);
    const saved = await saveImportedBook(p.book, p.source);
    const stored = await db.sources.get(saved.id);
    expect(stored?.bytes).toEqual(bytes);
    const restored = restoreProject(backupBook(saved, stored));
    expect(restored.book.id).not.toBe(saved.id);
    expect(restored.source?.bytes).toEqual(bytes);
    expect(restored.source?.bookId).toBe(restored.book.id);
    expect(restored.book.importInfo?.filename).toBe("novel.md");
  });
  it("rolls back a bad import without leaving orphan source bytes", async () => {
    const d = parsePlainText("Story");
    const p = importedBook(
      d,
      splitChapters(d, "auto"),
      "Broken",
      "",
      strToU8("Story"),
    );
    p.book.chapters = [];
    await expect(saveImportedBook(p.book, p.source)).rejects.toThrow();
    expect(await db.books.count()).toBe(0);
    expect(await db.sources.count()).toBe(0);
  });
  it("imports a full-length chapter-based novel", () => {
    const text = Array.from(
      { length: 40 },
      (_, i) =>
        `# Chapter ${i + 1}\n\n${"one two three four five six seven eight nine ten. ".repeat(200)}`,
    ).join("\n\n");
    const d = parseMarkdown(text);
    const c = splitChapters(d, "auto");
    expect(c).toHaveLength(40);
    for (const chapter of c) schema.nodeFromJSON(chapter.content).check();
    expect(
      c
        .map((x) => schema.nodeFromJSON(x.content).textContent)
        .join(" ")
        .split(/\s+/),
    ).toHaveLength(80_000);
  });
});

it("does not generate a backup larger than the restore expansion limit", () => {
  const book = createBook("Large", "");
  book.chapters[0].content = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "x".repeat(50_000_001) }],
      },
    ],
  };
  expect(() => backupBook(book)).toThrow("expanded backup limit");
});
