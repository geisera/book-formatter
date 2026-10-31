import { describe, expect, it } from "vitest";
import { runPreflight } from "../lib/preflight";
import { inspectPrint } from "../lib/print-preflight";
import { createBook } from "../lib/model";
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
});
