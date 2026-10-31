import {describe,it,expect} from "vitest";
import {mkdirSync,writeFileSync} from "node:fs";
import {readFileSync} from "node:fs";
import {createBook,blankChapter} from "../lib/model";
import {getPrintEdition} from "../lib/print-profile";
import {buildPrintPdf,type PrintFonts,type PrintRecord} from "../lib/print";
import {measurePaginationQuality} from "../lib/pagination-quality";

const fonts=Object.fromEntries(
  [["regular","regular"],["italic","italic"],["bold","bold"],["boldItalic","bold-italic"]]
    .map(([key,name])=>[key,new Uint8Array(readFileSync(`public/epub-fonts/${name}.woff`))])
) as PrintFonts;
const options={id:"quality-comparison",createdAt:"2026-10-31T12:00:00Z"};

describe("quantitative pagination quality",()=>{
 it("excludes chapter openings, blank pages and unrelated sections from spread metrics",()=>{
  const book=createBook("Measurement fixture","Test Author");
  const profile=getPrintEdition(book);
  const page=(num:number,kind:"chapter"|"body"|"blank",minY:number,chapterId="a")=>({
    page:num,kind,chapterId,lineCount:kind==="blank"?0:20,
    minY,maxY:500,minX:50,maxX:350,left:50,right:350
  });
  const record={
    profile, pageCount:8,checks:{overflow:0,splitViolations:0,fonts:"embedded"},
    pages:[
      page(1,"chapter",180),page(2,"blank",0),page(3,"chapter",180),
      page(4,"body",110),page(5,"body",80),page(6,"body",100),
      page(7,"body",90,"b"),page(8,"blank",0)
    ]
  } as PrintRecord;
  const metrics=measurePaginationQuality(record);
  expect(metrics.eligibleSpreads).toBe(1);
  expect(metrics.meanSpreadBottomDifferencePt).toBe(30);
  expect(metrics.maxSpreadBottomDifferencePt).toBe(30);
  expect(metrics.intentionallyBlankPages).toBe(2);
  expect(metrics.spreadsOverTwoLines).toBe(0);
 });
 it("reports actual generated PDF pagination across all layout priorities",async()=>{
  const book=createBook("Pagination quality benchmark","Test Author");
  book.chapters=[{...blankChapter("A Long Night"),content:{type:"doc",content:[
    ...Array.from({length:32},(_,i)=>({type:"paragraph",content:[{type:"text",
      text:(i%3===0?"At sunrise the travelers returned to the city gates. ":"The great road crossed the quiet valley beneath the trees. ").repeat(30+i%7)}]})),
    {type:"paragraph",content:[{type:"text",text:"The last witness closed the door. ".repeat(15)}]},
    {type:"paragraph",content:[{type:"text",text:"The night was over."}]}
  ]}}];
  const untouched=structuredClone(book.chapters);
  const metrics=[];
  for(const layoutPriority of ["automatic","balanced","flow"] as const){
    book.editions!.print={...getPrintEdition(book),layoutPriority};
    const built=await buildPrintPdf(book,fonts,options);
    const report=measurePaginationQuality(built.record);
    expect(report.mode).toBe(layoutPriority);
    expect(report.eligibleSpreads).toBeGreaterThan(0);
    expect(report.meanSpreadBottomDifferencePt).not.toBeNull();
    expect(report.maxSpreadBottomDifferencePt).toBeGreaterThanOrEqual(report.meanSpreadBottomDifferencePt!);
    expect(report.overflow).toBe(0);
    expect(report.splitViolations).toBe(0);
    expect(book.chapters).toEqual(untouched);
    metrics.push(report);
  }
  mkdirSync("artifacts/print-quality",{recursive:true});
  writeFileSync("artifacts/print-quality/report.json",JSON.stringify({
    description:"Actual body-content lower bounds from locally generated PDF proofs; descriptive comparison, not a pass/fail declaration of superior balance.",
    generatedBy:"tests/pagination-quality.test.ts",
    fixture:"32 long paragraphs, two ending paragraphs",
    results:metrics
  },null,2));
  // Do not assert Balanced is always superior: that would conceal regressions
  // in templates or manuscripts where a different objective wins.
 },90000);
});
