/** Reusable, format-neutral publication preflight contracts and evaluator. */
export type PreflightSeverity = "error" | "warning" | "info";
export type PreflightIssue = {
  code: string;
  severity: PreflightSeverity;
  category: string;
  message: string;
  action: string;
  location?: { page?: number; sectionId?: string; label?: string };
};
export type PreflightReport = {
  format: string;
  version: 1;
  status: "failed" | "warnings" | "passed";
  issues: PreflightIssue[];
  counts: Record<PreflightSeverity, number>;
  /** Checks executed here are not retailer approval or physical proof. */
  retailerCertified: false;
};
export type PreflightRule<T> = (input: T) => PreflightIssue[];
export function runPreflight<T>(format: string, input: T, rules: readonly PreflightRule<T>[]): PreflightReport {
  const issues = rules.flatMap(rule => rule(input));
  const counts = {
    error: issues.filter(i => i.severity === "error").length,
    warning: issues.filter(i => i.severity === "warning").length,
    info: issues.filter(i => i.severity === "info").length,
  };
  return {
    format, version: 1, issues, counts,
    status: counts.error ? "failed" : counts.warning ? "warnings" : "passed",
    retailerCertified: false,
  };
}
