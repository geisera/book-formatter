import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { createBook, blankChapter, validateBook } from "../lib/model";
import { CLASSIC_PRINT, getPrintEdition } from "../lib/print-profile";
import { buildPrintPdf, type PrintFonts } from "../lib/print";
import { backupBook, restoreBook } from "../lib/backup";
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
