import { schema, type Chapter, type SectionType } from "./model";

/** Display-only examples. Never save or export these as manuscript content. */
export type SampleBlock = { text: string; kind?: "attribution" | "small" | "quotation" | "heading" };
export const SECTION_SAMPLES: Record<SectionType, readonly SampleBlock[]> = {
  chapter: [{text:"The first paragraph begins without an indent, introducing the setting, characters, or action."},{text:"Subsequent paragraphs follow the book’s regular indentation and spacing. Replace this example with your own manuscript text."}],
  prologue: [{text:"Before the events of the first chapter, something happened that would change everything."},{text:"A prologue uses the book’s normal narrative typography with its own opening heading."}],
  epilogue: [{text:"Much later, the consequences of those events could finally be understood."},{text:"An epilogue normally follows the narrative typography of the main chapters."}],
  interlude: [{text:"Elsewhere, another story was already unfolding."},{text:"An interlude may shift time, viewpoint, or setting while retaining readable narrative typography."}],
  part: [{text:"A new part introduces a major division of the book. A short subtitle or epigraph may appear here.",kind:"small"}],
  "half-title": [{text:"The Book Title",kind:"heading"}],
  title: [{text:"The Book Title",kind:"heading"},{text:"A Subtitle, If Any",kind:"small"},{text:"Author Name",kind:"attribution"}],
  copyright: [{text:"Copyright © [Year] [Author Name]. All rights reserved.",kind:"small"},{text:"First edition. Published by [Publisher or Imprint].",kind:"small"},{text:"ISBN: [ISBN, if applicable]",kind:"small"}],
  dedication: [{text:"For those who made this story possible.",kind:"quotation"}],
  epigraph: [{text:"“A brief quotation that captures the spirit of the book.”",kind:"quotation"},{text:"— Attribution",kind:"attribution"}],
  toc: [{text:"Chapter One ................................ 1"},{text:"Chapter Two ................................ 17"},{text:"Chapter Three ............................. 35"}],
  preface: [{text:"This preface explains why the book was written, what inspired it, or how readers may wish to approach it."},{text:"It is normally written by the author and appears before the main text."}],
  "about-author": [{text:"[Author Name] writes [genre or subject] and lives in [location, if desired]."},{text:"Add a short professional biography, selected accomplishments, and an optional website."}],
  "also-by": [{text:"Another Book by [Author Name]",kind:"heading"},{text:"A Second Title"},{text:"A Third Title"}],
  notes: [{text:"1. An explanatory note, source reference, or additional observation."},{text:"2. Additional notes appear in a consistent, compact style."}],
  acknowledgments: [{text:"I would like to thank the people who contributed their time, encouragement, and expertise to this book."},{text:"Mention individuals or organizations you wish to recognize."}],
  foreword: [{text:"This foreword introduces the book from the perspective of a contributor other than its author."},{text:"It may explain the book’s significance or offer context for the reader."},{text:"[Foreword Contributor]",kind:"attribution"}],
  introduction: [{text:"An introduction prepares readers for the book’s subject, approach, or setting."},{text:"Unlike a foreword, it is often written by the book’s author."}],
  afterword: [{text:"With the story complete, this afterword offers additional context or reflections on the work."},{text:"It may discuss the writing process, research, or what comes next."}],
  bibliography: [{text:"Author Surname, Given Name. Title of Work. Publisher, Year."},{text:"Second Author. Another Work. Publisher, Year."}],
  praise: [{text:"“A concise endorsement or review quotation appears here.”",kind:"quotation"},{text:"— Reviewer or Publication",kind:"attribution"}],
  appendix: [{text:"Appendix A: Supplementary Material",kind:"heading"},{text:"Use appendices for maps, timelines, tables, or other supporting information."}],
  glossary: [{text:"Term — A clear, concise definition of the term."},{text:"Another Term — A second definition, following the same pattern."}],
  endnotes: [{text:"1. A note associated with a reference in the main text."},{text:"2. Notes are presented in order, usually in smaller type."}],
  custom: [{text:"Enter your section text here. The section will use the selected template’s default styling."}],
};
export function sectionIsEmpty(section: Chapter): boolean {
  const doc=schema.nodeFromJSON(section.content);
  let meaningful=false;
  doc.descendants(node=>{if(node.type.name==="image" || node.type.name==="scene_break" || (node.isText && !!node.text?.trim())) meaningful=true;});
  return !meaningful;
}
export function sampleForSection(section: Chapter): readonly SampleBlock[] {
  return SECTION_SAMPLES[section.sectionType??"chapter"];
}

/** Explicit author action converts sample guidance to editable ProseMirror content. */
export function sectionTemplateContent(section: Chapter): Record<string, unknown> {
  const blocks = sampleForSection(section).map(block => {
    const attrs = block.kind === "attribution" ? {align:"right"} :
      block.kind === "quotation" || block.kind === "heading" ? {align:"center"} : {};
    const node = block.kind === "heading" ? "heading" : "paragraph";
    return {type:node, ...(node === "heading" ? {attrs:{...attrs,level:2}} :
      Object.keys(attrs).length ? {attrs}:{}),
      content:[{type:"text",text:block.text,
        ...(block.kind === "quotation" ? {marks:[{type:"em"}]}:{})}]};
  });
  const content={type:"doc",content:blocks};
  schema.nodeFromJSON(content).check();
  return content;
}
