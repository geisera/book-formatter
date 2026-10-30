import { CLASSIC_EDITION, validateEdition, type EbookEdition } from "./edition";
export function newId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
import { Schema } from "prosemirror-model";
export const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      toDOM: () => ["p", 0],
      parseDOM: [{ tag: "p" }],
    },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { level: { default: 2 } },
      toDOM: () => ["h2", 0],
      parseDOM: [{ tag: "h2" }],
    },
    scene_break: {
      group: "block",
      toDOM: () => ["hr"],
      parseDOM: [{ tag: "hr" }],
    },
    text: { group: "inline" },
  },
  marks: {
    strong: {
      toDOM: () => ["strong", 0],
      parseDOM: [{ tag: "strong" }, { tag: "b" }],
    },
    em: { toDOM: () => ["em", 0], parseDOM: [{ tag: "em" }, { tag: "i" }] },
  },
});
export type Chapter = {
  id: string;
  title: string;
  content: Record<string, unknown>;
};
export type SourceFile = {
  bookId: string;
  filename: string;
  format: "docx" | "markdown" | "text";
  bytes: Uint8Array;
};
export type ImportInfo = {
  filename: string;
  format: "docx" | "markdown" | "text";
  importedAt: string;
  diagnostics: { severity: "warning" | "info"; message: string }[];
};
export type Book = {
  id: string;
  schemaVersion: 1;
  revision: number;
  title: string;
  author: string;
  language?: string;
  updatedAt: string;
  chapters: Chapter[];
  importInfo?: ImportInfo;
  editions?: { ebook: EbookEdition };
};
export function blankChapter(title = "Untitled chapter"): Chapter {
  return {
    id: newId(),
    title,
    content: { type: "doc", content: [{ type: "paragraph" }] },
  };
}
export function createBook(title: string, author: string): Book {
  return {
    id: newId(),
    schemaVersion: 1,
    revision: 0,
    title,
    author,
    language: "en",
    updatedAt: new Date().toISOString(),
    chapters: [blankChapter("Chapter One")],
    editions: { ebook: { ...CLASSIC_EDITION } },
  };
}
export function validateBook(value: unknown): Book {
  if (!value || typeof value !== "object") throw Error("Invalid project.");
  const b = value as Book;
  if (
    b.schemaVersion !== 1 ||
    typeof b.id !== "string" ||
    typeof b.title !== "string" ||
    typeof b.author !== "string" ||
    !Number.isSafeInteger(b.revision) ||
    b.revision < 0 ||
    typeof b.updatedAt !== "string" ||
    !Array.isArray(b.chapters) ||
    !b.chapters.length ||
    b.chapters.length > 10000
  )
    throw Error("Unsupported or damaged project.");
  if (b.language !== undefined && typeof b.language !== "string")
    throw Error("Invalid publication language.");
  if (b.importInfo) {
    const info = b.importInfo;
    if (
      typeof info.filename !== "string" ||
      !["docx", "markdown", "text"].includes(info.format) ||
      typeof info.importedAt !== "string" ||
      !Array.isArray(info.diagnostics) ||
      info.diagnostics.some(
        (d) =>
          !d ||
          !["warning", "info"].includes(d.severity) ||
          typeof d.message !== "string",
      )
    )
      throw Error("Invalid import information.");
  }
  if (b.editions !== undefined) {
    if (
      !b.editions ||
      typeof b.editions !== "object" ||
      Object.keys(b.editions).some((key) => key !== "ebook")
    )
      throw Error("Unsupported edition settings.");
    validateEdition(b.editions.ebook);
  }
  const ids = new Set<string>();
  for (const c of b.chapters) {
    if (
      !c ||
      typeof c.id !== "string" ||
      ids.has(c.id) ||
      typeof c.title !== "string"
    )
      throw Error("Invalid chapter structure.");
    ids.add(c.id);
    schema.nodeFromJSON(c.content).check();
  }
  return b;
}

export function validateSource(book: Book, source: SourceFile): SourceFile {
  if (
    source.bookId !== book.id ||
    typeof source.filename !== "string" ||
    !["docx", "markdown", "text"].includes(source.format) ||
    !(source.bytes instanceof Uint8Array) ||
    source.bytes.length > 10_000_000
  )
    throw Error("Invalid original manuscript file.");
  if (
    book.importInfo &&
    (book.importInfo.filename !== source.filename ||
      book.importInfo.format !== source.format)
  )
    throw Error("The original file does not match the import information.");
  return source;
}
