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
    const interior = p.page % 2 === 1 ? record.profile.inside : record.profile.outside;
    const exterior = p.page % 2 === 1 ? record.profile.outside : record.profile.inside;
    const leftLimit = p.page % 2 === 1 ? interior : exterior;
    const rightLimit = trim.width - (p.page % 2 === 1 ? exterior : interior);
    if (p.kind === "chapter" && p.page % 2 !== 1)
      issues.push(issue("CHAPTER_RECTO","warning","Pagination","Chapter opens on a left-hand page.","Review this section's start-page setting.",p.page));
    if (p.kind === "blank" && (p.lineCount !== 0 || p.header || p.footer))
      issues.push(issue("BLANK_CONTENT","error","Pagination","An intentional blank page contains text or furniture.","Rebuild and inspect the blank page.",p.page));
    if (p.kind !== "cover" && p.kind !== "blank" && p.lineCount > 0 &&
        (p.minX < leftLimit - 1 || p.maxX > rightLimit + 1 ||
         p.minY < record.profile.bottom - 1 || p.maxY > trim.height - record.profile.top + 1))
      issues.push(issue("CONTENT_BOUNDS","error","Geometry","Body content extends beyond the configured text area.","Inspect margins and content on this page.",p.page));
  }
  for (const warning of record.warnings)
    issues.push(issue("RENDERER_NOTE","warning","Renderer",warning,"Review this limitation before submitting the file."));
  return issues;
};
export function inspectPrint(input: PrintPreflightInput): PreflightReport {
  return runPreflight("print-pdf",input,[manuscript,proof]);
}
