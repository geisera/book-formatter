export type PrintTrim = "5x8" | "5.5x8.5" | "6x9";
export const PRINT_TRIMS: Record<PrintTrim,{width:number;height:number;label:string;description:string}> = {
  "5x8": {width:360,height:576,label:"5 × 8",description:"Compact, traditional paperback; more pages"},
  "5.5x8.5": {width:396,height:612,label:"5.5 × 8.5",description:"Balanced fiction trade paperback · recommended"},
  "6x9": {width:432,height:648,label:"6 × 9",description:"Roomier pages; fewer pages · current default"},
};
export type PrintTemplateId = "classic" | "modern" | "gothic";
export type PrintEdition = {
  schemaVersion: 1;
  kind: "paperback";
  template: { id: PrintTemplateId; version: 1 };
  trim: PrintTrim;
  font: "baskerville";
  fontSize: number;
  leading: number;
  paragraphSpacing?: number;
  firstLineIndent?: number;
  chapterOpeningSpace?: number;
  inside: number;
  outside: number;
  top: number;
  bottom: number;
  rectoChapters: true;
  alignment?: "left" | "justify";
};

/** Versioned print profiles. The manuscript and ebook edition remain independent. */
export const CLASSIC_PRINT: PrintEdition = Object.freeze({
  schemaVersion: 1,
  kind: "paperback",
  template: Object.freeze({ id: "classic", version: 1 }),
  trim: "6x9",
  font: "baskerville",
  fontSize: 11,
  leading: 15.5,
  paragraphSpacing: 0,
  firstLineIndent: 14,
  chapterOpeningSpace: 0,
  inside: 54,
  outside: 40.5,
  top: 54,
  bottom: 54,
  rectoChapters: true,
  alignment: "left",
});
export const MODERN_PRINT: PrintEdition = Object.freeze({
  ...CLASSIC_PRINT,
  template: Object.freeze({ id: "modern", version: 1 }),
  fontSize: 11,
  leading: 16,
});
export const GOTHIC_PRINT: PrintEdition = Object.freeze({
  ...CLASSIC_PRINT,
  template: Object.freeze({ id: "gothic", version: 1 }),
  fontSize: 11,
  leading: 16.5,
});
export const PRINT_PRESETS = Object.freeze({
  classic: CLASSIC_PRINT,
  modern: MODERN_PRINT,
  gothic: GOTHIC_PRINT,
});
export function printPreset(id: PrintTemplateId, alignment: "left" | "justify" = "left", trim: PrintTrim = "6x9"): PrintEdition {
  return { ...PRINT_PRESETS[id], template: { ...PRINT_PRESETS[id].template }, alignment, trim };
}
export function validatePrintEdition(value: unknown): PrintEdition {
  if (!value || typeof value !== "object")
    throw Error("Invalid print profile.");
  const p = value as PrintEdition;
  if (!p.template || !Object.hasOwn(PRINT_PRESETS, p.template.id) || p.template.version !== 1)
    throw Error("Unsupported print template.");
  const base = PRINT_PRESETS[p.template.id];
  for (const key of [
    "schemaVersion", "kind", "font",
    "inside", "outside", "top", "bottom", "rectoChapters",
  ] as const)
    if (p[key] !== base[key])
      throw Error("Unsupported print profile. Choose a supported print preset.");
  if (!Number.isFinite(p.fontSize) || p.fontSize < 9 || p.fontSize > 14 ||
      !Number.isFinite(p.leading) || p.leading < p.fontSize * 1.15 || p.leading > p.fontSize * 2 ||
      (p.paragraphSpacing !== undefined && (!Number.isFinite(p.paragraphSpacing) || p.paragraphSpacing < 0 || p.paragraphSpacing > 24)) ||
      (p.firstLineIndent !== undefined && (!Number.isFinite(p.firstLineIndent) || p.firstLineIndent < 0 || p.firstLineIndent > 36)) ||
      (p.chapterOpeningSpace !== undefined && (!Number.isFinite(p.chapterOpeningSpace) || p.chapterOpeningSpace < 0 || p.chapterOpeningSpace > 120)))
    throw Error("Invalid paperback typography settings.");
  if (!Object.hasOwn(PRINT_TRIMS, p.trim)) throw Error("Unsupported print trim size.");
  if (p.alignment !== undefined && p.alignment !== "left" && p.alignment !== "justify")
    throw Error("Unsupported print alignment.");
  return p;
}
/** Design is authoritative. Legacy mismatched saved print profiles are resolved at read time
 * without mutating the manuscript or losing the print-only justification preference. */
export function getPrintEdition(book: {
  editions?: { ebook?: { template: { id: PrintTemplateId } }; print?: PrintEdition };
}): PrintEdition {
  const id = book.editions?.ebook?.template.id ?? "classic";
  const alignment = book.editions?.print?.alignment ?? "left";
  const saved = book.editions?.print?.trim;
  const trim = saved && Object.hasOwn(PRINT_TRIMS, saved) ? saved : "6x9";
  const preset = printPreset(id, alignment, trim);
  const prior = book.editions?.print;
  return prior ? { ...preset, fontSize: prior.fontSize ?? preset.fontSize,
    leading: prior.leading ?? preset.leading,
    paragraphSpacing: prior.paragraphSpacing ?? preset.paragraphSpacing,
    firstLineIndent: prior.firstLineIndent ?? preset.firstLineIndent,
    chapterOpeningSpace: prior.chapterOpeningSpace ?? preset.chapterOpeningSpace } : preset;
}
