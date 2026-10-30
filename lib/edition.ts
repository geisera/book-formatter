export type EbookEdition = {
  schemaVersion: 1;
  kind: "ebook";
  template: { id: "classic"; version: 1 };
  bodyFont: "baskerville" | "georgia";
  fontSize: number;
  lineHeight: number;
  paragraphIndent: number;
  paragraphSpacing: number;
  headingStyle: "centered" | "left";
  sceneOrnament: "asterisks" | "diamonds" | "rule";
  chapterSpacing: number;
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
    e.template.id !== "classic" ||
    e.template.version !== 1 ||
    !["baskerville", "georgia"].includes(e.bodyFont) ||
    !["centered", "left"].includes(e.headingStyle) ||
    !["asterisks", "diamonds", "rule"].includes(e.sceneOrnament)
  )
    throw Error("Unsupported ebook design or template version.");
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
