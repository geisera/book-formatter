import type { Book } from "./model";
import type { PrintRecord } from "./print";
import { preflight as epubPreflight } from "./epub";
import { PRINT_TRIMS } from "./print-profile";
import { runPreflight, type PreflightIssue, type PreflightReport, type PreflightRule } from "./preflight";

export type PrintPreflightInput = { book: Book; record?: PrintRecord; inputChecksum?: string };
const issue = (code: string, severity: PreflightIssue["severity"], category: string, message: string, action: string, page?: number): PreflightIssue =>
  ({ code, severity, category, message, action, ...(page === undefined ? {} : { location: { page, label: `Page ${page}` } }) });

const manuscript: PreflightRule<PrintPreflightInput> = ({book}) =>
  epubPreflight(book).map(i => ({
    code: "SOURCE_" + i.severity.toUpperCase(),
    severity: i.severity,
    category: "Manuscript",
    message: i.message,
    action: i.action,
    location: { label: i.location },
  }));
const proof: PreflightRule<PrintPreflightInput> = ({record,inputChecksum}) => {
  if (!record) return [issue("PDF_NOT_BUILT","info","PDF","No PDF proof is available for inspection.","Build a local PDF proof to run page-level checks.")];
  const issues: PreflightIssue[] = [];
  const trim = PRINT_TRIMS[record.profile.trim];
  if (!trim) return [issue("UNKNOWN_TRIM","error","Geometry","Unsupported paperback trim size.","Choose a supported trim size and rebuild.")];
  if (record.pageCount !== record.pages.length || record.pageCount === 0)
    issues.push(issue("PAGE_COUNT","error","Geometry","Page count does not match layout records.","Rebuild the PDF; do not submit this proof."));
  if (record.pageCount % 2 !== 0)
    issues.push(issue("ODD_PAGE_COUNT","warning","Pagination","The last physical leaf has no reverse page.","Check the last page of the proof."));
  if (record.checks.fonts !== "embedded")
    issues.push(issue("FONT_STATUS","error","Fonts","Font embedding is not confirmed by the renderer.","Rebuild and independently inspect the PDF."));
  if (record.checks.overflow > 0)
    issues.push(issue("OVERFLOW","error","Layout",`${record.checks.overflow} text overflow condition(s) reported.`,"Review affected pages and rebuild."));
  if (record.checks.splitViolations > 0)
    issues.push(issue("SPLIT_LINES","error","Typography","Paragraph splitting violates the renderer's minimum-lines rule.","Rebuild with corrected layout."));
  if (inputChecksum && inputChecksum !== record.inputChecksum)
    issues.push(issue("STALE_PROOF","warning","Snapshot","The generated PDF reflects an earlier manuscript or design revision.","Rebuild the proof before publication."));
  for (const p of record.pages) {
    if (!Number.isInteger(p.page) || p.page < 1 || p.page > record.pageCount) {
      issues.push(issue("PAGE_INDEX","error","Pagination","Page index is invalid.","Rebuild the proof.",p.page));
      continue;
    }
    // Chapter recto/verso is an author-configurable section setting, not an error.
    // Body bounds from the renderer combine non-body elements (e.g. folios and
    // headers) and must not be compared with the body text box: doing so caused
    // false-positive geometry failures. The renderer already refuses true
    // overflow when producing a PDF. Independent byte-level checks remain in CI.
    if (p.kind === "blank" && (p.lineCount !== 0 || p.header || p.footer))
      issues.push(issue("BLANK_CONTENT","error","Pagination","The renderer placed content on an intentional blank page.","Rebuild the proof.",p.page));
  }
  // Renderer caveats belong in optional proof notes, not actionable alerts.
  return issues;
};
export function inspectPrint(input: PrintPreflightInput): PreflightReport {
  return runPreflight("print-pdf",input,[manuscript,proof]);
}

/** Only problems that an author can resolve should interrupt the normal export workflow. */
export function authorPrintIssues(report: PreflightReport): PreflightIssue[] {
  return report.issues.filter(i => i.category === "Manuscript" && i.severity === "error"
    || i.code === "STALE_PROOF");
}
/** Failed renderer integrity checks must never be represented as successful proofs. */
export function printHasInternalFailure(report: PreflightReport): boolean {
  return report.issues.some(i => i.severity === "error" && i.category !== "Manuscript");
}
