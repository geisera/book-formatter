import { classifyImportedSection } from "./import-classify";
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
  type: "paragraph" | "heading" | "scene_break" | "image";
  content?: Inline[];
  level?: number;
  attrs?: {src: string; alt: string; width: number; align: string; caption?: string};
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
  const h1AreSectionWrappers=draft.blocks.filter(b=>b.type==="heading"&&b.level===1).every(b=>{
    const guess=classifyImportedSection(blockText(b),0,1);
    return guess.confidence==="high" && guess.type!=="chapter";
  });
  return h2>1 && (h1===1 || h1AreSectionWrappers) ? "h2" : h1 ? "h1" : h2 ? "h2" : "none";
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
    const candidate=block.type==="heading" ? classifyImportedSection(blockText(block),0,1) : null;
    const recognized=mode==="auto" && block.type==="heading" && (block.level===1||block.level===2) &&
      candidate?.confidence==="high" && candidate.type!=="chapter";
    if (block.type === "heading" && (`h${block.level}` === level || recognized)) {
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
  const inferredBookTitle=draft.filename.replace(/\.[^.]+$/,"").replace(/[_-]+/g," ");
  return chapters.map((chapter,index)=>{
    const guess=classifyImportedSection(chapter.title,index,chapters.length,inferredBookTitle);
    return guess.type==="chapter" ? chapter : {...chapter,sectionType:guess.type};
  });
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
