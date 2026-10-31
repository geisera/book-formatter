import { describe, expect, it } from "vitest";
import { runPreflight } from "../lib/preflight";
import { inspectPrint, authorPrintIssues, printHasInternalFailure } from "../lib/print-preflight";
import { createBook } from "../lib/model";
import { CLASSIC_PRINT } from "../lib/print-profile";
describe("reusable preflight", () => {
  it("returns reusable structured status and severity counts", () => {
    const result = runPreflight("example",{value:1},[
      () => [{code:"X",severity:"warning",category:"Test",message:"Review",action:"Check"}],
    ]);
    expect(result.status).toBe("warnings");
    expect(result.counts.warning).toBe(1);
    expect(result.retailerCertified).toBe(false);
  });
  it("supports manuscript-only print checks before generating a proof", () => {
    const report = inspectPrint({book:createBook("Example","Author")});
    expect(report.format).toBe("print-pdf");
    expect(report.issues.some(i=>i.code==="PDF_NOT_BUILT")).toBe(true);
  });
  it("does not flag legitimate page furniture as body overflow", () => {
    const book=createBook("Example","Author");
    const record = {
      profile: CLASSIC_PRINT, pageCount:2, inputChecksum:"a", warnings:[],
      checks:{fonts:"embedded",overflow:0,splitViolations:0},
      pages:[
        {page:1,kind:"title",left:0,right:432,lineCount:1,minX:0,maxX:432,minY:0,maxY:648,header:"Title"},
        {page:2,kind:"blank",left:0,right:432,lineCount:0,minX:0,maxX:0,minY:0,maxY:0}
      ]
    };
    const report=inspectPrint({book,record:record as any,inputChecksum:"a"});
    expect(report.issues.some(i=>i.code==="CONTENT_BOUNDS")).toBe(false);
    expect(printHasInternalFailure(report)).toBe(false);
    expect(authorPrintIssues(report).some(i=>i.category==="Geometry")).toBe(false);
  });
});
