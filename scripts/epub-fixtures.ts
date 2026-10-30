import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildEpub, type FontAssets } from "../lib/epub";
import { createBook, blankChapter } from "../lib/model";
import { getEbookEdition } from "../lib/edition";
const fonts: FontAssets = {
  regular: new Uint8Array(readFileSync("public/epub-fonts/regular.woff")),
  italic: new Uint8Array(readFileSync("public/epub-fonts/italic.woff")),
  bold: new Uint8Array(readFileSync("public/epub-fonts/bold.woff")),
  license: new Uint8Array(
    readFileSync("public/licenses/Libre-Baskerville-OFL.txt"),
  ),
};
mkdirSync("artifacts/epub", { recursive: true });
for (const ornament of ["asterisks", "diamonds", "rule"] as const) {
  const book = createBook("A Book & Its <World> — café", "Test Author");
  book.id = `epub-fixture-${ornament}`;
  book.updatedAt = "2026-10-30T12:00:00Z";
  book.language = "en";
  book.editions = {
    ebook: {
      ...getEbookEdition(book),
      sceneOrnament: ornament,
      ...(ornament === "rule"
        ? { bodyFont: "georgia" as const, headingStyle: "left" as const }
        : {}),
    },
  };
  book.chapters = [
    {
      ...blankChapter("Chapter One & the Gate"),
      id: "one",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "The café <opens> & “welcomes” readers. ",
                marks: [{ type: "strong" }],
              },
              {
                type: "text",
                text: "An italic line.",
                marks: [{ type: "em" }],
              },
            ],
          },
          { type: "scene_break" },
          {
            type: "heading",
            content: [{ type: "text", text: "A smaller heading" }],
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Another scene.\nAnother line." }],
          },
        ],
      },
    },
    {
      ...blankChapter("Chapter Two"),
      id: "two",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "The second chapter." }],
          },
        ],
      },
    },
  ];
  const result = buildEpub(book, fonts, {
    id: `fixture-${ornament}`,
    createdAt: "2026-10-30T12:00:00Z",
  });
  writeFileSync(`artifacts/epub/${ornament}.epub`, result.bytes);
}
const novel = createBook("The Long Road", "Test Author");
novel.id = "long-novel";
novel.updatedAt = "2026-10-30T12:00:00Z";
novel.chapters = Array.from({ length: 40 }, (_, i) => ({
  ...blankChapter(`Chapter ${i + 1}`),
  id: `chapter-${i}`,
  content: {
    type: "doc",
    content: Array.from({ length: 20 }, () => ({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "one two three four five six seven eight nine ten. ".repeat(10),
        },
      ],
    })),
  },
}));
writeFileSync(
  "artifacts/epub/novel.epub",
  buildEpub(novel, fonts, {
    id: "fixture-novel",
    createdAt: "2026-10-30T12:00:00Z",
  }).bytes,
);
