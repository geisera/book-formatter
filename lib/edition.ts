import type { ChapterNumberStyle } from "./chapter-numbering";
export type EbookEdition = {
  schemaVersion: 1;
  kind: "ebook";
  template: { id: "classic" | "modern" | "gothic"; version: 1 };
  bodyFont: "baskerville" | "georgia";
  fontSize: number;
  lineHeight: number;
  paragraphIndent: number;
  paragraphSpacing: number;
  headingStyle: "centered" | "left";
  sceneOrnament: "asterisks" | "diamonds" | "rule";
  chapterSpacing: number;
  chapterNumberStyle?: ChapterNumberStyle;
  frontMatterTitleScale?: number;
};
export const CLASSIC_EDITION: EbookEdition = Object.freeze({
  schemaVersion: 1,
  kind: "ebook",
  template: Object.freeze({ id: "classic", version: 1 }),
  bodyFont: "baskerville",
  fontSize: 17,
  lineHeight: 1.75,
  paragraphIndent: 1.5,
  paragraphSpacing: 0,
  headingStyle: "centered",
  sceneOrnament: "asterisks",
  chapterSpacing: 3,
  chapterNumberStyle: "none",
  frontMatterTitleScale: 1,
});
export const BODY_FONTS = {
  baskerville: '"Libre Baskerville", Georgia, serif',
  georgia: 'Georgia, "Times New Roman", serif',
};
export function validateEdition(value: unknown): EbookEdition {
  if (!value || typeof value !== "object")
    throw Error("Invalid ebook design settings.");
  const e = value as EbookEdition;
  if (
    e.schemaVersion !== 1 ||
    e.kind !== "ebook" ||
    !e.template ||
    !["classic", "modern", "gothic"].includes(e.template.id) ||
    e.template.version !== 1 ||
    !["baskerville", "georgia"].includes(e.bodyFont) ||
    !["centered", "left"].includes(e.headingStyle) ||
    !["asterisks", "diamonds", "rule"].includes(e.sceneOrnament)
  )
    throw Error("Unsupported ebook design or template version.");
  if (e.chapterNumberStyle !== undefined && !["none","arabic","roman"].includes(e.chapterNumberStyle))
    throw Error("Invalid ebook chapter numbering style.");
  if (e.frontMatterTitleScale !== undefined && (!Number.isFinite(e.frontMatterTitleScale) || e.frontMatterTitleScale < 0.75 || e.frontMatterTitleScale > 1.5))
    throw Error("Invalid ebook front matter heading scale.");
  for (const [key, min, max] of [
    ["fontSize", 14, 24],
    ["lineHeight", 1.2, 2.2],
    ["paragraphIndent", 0, 3],
    ["paragraphSpacing", 0, 1.5],
    ["chapterSpacing", 1, 5],
  ] as const) {
    if (
      typeof e[key] !== "number" ||
      !Number.isFinite(e[key]) ||
      e[key] < min ||
      e[key] > max
    )
      throw Error(`Invalid ebook design setting: ${key}.`);
  }
  return e;
}
export function getEbookEdition(book: {
  editions?: { ebook: EbookEdition };
}): EbookEdition {
  return book.editions?.ebook ?? CLASSIC_EDITION;
}

export const MODERN_EDITION: EbookEdition = Object.freeze({
  ...CLASSIC_EDITION,
  template: Object.freeze({ id: "modern", version: 1 }),
  bodyFont: "georgia", fontSize: 18, lineHeight: 1.6,
  paragraphIndent: 1.1, paragraphSpacing: 0.15,
  headingStyle: "left", sceneOrnament: "rule", chapterSpacing: 2,
});
export const GOTHIC_EDITION: EbookEdition = Object.freeze({
  ...CLASSIC_EDITION,
  template: Object.freeze({ id: "gothic", version: 1 }),
  fontSize: 17, lineHeight: 1.75,
  paragraphIndent: 1.6, paragraphSpacing: 0,
  headingStyle: "centered", sceneOrnament: "diamonds", chapterSpacing: 4.5,
});
export const EDITION_PRESETS = {
  classic: CLASSIC_EDITION, modern: MODERN_EDITION, gothic: GOTHIC_EDITION,
} as const;
export type EditionTemplate = keyof typeof EDITION_PRESETS;
export const presetFor = (id: EditionTemplate): EbookEdition =>
  ({ ...EDITION_PRESETS[id], template: { ...EDITION_PRESETS[id].template } });
