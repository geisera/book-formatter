import type { SectionType } from "./model";
import type { PrintTemplateId } from "./print-profile";

/** Semantic book-opening layouts shared by EPUB and PDF, without changing manuscript text. */
export type OpeningStyle = "standard" | "half-title" | "title" | "copyright" | "dedication" | "epigraph" | "part";
export function openingStyle(type: SectionType = "chapter"): OpeningStyle {
  return (["half-title", "title", "copyright", "dedication", "epigraph", "part"] as string[]).includes(type)
    ? type as OpeningStyle : "standard";
}
export function openingDesign(type: SectionType = "chapter", template: PrintTemplateId = "classic") {
  const style = openingStyle(type);
  const isDisplay = style === "half-title" || style === "title" || style === "part";
  const isQuotation = style === "epigraph" || style === "dedication";
  const fontFactor = style === "half-title" ? 1.4 : style === "title" ? 1.55 :
    style === "part" ? 1.25 : style === "copyright" ? 0.8 : style === "epigraph" ? 0.9 : 1;
  return {
    style,
    headingFactor: fontFactor * (template === "gothic" && isDisplay ? 1.1 : 1),
    centered: isDisplay || isQuotation,
    italicBody: style === "epigraph",
    unindentedBody: style !== "standard" || ["bibliography", "glossary", "endnotes"].includes(type),
    suppressHeading: style === "copyright" || style === "dedication" || style === "epigraph",
  };
}
