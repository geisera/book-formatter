import type {PrintRecord,PageProof} from "./print";
import {PRINT_TRIMS} from "./print-profile";

/** Diagnostic measurements derived from actual PDF draw bounds, not estimated line counts.
 * minY tracks rendered body text/images; running heads and folios are excluded.
 * These are quality indicators, not a claim of retailer or physical-proof approval. */
export type PaginationQuality={
  mode:string; pageCount:number; bodyPages:number; eligibleSpreads:number;
  meanSpreadBottomDifferencePt:number|null; maxSpreadBottomDifferencePt:number|null;
  spreadsOverTwoLines:number; meanBodyBottomWhitespacePt:number|null;
  sectionEndingPages:number; sparseSectionEndings:number;
  intentionallyBlankPages:number; overflow:number; splitViolations:number;
};
export function measurePaginationQuality(record:PrintRecord):PaginationQuality{
  const pages=record.pages;
  const height=PRINT_TRIMS[record.profile.trim].height;
  const bottomLimit=record.profile.bottom;
  const leading=record.profile.leading;
  const hasBody=(p:PageProof):boolean=>
    p.kind==="body"&&p.lineCount>0&&Number.isFinite(p.minY)&&p.minY>0&&p.minY<height;
  const body=pages.filter(hasBody);
  const whitespace=body.map(p=>Math.max(0,p.minY-bottomLimit));
  const spreadDifferences:number[]=[];
  for(let i=0;i<pages.length-1;i++){
    const verso=pages[i],recto=pages[i+1];
    // Page numbers may be shifted by an optional cover pair, but physical
    // verso must be even and recto odd. Exclude chapter starts and blanks:
    // their deliberately varied vertical positions must not be "balanced".
    if(verso.page%2!==0||recto.page!==verso.page+1||
       !hasBody(verso)||!hasBody(recto)||
       !verso.chapterId||verso.chapterId!==recto.chapterId)continue;
    spreadDifferences.push(Math.abs(verso.minY-recto.minY));
  }
  const endingPages=pages.filter((page,i)=>
    hasBody(page)&&page.chapterId &&
    !pages.slice(i+1).some(p=>p.chapterId===page.chapterId&&hasBody(p)));
  const mean=(values:number[])=>values.length?
    Math.round(values.reduce((a,b)=>a+b,0)/values.length*100)/100:null;
  return {
    mode:record.profile.layoutPriority??"automatic",
    pageCount:record.pageCount,
    bodyPages:body.length,
    eligibleSpreads:spreadDifferences.length,
    meanSpreadBottomDifferencePt:mean(spreadDifferences),
    maxSpreadBottomDifferencePt:spreadDifferences.length?Math.round(Math.max(...spreadDifferences)*100)/100:null,
    spreadsOverTwoLines:spreadDifferences.filter(n=>n>2*leading).length,
    meanBodyBottomWhitespacePt:mean(whitespace),
    sectionEndingPages:endingPages.length,
    sparseSectionEndings:endingPages.filter(p=>p.lineCount<8).length,
    intentionallyBlankPages:pages.filter(p=>p.kind==="blank").length,
    overflow:record.checks.overflow,
    splitViolations:record.checks.splitViolations
  };
}
