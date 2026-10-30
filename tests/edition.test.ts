import { describe, it, expect } from "vitest";
import { createBook, validateBook } from "../lib/model";
import {
  CLASSIC_EDITION,
  EDITION_PRESETS,
  presetFor,
  getEbookEdition,
  validateEdition,
} from "../lib/edition";
import { backupBook, restoreBook } from "../lib/backup";

describe("independent ebook designs", () => {
  it("gives older projects and backups Classic defaults without rewriting their manuscript", () => {
    const b = createBook("Legacy", "");
    delete b.editions;
    const content = JSON.stringify(b.chapters);
    expect(getEbookEdition(validateBook(b))).toEqual(CLASSIC_EDITION);
    const restored = restoreBook(backupBook(b));
    expect(getEbookEdition(restored)).toEqual(CLASSIC_EDITION);
    expect(JSON.stringify(b.chapters)).toBe(content);
    expect(b.editions).toBeUndefined();
  });
  it("round trips edition settings without altering content or the default template", () => {
    const b = createBook("Novel", "Tony");
    b.chapters[0].content = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Words stay unchanged.",
              marks: [{ type: "em" }],
            },
          ],
        },
        { type: "scene_break" },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Another scene." }],
        },
      ],
    };
    const before = structuredClone(b.chapters);
    b.editions = {
      ebook: {
        ...getEbookEdition(b),
        fontSize: 20,
        lineHeight: 1.8,
        paragraphSpacing: 0.5,
        paragraphIndent: 2,
        headingStyle: "left",
        sceneOrnament: "diamonds",
        chapterSpacing: 4,
      },
    };
    const restored = restoreBook(backupBook(b));
    expect(restored.editions).toEqual(b.editions);
    expect(b.chapters).toEqual(before);
    expect(restored.chapters.map((c) => c.content)).toEqual(
      before.map((c) => c.content),
    );
    expect(CLASSIC_EDITION.fontSize).toBe(17);
  });
  it("rejects unsupported versions, CSS payloads and invalid numeric settings", () => {
    for (const patch of [
      { schemaVersion: 2 },
      { template: { id: "classic", version: 2 } },
      { bodyFont: "url(https://example.invalid/font)" },
      { fontSize: NaN },
      { lineHeight: Infinity },
      { paragraphIndent: -1 },
      { paragraphSpacing: 20 },
      { chapterSpacing: 0 },
    ])
      expect(() => validateEdition({ ...CLASSIC_EDITION, ...patch })).toThrow();
    const b = createBook("Unsafe", "");
    expect(() =>
      validateBook({
        ...b,
        editions: { ebook: { ...CLASSIC_EDITION, fontSize: 100 } },
      }),
    ).toThrow();
  });
});

describe("three versioned ebook presets", () => {
  it("validates every template and preserves distinct typography", () => {
    for (const id of ["classic", "modern", "gothic"] as const) {
      expect(validateEdition(presetFor(id)).template).toEqual({ id, version: 1 });
      expect(presetFor(id)).toEqual(EDITION_PRESETS[id]);
    }
    expect(EDITION_PRESETS.modern.headingStyle).toBe("left");
    expect(EDITION_PRESETS.gothic.sceneOrnament).toBe("diamonds");
  });
  it("preserves content and edition on backup and restore", () => {
    const book = createBook("Design Test", "Writer");
    const before = JSON.stringify(book.chapters);
    book.editions!.ebook = presetFor("gothic");
    const restored = restoreBook(backupBook(book));
    expect(restored.editions!.ebook.template.id).toBe("gothic");
    expect(JSON.stringify(restored.chapters)).toBe(before);
  });
  it("rejects unknown template identifiers", () => {
    expect(() => validateEdition({
      ...presetFor("modern"),
      template: { id: "unknown", version: 1 },
    })).toThrow();
  });
});
