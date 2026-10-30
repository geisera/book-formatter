import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createBook, blankChapter } from "../lib/model";
import { buildPrintPdf, type PrintFonts } from "../lib/print";
const fonts: PrintFonts = Object.fromEntries(
  [
    ["regular", "regular"],
    ["bold", "bold"],
    ["italic", "italic"],
    ["boldItalic", "bold-italic"],
  ].map(([key, file]) => [
    key,
    new Uint8Array(readFileSync(`public/epub-fonts/${file}.woff`)),
  ]),
) as PrintFonts;
mkdirSync("artifacts/print", { recursive: true });
const novel = createBook("The Lantern Road", "Test Author");
novel.id = "print-novel";
novel.updatedAt = "2026-10-30T12:00:00Z";
const paragraph =
  "The road wound past the old stone tower, where morning light fell across the river. A traveller paused beside the gate and listened to the distant bells. Beyond the wall, the market was waking, its voices carried by the cool air. The journey would begin with a promise, and end somewhere that no map could name. ";
novel.chapters = Array.from({ length: 40 }, (_, i) => ({
  ...blankChapter(`Chapter ${i + 1}: The Road Ahead`),
  id: `chapter-${i + 1}`,
  content: {
    type: "doc",
    content: Array.from({ length: 25 }, (_, j) => ({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: `Passage ${i + 1}-${j + 1}. ` + paragraph.repeat(2),
          ...(j % 7 === 0 ? { marks: [{ type: "em" }] } : {}),
        },
      ],
    })),
  },
}));
const small = createBook("A Lantern in the Rain", "Test Author");
small.id = "print-proof";
small.updatedAt = "2026-10-30T12:00:00Z";
small.chapters = [
  {
    ...blankChapter("The Last Light"),
    id: "opening",
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "The lantern burned " },
            { type: "text", text: "gold", marks: [{ type: "strong" }] },
            { type: "text", text: " against the rain. " },
            { type: "text", text: "Mara waited.", marks: [{ type: "em" }] },
          ],
        },
        ...Array.from({ length: 25 }, () => ({
          type: "paragraph",
          content: [{ type: "text", text: paragraph }],
        })),
        { type: "scene_break" },
        {
          type: "heading",
          content: [{ type: "text", text: "A map of elsewhere" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "The café door opened. ",
              marks: [{ type: "em" }, { type: "strong" }],
            },
            { type: "text", text: paragraph.repeat(12) },
          ],
        },
      ],
    },
  },
  {
    ...blankChapter("The Other Shore"),
    id: "second",
    content: {
      type: "doc",
      content: Array.from({ length: 40 }, () => ({
        type: "paragraph",
        content: [{ type: "text", text: paragraph }],
      })),
    },
  },
];
async function main() {
  for (const [name, book] of [
    ["sample", small],
    ["novel", novel],
  ] as const) {
    const result = await buildPrintPdf(book, fonts, {
      id: `proof-${name}`,
      createdAt: "2026-10-30T12:00:00Z",
    });
    writeFileSync(`artifacts/print/${name}.pdf`, result.bytes);
    writeFileSync(
      `artifacts/print/${name}.json`,
      JSON.stringify(result.record, null, 2),
    );
    writeFileSync(`artifacts/print/${name}-source.json`, JSON.stringify(book));
    console.log(
      `${name}: ${result.record.pageCount} pages, ${result.bytes.length} bytes`,
    );
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
