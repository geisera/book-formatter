"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Book } from "../lib/model";
import { newId } from "../lib/model";
import { preflight, snapshotChecksum } from "../lib/epub";
import type { PrintFonts, PrintRecord, PrintResult } from "../lib/print";
import PdfProofViewer from "./PdfProofViewer";
import { db } from "../lib/storage";
import { getPrintEdition } from "../lib/print-profile";
export default function PrintPanel({
  book,
  getSnapshot,
  onPublish,
  onAlignmentChange,
}: {
  book: Book;
  getSnapshot: () => Promise<Book>;
  onPublish: () => void;
  onAlignmentChange: (alignment: "left" | "justify") => void;
}) {
  const [includeFrontCover, setIncludeFrontCover] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [result, setResult] = useState<PrintResult | null>(null),
    [history, setHistory] = useState<PrintRecord[]>([]);
  const worker = useRef<Worker | null>(null),
    abort = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    token = useRef(0);
  const issues = useMemo(
    () => preflight(book).filter((i) => i.severity === "error"),
    [book],
  );
  const fingerprint = useMemo(() => snapshotChecksum(book), [book]);
  const profile = getPrintEdition(book);
  const templateLabel = profile.template.id[0].toUpperCase() + profile.template.id.slice(1);
  function stop() {
    token.current++;
    worker.current?.terminate();
    worker.current = null;
    abort.current?.abort();
    abort.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(() => {
    let active = true;
    db.printExports
      .where("bookId")
      .equals(book.id)
      .toArray()
      .then((rows) => {
        if (active)
          setHistory(
            rows
              .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 20),
          );
      })
      .catch(() => {
        if (active)
          setNotice(
            "Print history could not be opened. Your manuscript is still available.",
          );
      });
    return () => {
      active = false;
      stop();
    };
  }, [book.id]);
  function fail(message: string, n: number) {
    if (n !== token.current) return;
    stop();
    setBusy(false);
    setError(message);
  }
  async function build() {
    stop();
    const n = token.current;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const snapshot = await getSnapshot();
      if (n !== token.current) return;
      const controller = new AbortController();
      abort.current = controller;
      timer.current = setTimeout(
        () =>
          fail(
            "The print proof took too long and was stopped. Your manuscript was not changed.",
            n,
          ),
        120_000,
      );
      const files = [
        "regular.woff",
        "italic.woff",
        "bold.woff",
        "bold-italic.woff",
      ];
      const [regular, italic, bold, boldItalic] = await Promise.all(
        files.map(async (file) => {
          const response = await fetch(`/epub-fonts/${file}`, {
            signal: controller.signal,
          });
          if (!response.ok)
            throw Error(
              "Print fonts are not cached. Open the app online once, then retry offline.",
            );
          return new Uint8Array(await response.arrayBuffer());
        }),
      );
      if (n !== token.current) return;
      const fonts: PrintFonts = { regular, italic, bold, boldItalic };
      // A versioned URL prevents an older cached worker from silently omitting new PDF options.
      const encoder = new Worker("/print-worker.js?renderer=print-proof-1.3.1");
      worker.current = encoder;
      encoder.onerror = () =>
        fail(
          "The local PDF worker could not start. Open the app online once to update its offline files.",
          n,
        );
      encoder.onmessage = async (
        event: MessageEvent<{
          ok: boolean;
          error?: string;
          bytes?: Uint8Array;
          record?: PrintRecord;
        }>,
      ) => {
        if (n !== token.current) return;
        if (!event.data.ok || !event.data.bytes || !event.data.record) {
          fail(event.data.error ?? "The PDF could not be generated.", n);
          return;
        }
        // A stale offline worker must never report success for a cover-less PDF
        // when the author explicitly requested cover artwork.
        if (includeFrontCover && (
          event.data.record.includeFrontCover !== true ||
          event.data.record.pages?.[0]?.kind !== "cover"
        )) {
          fail("An outdated PDF worker omitted your requested cover. Reload the application online and rebuild the PDF.", n);
          return;
        }
        const built = { bytes: event.data.bytes, record: event.data.record };
        worker.current?.terminate();
        worker.current = null;
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        try {
          await db.printExports.add(built.record);
          if (n !== token.current) return;
          setHistory((items) => [built.record, ...items].slice(0, 20));
        } catch {
          if (n !== token.current) return;
          setNotice(
            "The PDF is ready, but its history entry could not be saved.",
          );
        }
        setResult(built);
        setBusy(false);
      };
      encoder.postMessage({
        book: snapshot,
        fonts,
        id: newId(),
        createdAt: new Date().toISOString(),
        includeFrontCover,
      });
    } catch (e) {
      fail(
        e instanceof Error
          ? e.message
          : "The print proof could not be generated.",
        n,
      );
    }
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(result.bytes)], { type: "application/pdf" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = result.record.filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="print-panel" aria-labelledby="print-title">
      <div className="publish-intro">
        <div>
          <div className="eyebrow">OFFLINE PAPERBACK PROOF</div>
          <h2 id="print-title">A book you can hold.</h2>
          <p>
            6 × 9-inch interior using your selected print design. Build the PDF on this device, inspect
            its actual pages, then download that same file.
          </p>
        </div>
        <span className="format-stamp">6 × 9 · NO BLEED</span>
      </div>
      <div className="print-profile">
        <div>
          <strong>{templateLabel} · print edition</strong>
          <p>
            Libre Baskerville {profile.fontSize} pt · {profile.leading} pt leading
            <br />
            Inside 0.75″ · outside 0.5625″ · top/bottom 0.75″
            <br />
            Mirrored margins · right-hand chapter openings · page numbers
          </p>
        </div>
        <div>
          <p className="print-inherited-design">
            <strong>Print design: {templateLabel}</strong>
            <span>Inherited from Design. Change your book template in the Design tab.</span>
          </p>
          <p>
            {profile.template.id === "classic"
              ? "Centered chapter titles, asterisks, traditional running headers."
              : profile.template.id === "modern"
                ? "Left-aligned chapter titles, fine scene rules, minimal running headers."
                : "Dramatic centered chapter openings, diamond scene ornaments and chapter running headers."}
          </p>
          <label className="print-justification-toggle">
            <input
              type="checkbox"
              aria-label="Include front cover"
              checked={includeFrontCover}
              disabled={busy || !book.cover}
              onChange={e=>{setIncludeFrontCover(e.target.checked);setResult(null);}}
            />
            <span>Include front cover</span>
          </label>
          <p>
            {book.cover
              ? "Off by default for paperback interiors. When enabled, the PDF starts with a full-page front cover and an unnumbered blank reverse, preserving interior page parity."
              : "Upload cover artwork in Design to enable this option. Print-ready interiors normally exclude covers."}
          </p>
          <p><strong>Print submission:</strong> Retailers generally require a separate full-wrap cover PDF for paperbacks.</p>
          <label className="print-justification-toggle">
            <input
              type="checkbox"
              checked={(book.editions?.print?.alignment ?? "left") === "justify"}
              disabled={busy}
              onChange={(e) => {
                onAlignmentChange(e.target.checked ? "justify" : "left");
                setResult(null);
              }}
            />
            <span>Justify body text</span>
          </label>
          <p role="status">
            {(book.editions?.print?.alignment ?? "left") === "justify"
              ? "Justification on — controlled word spacing."
              : "Justification off — left-aligned text with a ragged right edge."}
          </p>
          <p>
            Justification caps stretched word spaces at 165% of their natural
            width. Lines that would need larger gaps remain ragged-right.
            Rebuild the PDF after changing this option.
          </p>
          <p>
            Print typography is separate from your ebook design. This
            proof uses a fixed layout for text-only, left-to-right interiors.
          </p>
          <p>
            <b>Feasibility proof, not retailer approval.</b> Inspect the PDF and
            a physical proof before publication.
          </p>
        </div>
      </div>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="publish-notice">{notice}</p> : null}
      {issues.length ? (
        <div className="print-blockers">
          <h3>Before building</h3>
          <ul>
            {issues.map((i, index) => (
              <li key={index}>
                {i.location}: {i.message} {i.action}
              </li>
            ))}
          </ul>
          <button onClick={onPublish}>Review book details in Publish</button>
        </div>
      ) : null}
      <div className="print-actions">
        <button
          className="primary"
          disabled={busy || !!issues.length}
          onClick={build}
        >
          {busy
            ? "Building PDF locally…"
            : result
              ? "Rebuild PDF proof"
              : "Build 6 × 9 PDF proof"}
        </button>
        {busy ? (
          <button
            onClick={() => {
              stop();
              setBusy(false);
              setNotice(
                "Print proof cancelled. Your manuscript was not changed.",
              );
            }}
          >
            Cancel print build
          </button>
        ) : null}
        {result ? (
          <button disabled={busy} onClick={download}>
            Download PDF proof
          </button>
        ) : null}
      </div>
      {result ? (
        <>
          <div className="print-checks" aria-live="polite">
            <strong>
              {result.record.pageCount} pages ·{" "}
              {result.bytes.length < 1000000
                ? `${Math.round(result.bytes.length / 1024)} KB`
                : `${(result.bytes.length / 1024 / 1024).toFixed(1)} MB`}
            </strong>
            <span>
              {fingerprint === result.record.inputChecksum
                ? "Current snapshot"
                : "Earlier snapshot — rebuild to include your changes"}
            </span>
            <span>
              Geometry: 432 × 648 pt · Fonts embedded · Layout overflow: 0
            </span>
          </div>
          <details className="print-notes">
            <summary>Proof limitations and review notes</summary>
            <ul>
              {result.record.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <p>
              Interior folios retain their original numbering when an unnumbered cover and reverse are included. Headers are suppressed on
              title leaves, chapter openings and intentional blanks. PDF/UA,
              PDF/X, full-wrap paperback covers, complex scripts and retailer certification are not
              included.
            </p>
          </details>
          <PdfProofViewer bytes={result.bytes} record={result.record} />
        </>
      ) : (
        <div className="print-empty">
          <span>6 × 9</span>
          <h3>From manuscript to printed page.</h3>
          <p>
            Build a proof to check right-hand openings, gutters, page flow and
            blank leaves.
          </p>
        </div>
      )}
      <details className="print-history">
        <summary>Local print history ({history.length})</summary>
        <p>
          Recent 20 build records; PDF files are not stored here or in project
          backups.
        </p>
        {history.map((row) => (
          <div key={row.id}>
            <strong>
              {new Date(row.createdAt).toLocaleString()} · {row.pageCount} pages
            </strong>
            <p>
              {row.inputChecksum === fingerprint
                ? "Current snapshot"
                : "Earlier snapshot"}{" "}
              · {row.renderer} · revision {row.revision}
            </p>
            <code>{row.artifactChecksum}</code>
          </div>
        ))}
      </details>
    </section>
  );
}
