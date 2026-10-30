import { blankChapter, newId, schema, sectionMatter, type Book, type Chapter, type SectionType, type SectionPageLayout } from "./model";

export type StructureAction =
  | { kind: "move"; id: string; to: number }
  | { kind: "rename"; id: string; title: string }
  | { kind: "type"; id: string; sectionType: SectionType }
  | { kind: "visibility"; id: string; showTitle: boolean }
  | { kind: "layout"; id: string; changes: Partial<SectionPageLayout> }
  | { kind: "add"; title: string; sectionType: SectionType; after?: string }
  | { kind: "delete"; id: string }
  | { kind: "split"; id: string; blockIndex: number; title: string }
  | { kind: "merge"; id: string };

/** The displayed sequence is also the stored/export sequence: front, body, then back. */
export function orderedSections(book: Book): Chapter[] {
  const sections = book.chapters;
  return (["front", "body", "back"] as const).flatMap(matter =>
    sections.filter(c => sectionMatter(c.sectionType ?? "chapter") === matter),
  );
}

export function changeStructure(book: Book, action: StructureAction): { book: Book; selectedId?: string } {
  const chapters = orderedSections(book);
  const index = "id" in action ? chapters.findIndex(c => c.id === action.id) : -1;
  if ("id" in action && index === -1) throw Error("Section was not found.");
  let selectedId: string | undefined;
  switch (action.kind) {
    case "move": {
      if (!Number.isInteger(action.to) || action.to < 0 || action.to >= chapters.length) throw Error("Invalid destination.");
      const source = chapters[index];
      const destination = chapters[action.to];
      if (sectionMatter(source.sectionType ?? "chapter") !== sectionMatter(destination.sectionType ?? "chapter"))
        throw Error("Change the section type to move it into another matter group.");
      const [section] = chapters.splice(index, 1);
      chapters.splice(action.to, 0, section);
      selectedId = section.id;
      break;
    }
    case "rename":
      if (!action.title.trim() || action.title.length > 200) throw Error("Enter a section title (up to 200 characters).");
      chapters[index] = { ...chapters[index], title: action.title.trim() };
      selectedId = action.id;
      break;
    case "type":
      chapters[index] = { ...chapters[index], sectionType: action.sectionType };
      selectedId = action.id;
      break;
    case "visibility":
      chapters[index] = { ...chapters[index], showTitle: action.showTitle };
      selectedId = action.id;
      break;
    case "layout":
      chapters[index] = { ...chapters[index], pageLayout: { ...chapters[index].pageLayout, ...action.changes } };
      selectedId = action.id;
      break;
    case "add": {
      const chapter = { ...blankChapter(action.title || "New section"), sectionType: action.sectionType };
      const position = action.after ? chapters.findIndex(c => c.id === action.after) + 1 : chapters.length;
      if (action.after && position === 0) throw Error("Insertion point was not found.");
      chapters.splice(position, 0, chapter);
      selectedId = chapter.id;
      break;
    }
    case "delete":
      if (chapters.length === 1) throw Error("A book must contain at least one section.");
      chapters.splice(index, 1);
      selectedId = chapters[Math.min(index, chapters.length - 1)].id;
      break;
    case "split": {
      const original = chapters[index];
      const blocks = (original.content.content as Record<string, unknown>[] | undefined) ?? [];
      if (!Number.isInteger(action.blockIndex) || action.blockIndex < 1 || action.blockIndex >= blocks.length)
        throw Error("Split between two existing paragraphs.");
      if (!action.title.trim()) throw Error("Enter a title for the new section.");
      const first = { type: "doc", content: blocks.slice(0, action.blockIndex) };
      const second = { type: "doc", content: blocks.slice(action.blockIndex) };
      schema.nodeFromJSON(first).check();
      schema.nodeFromJSON(second).check();
      const created: Chapter = { ...original, id: newId(), title: action.title.trim(), content: second };
      chapters.splice(index, 1, { ...original, content: first }, created);
      selectedId = created.id;
      break;
    }
    case "merge": {
      if (index >= chapters.length - 1) throw Error("There is no next section to merge.");
      const first = chapters[index], next = chapters[index + 1];
      const a = (first.content.content as Record<string, unknown>[] | undefined) ?? [];
      const b = (next.content.content as Record<string, unknown>[] | undefined) ?? [];
      const content = { type: "doc", content: [...a, ...b] };
      schema.nodeFromJSON(content).check();
      chapters.splice(index, 2, { ...first, content });
      selectedId = first.id;
      break;
    }
  }
  if (chapters.length > 10000) throw Error("Too many sections.");
  return { book: { ...book, chapters: orderedSections({ ...book, chapters }) }, selectedId };
}
export function sectionGroups(book: Book) {
  const chapters = orderedSections(book);
  return {
    front: chapters.filter(c => sectionMatter(c.sectionType ?? "chapter") === "front"),
    body: chapters.filter(c => sectionMatter(c.sectionType ?? "chapter") === "body"),
    back: chapters.filter(c => sectionMatter(c.sectionType ?? "chapter") === "back"),
  };
}
