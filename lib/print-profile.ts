export type PrintEdition = {
  schemaVersion: 1;
  kind: "paperback";
  template: { id: "classic"; version: 1 };
  trim: "6x9";
  font: "baskerville";
  fontSize: 11;
  leading: 15.5;
  inside: 54;
  outside: 40.5;
  top: 54;
  bottom: 54;
  rectoChapters: true;
};
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
});
export function validatePrintEdition(value: unknown): PrintEdition {
  if (!value || typeof value !== "object")
    throw Error("Invalid print profile.");
  const p = value as PrintEdition;
  for (const key of [
    "schemaVersion",
    "kind",
    "trim",
    "font",
    "fontSize",
    "leading",
    "inside",
    "outside",
    "top",
    "bottom",
    "rectoChapters",
  ] as const)
    if (p[key] !== CLASSIC_PRINT[key])
      throw Error(
        "Unsupported print profile. This proof supports Classic 6 × 9 only.",
      );
  if (!p.template || p.template.id !== "classic" || p.template.version !== 1)
    throw Error("Unsupported print template.");
  return p;
}
export const getPrintEdition = (book: {
  editions?: { print?: PrintEdition };
}): PrintEdition => book.editions?.print ?? CLASSIC_PRINT;
