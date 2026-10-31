"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Book } from "../lib/model";
import { newId } from "../lib/model";
import { preflight, snapshotChecksum } from "../lib/epub";
import type { PrintFonts, PrintRecord, PrintResult } from "../lib/print";
import PdfProofViewer from "./PdfProofViewer";
import { inspectPrint, authorPrintIssues, printHasInternalFailure } from "../lib/print-preflight";
import { db } from "../lib/storage";
import { getPrintEdition, PRINT_TRIMS, type PrintTrim } from "../lib/print-profile";
import {localAsset,localWorker} from "../lib/offline-assets";
export default function PrintPanel({
  book,
  getSnapshot,
  onPublish,
  onAlignmentChange,
  onTrimChange,
}: {
  book: Book;
  getSnapshot: () => Promise<Book>;
  onPublish: () => void;
  onAlignmentChange: (alignment: "left" | "justify") => void;
  onTrimChange: (trim: PrintTrim) => void;
}) {
  const [includeFrontCover, setIncludeFrontCover] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState({percent:0,stage:"Preparing proof"}),
    [notice, setNotice] = useState(""),
    [result, setResult] = useState<PrintResult | null>(null),
    [history, setHistory] = useState<PrintRecord[]>([]);
  const releaseWorker=useRef<(()=>void)|null>(null);
  const worker = useRef<Worker | null>(null),
    abort = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    token = useRef(0);
  const issues = useMemo(
    () => preflight(book).filter((i) => i.severity === "error"),
    [book],
  );
  const fingerprint = useMemo(() => snapshotChecksum(book), [book]);
  const preflightReport = useMemo(() => inspectPrint({book,record:result?.record,inputChecksum:fingerprint}),[book,result,fingerprint]);
  const authorIssues = authorPrintIssues(preflightReport);
  const internalFailure = result ? printHasInternalFailure(preflightReport) : false;
  const profile = getPrintEdition(book);
  const trimLabel=PRINT_TRIMS[profile.trim].label;
  const trimSize=PRINT_TRIMS[profile.trim];
  const templateLabel = profile.template.id[0].toUpperCase() + profile.template.id.slice(1);
  function stop() {
    token.current++;
    worker.current?.terminate();
    worker.current = null;
    releaseWorker.current?.();releaseWorker.current=null;
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
    setProgress({percent:0,stage:"Preparing manuscript"});
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
          const response = await localAsset(`/epub-fonts/${file}`,controller.signal);
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
      const prepared=await localWorker("/print-worker.js?renderer=print-proof-1.5.0");
      if(n!==token.current){prepared.worker.terminate();prepared.release();return;}
      const encoder=prepared.worker;
      releaseWorker.current=prepared.release;
      worker.current=encoder;
      encoder.onerror = () =>
        fail(
          "The local PDF worker could not start. Open the app online once to update its offline files.",
          n,
        );
      encoder.onmessage = async (
        event: MessageEvent<{
          ok?: boolean;
          type?: "progress";
          percent?: number;
          stage?: string;
          error?: string;
          bytes?: Uint8Array;
          record?: PrintRecord;
        }>,
      ) => {
        if (n !== token.current) return;
        if (event.data.type === "progress") {
          setProgress(p=>({percent:Math.max(p.percent,Math.min(99,Math.max(0,event.data.percent??0))),stage:event.data.stage??p.stage}));
          return;
        }
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
        releaseWorker.current?.();releaseWorker.current=null;
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
        setProgress({percent:100,stage:"Proof ready"});
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
            Choose your paperback format, review the page layout, and export a print interior PDF.
          </p>
        </div>
        <span className="format-stamp">{trimLabel} · NO BLEED</span>
      </div>
      <div className="print-settings">
        <div className="print-settings-main">
          <div className="print-section-head">
            <div>
              <span className="print-section-kicker">01 / FORMAT</span>
              <h3>Page size</h3>
              <p>Choose the physical dimensions of your paperback.</p>
            </div>
            <span className="print-design-pill">{templateLabel} design</span>
          </div>
          <fieldset className="print-trim-options" aria-label="Trim size">
            <legend className="sr-only">Trim size</legend>
            {(Object.keys(PRINT_TRIMS) as PrintTrim[]).map(trim=>{
              const item=PRINT_TRIMS[trim];
              return <label key={trim} className={profile.trim===trim?"print-trim-card selected":"print-trim-card"}>
                <input type="radio" name="print-trim" value={trim} checked={profile.trim===trim} disabled={busy}
                  onChange={()=>{onTrimChange(trim);setResult(null);}}/>
                <span className="print-trim-card-content">
                  <span className="print-trim-card-head"><strong>{item.label}<small> in</small></strong>{trim==="5.5x8.5"?<em>Recommended</em>:null}</span>
                  <span className="print-trim-description">{trim==="5x8"?"Compact fiction · classic paperback":trim==="5.5x8.5"?"Balanced trade paperback": "Roomier layout · fewer pages"}</span>
                </span>
                <span aria-hidden="true" className="print-trim-shape" style={{width:trim==="5x8"?24:trim==="5.5x8.5"?27:30,height:trim==="5x8"?38:trim==="5.5x8.5"?41:44}}/>
              </label>;
            })}
          </fieldset>
          <p className="print-format-note">For most novels, <strong>5.5 × 8.5 inches</strong> offers a familiar, comfortable reading size. Smaller pages typically increase page count; larger pages generally reduce it. Your retailer must use the same trim size.</p>
          <div className="print-settings-divider" />
          <div className="print-section-head">
            <div>
              <span className="print-section-kicker">02 / OPTIONS</span>
              <h3>Interior options</h3>
              <p>Only affects the PDF. Your manuscript and ebook remain unchanged.</p>
            </div>
          </div>
          <div className="print-option-list">
            <label className="print-option-row">
              <input type="checkbox" aria-label="Include front cover" checked={includeFrontCover}
                disabled={busy||!book.cover} onChange={e=>{setIncludeFrontCover(e.target.checked);setResult(null);}}/>
              <span><strong>Include front cover</strong>
                <small>{book.cover?"Adds the cover and an unnumbered blank reverse page. Leave off for print-ready interiors.":"Add a cover in Design to enable this option."}</small></span>
            </label>
            <label className="print-option-row">
              <input type="checkbox" aria-label="Justify body text"
                checked={(book.editions?.print?.alignment??"left")==="justify"} disabled={busy}
                onChange={e=>{onAlignmentChange(e.target.checked?"justify":"left");setResult(null);}}/>
              <span><strong>Justify body text</strong>
                <small>{(book.editions?.print?.alignment??"left")==="justify"?"Even left and right edges, with capped word spacing.":"Left-aligned text with a natural ragged right edge."}</small></span>
            </label>
          </div>
        </div>
        <aside className="print-settings-aside" aria-label="Print edition summary">
          <span className="print-section-kicker">YOUR EDITION</span>
          <div className="print-mini-book" aria-hidden="true"><span>{trimLabel}</span></div>
          <h3>{templateLabel} paperback</h3>
          <p className="print-aside-subtitle">Libre Baskerville · {profile.fontSize} pt type · {profile.leading} pt leading</p>
          <dl className="print-spec-list">
            <div><dt>Trim</dt><dd>{trimLabel} inches</dd></div>
            <div><dt>Inside margin</dt><dd>{(profile.inside/72).toFixed(3)}″</dd></div>
            <div><dt>Outside margin</dt><dd>{(profile.outside/72).toFixed(3)}″</dd></div>
            <div><dt>Top / bottom</dt><dd>{(profile.top/72).toFixed(3)}″</dd></div>
            <div><dt>Chapter starts</dt><dd>Right-hand</dd></div>
          </dl>
          <p className="print-aside-footnote">Print style follows the <strong>Design</strong> tab. Retailers usually require a separate full-wrap paperback cover PDF.</p>
        </aside>
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
              : `Build ${trimLabel} PDF proof`}
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
          <button disabled={busy || internalFailure} onClick={download}>
            Download PDF proof
          </button>
        ) : null}
      </div>
      {busy ? <div className="print-progress" role="group" aria-label="Print PDF build progress">
        <label htmlFor="print-export-progress">{progress.stage} · {progress.percent}%</label>
        <progress id="print-export-progress" aria-label="Print PDF build progress" value={progress.percent} max={100} style={{width:"100%",height:12}} />
      </div> : null}
      {result && <div className="print-checks" role="status" aria-live="polite">
        {internalFailure
          ? <p><strong>PDF integrity check failed.</strong> The proof should not be used. Rebuild it; if the problem repeats, report it as an application issue.</p>
          : <p><strong>PDF proof generated.</strong> Review the pages before submitting to a printer.</p>}
        {authorIssues.map((i,index)=><p key={index}>
          {i.code === "STALE_PROOF" ? "Your book has changed since this PDF was built. Rebuild to include your edits." : `${i.message} ${i.action}`}
        </p>)}
      </div>}
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
              Page size: {trimSize.width} × {trimSize.height} pt · Fonts: {result.record.checks.fonts} · Renderer-reported overflow: {result.record.checks.overflow}
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
          <span>{trimLabel}</span>
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
