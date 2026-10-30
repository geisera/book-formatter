import { validateImageAttrs, embeddedImages, MAX_PROJECT_IMAGES_BYTES } from "./images";
import {
  CLASSIC_PRINT,
  validatePrintEdition,
  type PrintEdition,
} from "./print-profile";
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
export const TEXT_ALIGNMENTS = ["left", "center", "right", "justify"] as const;
export type TextAlignment = (typeof TEXT_ALIGNMENTS)[number];
const blockAlignment = { align: { default: null } };
const blockDomAttributes = (node: { attrs: { align?: TextAlignment | null } }) =>
  node.attrs.align ? { style: `text-align: ${node.attrs.align}` } : {};
export const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      group: "block",
      content: "inline*",
      attrs: blockAlignment,
      toDOM: (node) => ["p", blockDomAttributes(node), 0],
      parseDOM: [{ tag: "p", getAttrs: (dom) => ({ align: (dom as HTMLElement).style.textAlign || null }) }],
    },
    heading: {
      group: "block",
      content: "inline*",
      attrs: { level: { default: 2 }, ...blockAlignment },
      toDOM: (node) => ["h2", blockDomAttributes(node), 0],
      parseDOM: [{ tag: "h2", getAttrs: (dom) => ({ align: (dom as HTMLElement).style.textAlign || null }) }],
    },
    image: {
      group: "block",
      atom: true,
      draggable: true,
      attrs: {src: {}, alt: {default: ""}, width: {default: 100}, align: {default: "center"}, caption: {default: ""}},
      toDOM: node => ["figure", {class: "manuscript-image", style: `text-align:${node.attrs.align}`},
        ["img", {src: node.attrs.src, alt: node.attrs.alt, style: `width:${node.attrs.width}%;height:auto`}],
        ...(node.attrs.caption ? [["figcaption", node.attrs.caption]] : [])
      ],
      parseDOM: [],
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
export const SECTION_TYPES = ["chapter", "prologue", "epilogue", "interlude", "part", "half-title", "title", "copyright", "dedication", "epigraph", "toc", "preface", "about-author", "also-by", "notes", "acknowledgments", "custom"] as const;
export type SectionType = (typeof SECTION_TYPES)[number];
export const sectionMatter = (type: SectionType): "front" | "body" | "back" =>
  (["half-title", "title", "copyright", "dedication", "epigraph", "toc", "preface"] as string[]).includes(type) ? "front" :
  (["about-author", "also-by", "notes", "acknowledgments"] as string[]).includes(type) ? "back" : "body";
export const defaultShowSectionTitle = (type: SectionType = "chapter"): boolean =>
  !["dedication", "epigraph", "copyright", "title"].includes(type);
export const showSectionTitle = (section: Chapter): boolean =>
  section.showTitle ?? defaultShowSectionTitle(section.sectionType);
export type PageStart = "next" | "recto" | "verso";
export type VerticalPlacement = "top" | "center" | "bottom";
export type PageDecoration = "auto" | "show" | "hide";
export type SectionPageLayout = {
  start: PageStart;
  vertical: VerticalPlacement;
  header: PageDecoration;
  pageNumber: PageDecoration;
  spaceBefore: number;
  spaceAfter: number;
};
export function defaultSectionLayout(type: SectionType = "chapter"): SectionPageLayout {
  const matter = sectionMatter(type);
  return {
    start: matter === "body" ? "recto" : "next",
    vertical: ["dedication", "epigraph", "half-title", "title"].includes(type) ? "center" : "top",
    header: matter === "front" ? "hide" : "auto",
    pageNumber: matter === "front" ? (["toc", "preface"].includes(type) ? "show" : "hide") : "auto",
    spaceBefore: 0,
    spaceAfter: 0,
  };
}
export function getSectionLayout(section: Chapter): SectionPageLayout {
  return { ...defaultSectionLayout(section.sectionType), ...section.pageLayout };
}
export function validateSectionLayout(value: unknown): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid section page layout.");
  const o = value as Record<string, unknown>;
  if (Object.keys(o).some(k => !["start","vertical","header","pageNumber","spaceBefore","spaceAfter"].includes(k)) ||
      (o.start !== undefined && !["next","recto","verso"].includes(o.start as string)) ||
      (o.vertical !== undefined && !["top","center","bottom"].includes(o.vertical as string)) ||
      (o.header !== undefined && !["auto","show","hide"].includes(o.header as string)) ||
      (o.pageNumber !== undefined && !["auto","show","hide"].includes(o.pageNumber as string)) ||
      ["spaceBefore","spaceAfter"].some(k => o[k] !== undefined && (typeof o[k] !== "number" || !Number.isFinite(o[k]) || (o[k] as number) < 0 || (o[k] as number) > 120)))
    throw Error("Invalid section page layout.");
}
export type Chapter = {
  sectionType?: SectionType;
  showTitle?: boolean;
  pageLayout?: Partial<SectionPageLayout>;
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
  editions?: { ebook: EbookEdition; print?: PrintEdition };
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
    editions: { ebook: { ...CLASSIC_EDITION }, print: { ...CLASSIC_PRINT } },
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
      Object.keys(b.editions).some((key) => key !== "ebook" && key !== "print")
    )
      throw Error("Unsupported edition settings.");
    validateEdition(b.editions.ebook);
    if (b.editions.print !== undefined) validatePrintEdition(b.editions.print);
  }
  const ids = new Set<string>();
  let imageBytes = 0;
  for (const c of b.chapters) {
    if (
      !c ||
      typeof c.id !== "string" ||
      ids.has(c.id) ||
      typeof c.title !== "string" ||
      (c.sectionType !== undefined && !SECTION_TYPES.includes(c.sectionType)) ||
      (c.showTitle !== undefined && typeof c.showTitle !== "boolean")
    )
      throw Error("Invalid chapter structure.");
    if (c.pageLayout !== undefined) validateSectionLayout(c.pageLayout);
    ids.add(c.id);
    const manuscript = schema.nodeFromJSON(c.content);
    manuscript.check();
    for (const attrs of embeddedImages(c.content)) {
      validateImageAttrs(attrs as unknown as Record<string, unknown>);
      imageBytes += attrs.src.length;
      if (imageBytes > MAX_PROJECT_IMAGES_BYTES) throw Error("Embedded images exceed the 12 MB project limit.");
    }
    manuscript.descendants(node => {
      if ((node.type.name === "paragraph" || node.type.name === "heading") &&
          node.attrs.align !== null && !TEXT_ALIGNMENTS.includes(node.attrs.align))
        throw Error("Unsupported text alignment.");
    });
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
