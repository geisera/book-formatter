export type PrintTemplateId = "classic" | "modern" | "gothic";
export type PrintEdition = {
  schemaVersion: 1;
  kind: "paperback";
  template: { id: PrintTemplateId; version: 1 };
  trim: "6x9";
  font: "baskerville";
  fontSize: number;
  leading: number;
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
export function printPreset(id: PrintTemplateId, alignment: "left" | "justify" = "left"): PrintEdition {
  return { ...PRINT_PRESETS[id], template: { ...PRINT_PRESETS[id].template }, alignment };
}
export function validatePrintEdition(value: unknown): PrintEdition {
  if (!value || typeof value !== "object")
    throw Error("Invalid print profile.");
  const p = value as PrintEdition;
  if (!p.template || !Object.hasOwn(PRINT_PRESETS, p.template.id) || p.template.version !== 1)
    throw Error("Unsupported print template.");
  const base = PRINT_PRESETS[p.template.id];
  for (const key of [
    "schemaVersion", "kind", "trim", "font", "fontSize", "leading",
    "inside", "outside", "top", "bottom", "rectoChapters",
  ] as const)
    if (p[key] !== base[key])
      throw Error("Unsupported print profile. Choose a versioned 6 × 9 preset.");
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
  return printPreset(id, alignment);
}
