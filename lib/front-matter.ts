import type { SectionType } from "./model";
import type { PrintTemplateId } from "./print-profile";

/** Built-in publishing defaults. Section-specific overrides are stored separately. */
export type OpeningStyle = "standard" | "half-title" | "title" | "copyright" | "dedication" | "epigraph" | "part";
export type SectionTypography = {
  headingFactor: number;
  bodyFactor: number;
  headingAlign: "left" | "center";
  bodyAlign: "left" | "center";
  italicBody: boolean;
  unindentedBody: boolean;
  suppressHeading: boolean;
  paragraphSpacingFactor: number;
};
const DEFAULTS: Record<SectionType, SectionTypography> = {
  "chapter":         {headingFactor:1,bodyFactor:1,headingAlign:"center",bodyAlign:"left",italicBody:false,unindentedBody:false,suppressHeading:false,paragraphSpacingFactor:1},
  "prologue":        {headingFactor:.95,bodyFactor:1,headingAlign:"center",bodyAlign:"left",italicBody:false,unindentedBody:false,suppressHeading:false,paragraphSpacingFactor:1},
  "epilogue":        {headingFactor:.95,bodyFactor:1,headingAlign:"center",bodyAlign:"left",italicBody:false,unindentedBody:false,suppressHeading:false,paragraphSpacingFactor:1},
  "interlude":       {headingFactor:.9,bodyFactor:1,headingAlign:"center",bodyAlign:"left",italicBody:false,unindentedBody:false,suppressHeading:false,paragraphSpacingFactor:1},
  "part":            {headingFactor:1.5,bodyFactor:1,headingAlign:"center",bodyAlign:"center",italicBody:false,unindentedBody:true,suppressHeading:false,paragraphSpacingFactor:1.3},
  "half-title":      {headingFactor:1.4,bodyFactor:1,headingAlign:"center",bodyAlign:"center",italicBody:false,unindentedBody:true,suppressHeading:false,paragraphSpacingFactor:1},
  "title":           {headingFactor:1.55,bodyFactor:1,headingAlign:"center",bodyAlign:"center",italicBody:false,unindentedBody:true,suppressHeading:false,paragraphSpacingFactor:1},
  "copyright":       {headingFactor:.8,bodyFactor:.82,headingAlign:"left",bodyAlign:"left",italicBody:false,unindentedBody:true,suppressHeading:true,paragraphSpacingFactor:1.25},
  "dedication":      {headingFactor:.9,bodyFactor:1,headingAlign:"center",bodyAlign:"center",italicBody:false,unindentedBody:true,suppressHeading:true,paragraphSpacingFactor:1.4},
  "epigraph":        {headingFactor:.9,bodyFactor:.95,headingAlign:"center",bodyAlign:"center",italicBody:true,unindentedBody:true,suppressHeading:true,paragraphSpacingFactor:1.3},
  "toc":             {headingFactor:1,bodyFactor:.95,headingAlign:"center",bodyAlign:"left",italicBody:false,unindentedBody:true,suppressHeading:false,paragraphSpacingFactor:1.25},
  "preface":         {headingFactor:.95,bodyFactor:1,headingAlign:"center",bodyAlign:"left",italicBody:false,unindentedBody:false,suppressHeading:false,paragraphSpacingFactor:1},
  "about-author":    {headingFactor:.95,bodyFactor:1,headingAlign:"center",bodyAlign:"left",italicBody:false,unindentedBody:true,suppressHeading:false,paragraphSpacingFactor:1.2},
  "also-by":         {headingFactor:1,bodyFactor:1,headingAlign:"center",bodyAlign:"center",italicBody:false,unindentedBody:true,suppressHeading:false,paragraphSpacingFactor:1.4},
  "notes":           {headingFactor:.95,bodyFactor:.9,headingAlign:"left",bodyAlign:"left",italicBody:false,unindentedBody:true,suppressHeading:false,paragraphSpacingFactor:1.15},
  "acknowledgments": {headingFactor:.95,bodyFactor:1,headingAlign:"center",bodyAlign:"left",italicBody:false,unindentedBody:false,suppressHeading:false,paragraphSpacingFactor:1},
  "foreword":        {headingFactor:.95,bodyFactor:1,headingAlign:"center",bodyAlign:"left",italicBody:false,unindentedBody:false,suppressHeading:false,paragraphSpacingFactor:1},
  "introduction":    {headingFactor:.95,bodyFactor:1,headingAlign:"center",bodyAlign:"left",italicBody:false,unindentedBody:false,suppressHeading:false,paragraphSpacingFactor:1},
  "afterword":       {headingFactor:.95,bodyFactor:1,headingAlign:"center",bodyAlign:"left",italicBody:false,unindentedBody:false,suppressHeading:false,paragraphSpacingFactor:1},
  "bibliography":    {headingFactor:.95,bodyFactor:.9,headingAlign:"left",bodyAlign:"left",italicBody:false,unindentedBody:true,suppressHeading:false,paragraphSpacingFactor:1.25},
  "praise":          {headingFactor:.95,bodyFactor:.95,headingAlign:"center",bodyAlign:"left",italicBody:true,unindentedBody:true,suppressHeading:false,paragraphSpacingFactor:1.5},
  "appendix":        {headingFactor:.95,bodyFactor:.95,headingAlign:"left",bodyAlign:"left",italicBody:false,unindentedBody:true,suppressHeading:false,paragraphSpacingFactor:1.15},
  "glossary":        {headingFactor:.95,bodyFactor:.9,headingAlign:"left",bodyAlign:"left",italicBody:false,unindentedBody:true,suppressHeading:false,paragraphSpacingFactor:1.2},
  "endnotes":        {headingFactor:.95,bodyFactor:.85,headingAlign:"left",bodyAlign:"left",italicBody:false,unindentedBody:true,suppressHeading:false,paragraphSpacingFactor:1.2},
  "custom":          {headingFactor:1,bodyFactor:1,headingAlign:"center",bodyAlign:"left",italicBody:false,unindentedBody:false,suppressHeading:false,paragraphSpacingFactor:1}
};
export function sectionTypography(type: SectionType = "chapter", template: PrintTemplateId = "classic"): SectionTypography {
  const defaultStyle = DEFAULTS[type];
  return {
    ...defaultStyle,
    headingFactor: defaultStyle.headingFactor * (template === "gothic" && ["part","title","half-title"].includes(type) ? 1.1 : 1),
    headingAlign: template === "modern" && ["chapter","prologue","epilogue","interlude"].includes(type) ? "left" : defaultStyle.headingAlign,
  };
}
export function openingStyle(type: SectionType = "chapter"): OpeningStyle {
  return (["half-title", "title", "copyright", "dedication", "epigraph", "part"] as string[]).includes(type)
    ? type as OpeningStyle : "standard";
}
export function openingDesign(type: SectionType = "chapter", template: PrintTemplateId = "classic") {
  const typography = sectionTypography(type,template);
  return {
    style: openingStyle(type),
    ...typography,
    centered: typography.bodyAlign === "center",
  };
}
