/** Edition-independent chapter label formatting. Never writes generated labels into manuscript text. */
export type ChapterNumberStyle = "none" | "arabic" | "roman";
export function romanNumeral(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1 || value > 3999)
    throw Error("Chapter number is outside the supported Roman numeral range.");
  let remaining = value;
  let result = "";
  for (const [number, symbol] of [
    [1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],[90,"XC"],
    [50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"],
  ] as const) {
    while (remaining >= number) { result += symbol; remaining -= number; }
  }
  return result;
}
export function chapterNumberLabel(style: ChapterNumberStyle, ordinal: number): string | null {
  if (style === "none") return null;
  if (!Number.isSafeInteger(ordinal) || ordinal < 1)
    throw Error("Invalid chapter ordinal.");
  return style === "roman" ? romanNumeral(ordinal) : String(ordinal);
}
export function chapterOrdinal<T extends {sectionType?:string}>(sections: readonly T[], index: number): number | null {
  if (index < 0 || index >= sections.length) return null;
  if ((sections[index].sectionType ?? "chapter") !== "chapter") return null;
  return sections.slice(0,index+1).filter(s => (s.sectionType ?? "chapter")==="chapter").length;
}
