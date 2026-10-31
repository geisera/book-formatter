import { schema, blankChapter, type Chapter, type SectionType } from "./model";

/** Deterministic, offline import classification. Scores are heuristics, not calibrated probabilities. */
export type SectionGuess = { type: SectionType; confidence: "high" | "medium" | "low"; reason: string };
const exact: Record<string,SectionType> = {
  "prologue":"prologue","epilogue":"epilogue","interlude":"interlude",
  "foreword":"foreword","introduction":"introduction","afterword":"afterword",
  "preface":"preface","dedication":"dedication","epigraph":"epigraph",
  "acknowledgments":"acknowledgments","acknowledgements":"acknowledgments",
  "about the author":"about-author","about author":"about-author","author bio":"about-author",
  "also by":"also-by","other books by the author":"also-by",
  "bibliography":"bibliography","references":"bibliography","works cited":"bibliography",
  "appendix":"appendix","glossary":"glossary","endnotes":"endnotes","end notes":"endnotes",
  "notes":"notes","contents":"toc","table of contents":"toc",
  "copyright":"copyright","copyright page":"copyright","title page":"title",
  "half title":"half-title","half-title":"half-title","praise":"praise",
  "praise for this book":"praise","advance praise":"praise","blurbs":"praise"
};
export function classifyImportedSection(title:string, index:number, total:number, bookTitle?:string):SectionGuess {
  const value=title.trim().replace(/\s+/g," ");
  const normalized=value.toLocaleLowerCase().replace(/[:.!]+$/,"");
  const position=index===0?"front":index===total-1?"end":"middle";
  const type=exact[normalized];
  if(type) return {type,confidence:"high",reason:"Recognized conventional section heading."};
  if(/^chapter\s+(?:\d+|[ivxlcdm]+|[a-z]+)(?:\s*[:.\-–—].*)?$/i.test(value))
    return {type:"chapter",confidence:"high",reason:"Recognized a chapter-number heading."};
  if(/^(?:part|book|volume)\s+(?:\d+|[ivxlcdm]+|[a-z]+)(?:\s*[:.\-–—].*)?$/i.test(value))
    return {type:"part",confidence:"high",reason:"Recognized a major division heading; volumes are currently represented as parts."};
  if(/^appendix\s+[a-z\d]+(?:\s*[:.\-–—].*)?$/i.test(value))
    return {type:"appendix",confidence:"high",reason:"Recognized a labeled appendix."};
  if(/^introduction\b|^foreword\b|^afterword\b|^acknowledg(?:e)?ments\b/i.test(value)){
    const matched=value.match(/^(introduction|foreword|afterword|acknowledgments|acknowledgements)/i)?.[1]?.toLowerCase()??"introduction";
    return {type:exact[matched],confidence:"high",reason:"Recognized a conventional heading with a subtitle."};
  }
  if(index===0 && bookTitle && normalized===bookTitle.trim().toLocaleLowerCase())
    return {type:"title",confidence:"medium",reason:"Opening heading matches the entered publication title."};
  if(/^for\s+(?:my|our|the|those|you|[A-Z])/i.test(value) && position==="front")
    return {type:"dedication",confidence:"low",reason:"Opening heading resembles a dedication; confirm before importing."};
  if(normalized==="opening matter") return {type:"custom",confidence:"low",reason:"Text occurs before the first detected section heading."};
  return {type:"chapter",confidence:"low",reason:"No conventional section heading matched; classified as Chapter for author review."};
}
/** Reclassifying or editing a boundary never mutates imported manuscript nodes. */
export function splitImportedSection(chapter:Chapter, at:number):[Chapter,Chapter] {
  const nodes=(chapter.content.content as Record<string,unknown>[] | undefined)??[];
  if(!Number.isInteger(at) || at<=0 || at>=nodes.length) throw Error("Choose a split between content blocks.");
  const first={...chapter,content:{type:"doc",content:nodes.slice(0,at)}};
  const second={...blankChapter(chapter.title+" (continued)"),sectionType:chapter.sectionType,content:{type:"doc",content:nodes.slice(at)}};
  schema.nodeFromJSON(first.content).check();
  schema.nodeFromJSON(second.content).check();
  return [first,second];
}
export function mergeImportedSections(first:Chapter,second:Chapter):Chapter{
  const a=(first.content.content as Record<string,unknown>[] | undefined)??[];
  const b=(second.content.content as Record<string,unknown>[] | undefined)??[];
  const merged={...first,content:{type:"doc",content:[...a,...b]}};
  schema.nodeFromJSON(merged.content).check();
  return merged;
}
