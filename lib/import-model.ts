import { CLASSIC_PRINT } from "./print-profile";
import { CLASSIC_EDITION } from "./edition";
import {
  blankChapter,
  newId,
  schema,
  type Book,
  type Chapter,
  type SourceFile,
} from "./model";
export type Diagnostic = { severity: "warning" | "info"; message: string };
export type Inline = {
  type: "text";
  text: string;
  marks?: { type: "em" | "strong" }[];
};
export type ImportBlock = {
  type: "paragraph" | "heading" | "scene_break";
  content?: Inline[];
  level?: number;
};
export type ImportDraft = {
  filename: string;
  format: "docx" | "markdown" | "text";
  blocks: ImportBlock[];
  diagnostics: Diagnostic[];
};
export type SplitMode = "auto" | "h1" | "h2" | "none";
export const blockText = (block: ImportBlock) =>
  block.content?.map((x) => x.text).join("") ?? "";
export function suggestedSplit(draft: ImportDraft): SplitMode {
  const h1 = draft.blocks.filter(
    (b) => b.type === "heading" && b.level === 1,
  ).length;
  const h2 = draft.blocks.filter(
    (b) => b.type === "heading" && b.level === 2,
  ).length;
  return h1 === 1 && h2 > 1 ? "h2" : h1 ? "h1" : h2 ? "h2" : "none";
}
export function splitChapters(draft: ImportDraft, mode: SplitMode): Chapter[] {
  const level = mode === "auto" ? suggestedSplit(draft) : mode;
  const chapters: Chapter[] = [];
  let title = "Opening matter";
  let content: Record<string, unknown>[] = [];
  function flush() {
    if (content.length || title !== "Opening matter") {
      const doc = {
        type: "doc",
        content: content.length ? content : [{ type: "paragraph" }],
      };
      schema.nodeFromJSON(doc).check();
      chapters.push({ ...blankChapter(title), content: doc });
    }
    content = [];
  }
  for (const block of draft.blocks) {
    if (block.type === "heading" && `h${block.level}` === level) {
      flush();
      title = blockText(block).trim() || "Untitled section";
    } else {
      const { level: _, ...node } = block;
      content.push({
        ...node,
        ...(block.type === "heading" ? { attrs: { level: 2 } } : {}),
      });
    }
  }
  flush();
  if (chapters.length === 1 && chapters[0].title === "Opening matter")
    chapters[0].title = "Manuscript";
  return chapters;
}
export function importedBook(
  draft: ImportDraft,
  chapters: Chapter[],
  title: string,
  author: string,
  bytes: Uint8Array,
): { book: Book; source: SourceFile } {
  const id = newId();
  const importedAt = new Date().toISOString();
  const book: Book = {
    id,
    schemaVersion: 1,
    revision: 0,
    title: title.trim() || "Untitled book",
    author: author.trim(),
    updatedAt: importedAt,
    chapters,
    editions: { ebook: { ...CLASSIC_EDITION }, print: { ...CLASSIC_PRINT } },
    importInfo: {
      filename: draft.filename,
      format: draft.format,
      importedAt,
      diagnostics: draft.diagnostics,
    },
  };
  return {
    book,
    source: {
      bookId: id,
      filename: draft.filename,
      bytes,
      format: draft.format,
    },
  };
}
