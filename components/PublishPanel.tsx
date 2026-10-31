"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Book } from "../lib/model";
import { newId } from "../lib/model";
import {
  preflight,
  snapshotChecksum,
  EPUB_RENDERER,
  validLanguage,
  type ExportRecord,
  type FontAssets,
} from "../lib/epub";
import { getEbookEdition } from "../lib/edition";
import { db } from "../lib/storage";
import {localAsset,localWorker} from "../lib/offline-assets";

export default function PublishPanel({
  book,
  getSnapshot,
  onMetadata,
  onExportSuccess,
}: {
  book: Book;
  onExportSuccess?: () => void;
  getSnapshot: () => Promise<Book>;
  onMetadata: (metadata: {
    title: string;
    author: string;
    language: string;
  }) => Promise<void>;
}) {
  const issues = useMemo(() => preflight(book), [book]);
  const currentChecksum = useMemo(() => snapshotChecksum(book), [book]);
  const [history, setHistory] = useState<ExportRecord[]>([]),
    [busy, setBusy] = useState(false),
    [phase, setPhase] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [result, setResult] = useState<ExportRecord | null>(null),
    [metadataBusy, setMetadataBusy] = useState(false),
    [validationBusy,setValidationBusy]=useState(false);
  const releaseWorker=useRef<(()=>void)|null>(null);
  const worker = useRef<Worker | null>(null),
    abort = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    generation = useRef(0);
  function stop() {
    generation.current++;
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
    db.exports
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
          setError(
            "Export history could not be opened. Your manuscript is still available.",
          );
      });
    return () => {
      active = false;
      stop();
    };
  }, [book.id]);
  async function saveDetails(form: FormData) {
    const title = String(form.get("title") ?? "").trim(),
      author = String(form.get("author") ?? "").trim(),
      language = String(form.get("language") ?? "").trim();
    setError("");
    if (!title || !author || !validLanguage(language)) {
      setError(
        "Enter a title, author and a valid language tag such as en or en-US.",
      );
      return;
    }
    setMetadataBusy(true);
    try {
      await onMetadata({ title, author, language });
      setNotice("Book details saved locally.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Book details could not be saved.",
      );
    } finally {
      setMetadataBusy(false);
    }
  }
  async function validateInBrowser(row:ExportRecord){
    setValidationBusy(true);setError("");setNotice("");
    let validator:Worker|undefined;
    try{
      const stored=await db.artifacts.get(row.id);
      if(!stored)throw Error("Saved EPUB not found. Generate the EPUB again.");
      validator=new Worker("/epubcheck-worker.js",{type:"module"});
      const worker=validator;
      const result=await new Promise<{valid:boolean;messages:NonNullable<ExportRecord["epubCheckMessages"]>}>((resolve,reject)=>{
        const timer=setTimeout(()=>{worker.terminate();reject(Error("EPUBCheck timed out. Try a smaller EPUB or validate with the external tool."));},180000);
        worker.onmessage=(event:MessageEvent<{ok:boolean;valid:boolean;messages:NonNullable<ExportRecord["epubCheckMessages"]>;error?:string}>)=>{
          clearTimeout(timer);if(event.data.ok)resolve(event.data);else reject(Error(event.data.error||"EPUBCheck failed."));
        };
        worker.onerror=()=>{clearTimeout(timer);reject(Error("Could not load the local EPUBCheck engine. Open Book Formatter online once and retry."));};
        worker.postMessage({id:row.id,bytes:stored.bytes});
      });
      const updated:ExportRecord={...row,epubCheck:result.valid?"passed":"failed",epubCheckVersion:"5.4.0",epubCheckCheckedAt:new Date().toISOString(),epubCheckMessages:result.messages.slice(0,250)};
      await db.exports.put(updated);
      setHistory(items=>items.map(item=>item.id===row.id?updated:item));
      setResult(current=>current?.id===row.id?updated:current);
      setNotice(result.valid?"EPUBCheck passed for this saved EPUB. Review reader appearance before publishing.":"EPUBCheck found errors. Review diagnostics below, correct the book, and generate a new EPUB.");
    }catch(e){setError(e instanceof Error?e.message:"EPUBCheck could not validate this EPUB.");}
    finally{validator?.terminate();setValidationBusy(false);}
  }
  async function importEpubCheckReport(row:ExportRecord,file:File) {
    setValidationBusy(true);setError("");setNotice("");
    try{
      if(file.size>2_000_000)throw Error("Report exceeds the 2 MB limit.");
      const report=JSON.parse(await file.text()) as Record<string,unknown>;
      if(report.format!=="book-formatter-epubcheck"||report.version!==1||!Array.isArray(report.messages))throw Error("Select the report created by scripts/validate-epub.mjs.");
      if(report.sha256!==row.artifactChecksum)throw Error("Report checksum does not match this EPUB export. Validate the exact downloaded EPUB file.");
      const artifact=await db.artifacts.get(row.id);
      if(!artifact)throw Error("Saved EPUB artifact not found. Regenerate the EPUB and validate the downloaded copy.");
      const digest=await crypto.subtle.digest("SHA-256",new Uint8Array(artifact.bytes));
      const actual=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
      if(actual!==report.sha256)throw Error("Stored EPUB content differs from the validated file.");
      const allMessages=report.messages as Record<string,unknown>[];
      const messages=allMessages.slice(0,250).map(m=>({
        severity:String(m.severity||"INFO").slice(0,24),
        code:String(m.code||"").slice(0,40),
        message:String(m.message||"").slice(0,900),
        location:String(m.location||"").slice(0,250),
        suggestion:typeof m.suggestion==="string"?m.suggestion.slice(0,900):undefined
      }));
      const passed=report.passed===true&&!allMessages.some(m=>["ERROR","FATAL"].includes(String(m.severity||m.level||"").toUpperCase()));
      const updated:ExportRecord={...row,epubCheck:passed?"passed":"failed",epubCheckVersion:String(report.epubCheckVersion||"unknown"),epubCheckCheckedAt:String(report.checkedAt||new Date().toISOString()),epubCheckMessages:messages};
      await db.exports.put(updated);
      setHistory(items=>items.map(item=>item.id===row.id?updated:item));
      setResult(current=>current?.id===row.id?updated:current);
      setNotice(passed?"EPUBCheck report attached to matching EPUB checksum. Publication conformance reported as passed; visually proof the book before publication.":"EPUBCheck reported errors. Review the findings and regenerate the EPUB.");
    }catch(e){setError(e instanceof Error?e.message:"Could not import EPUBCheck results.");}
    finally{setValidationBusy(false);}
  }
  function fail(message: string, token: number) {
    if (token !== generation.current) return;
    stop();
    setBusy(false);
    setPhase("");
    setError(message);
  }
  async function generate() {
    stop();
    const token = generation.current;
    setBusy(true);
    setError("");
    setNotice("");
    setResult(null);
    setPhase("Preparing a saved snapshot…");
    try {
      const snapshot = await getSnapshot();
      if (token !== generation.current) return;
      const errors = preflight(snapshot).filter((x) => x.severity === "error");
      if (errors.length)
        throw Error("Resolve the preflight errors before exporting.");
      const controller = new AbortController();
      abort.current = controller;
      let fonts: FontAssets | undefined;
      timer.current = setTimeout(
        () =>
          fail(
            "EPUB generation took too long and was stopped. Your book was not changed.",
            token,
          ),
        60_000,
      );
      if (getEbookEdition(snapshot).bodyFont === "baskerville") {
        setPhase("Loading the included fonts from this device…");
        const paths = [
          "/epub-fonts/regular.woff",
          "/epub-fonts/italic.woff",
          "/epub-fonts/bold.woff",
          "/licenses/Libre-Baskerville-OFL.txt",
        ];
        const [regular, italic, bold, license] = await Promise.all(
          paths.map(async (path) => {
            const response = await localAsset(path,controller.signal);
            if (!response.ok)
              throw Error(
                "The included fonts are not cached. Open the app online once and retry.",
              );
            return new Uint8Array(await response.arrayBuffer());
          }),
        );
        fonts = { regular, italic, bold, license };
      }
      if (token !== generation.current) return;
      setPhase("Building your EPUB locally…");
      const prepared=await localWorker(`/epub-worker.js?renderer=${EPUB_RENDERER}`);
      if(token!==generation.current){prepared.worker.terminate();prepared.release();return;}
      const encoder=prepared.worker;
      releaseWorker.current=prepared.release;
      worker.current=encoder;
      encoder.onerror = () =>
        fail(
          "The EPUB worker could not start. Reopen the app online once to update its offline files.",
          token,
        );
      encoder.onmessage = async (
        event: MessageEvent<{
          ok: boolean;
          error?: string;
          bytes?: Uint8Array;
          record?: ExportRecord;
        }>,
      ) => {
        if (token !== generation.current) return;
        if (!event.data.ok || !event.data.bytes || !event.data.record) {
          fail(event.data.error ?? "EPUB generation failed.", token);
          return;
        }
        if (event.data.record.renderer !== EPUB_RENDERER) {
          fail("An outdated EPUB worker generated this book. Reload the application online and try again.", token);
          return;
        }
        const { bytes, record } = event.data;
        worker.current?.terminate();
        worker.current = null;
        releaseWorker.current?.();releaseWorker.current=null;
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        try {
          await db.transaction("rw",db.exports,db.artifacts,async()=>{await db.exports.add(record);await db.artifacts.put({id:record.id,bookId:record.bookId,format:"epub",createdAt:record.createdAt,bytes:new Uint8Array(bytes)});});
          if (token !== generation.current) return;
          setHistory((items) => [record, ...items].slice(0, 20));
        } catch {
          if (token !== generation.current) return;
          setNotice(
            "The EPUB was generated, but its history entry could not be saved. Keep your downloaded file.",
          );
        }
        if (token !== generation.current) return;
        const url = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: "application/epub+zip" }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = record.filename;
        link.click();
        onExportSuccess?.();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setResult(record);
        setBusy(false);
        setPhase("");
      };
      encoder.postMessage({
        book: snapshot,
        fonts,
        id: newId(),
        createdAt: new Date().toISOString(),
      });
    } catch (e) {
      fail(
        e instanceof Error
          ? e.message
          : "EPUB generation failed. Your book was not changed.",
        token,
      );
    }
  }
  const errors = issues.filter((i) => i.severity === "error"),
    warnings = issues.filter((i) => i.severity === "warning");
  return (
    <section className="publish-panel" aria-labelledby="publish-title">
      <div className="publish-intro">
        <div>
          <div className="eyebrow">LOCAL EPUB EXPORT</div>
          <h2 id="publish-title">Ready for the next reader.</h2>
          <p>
            Build a reflowable ebook from your manuscript and selected ebook design.
            Everything happens on this device.
          </p>
        </div>
        <span className="format-stamp">EPUB 3.3</span>
      </div>
      {error ? (
        <div className="alert" role="alert">
          {error}
        </div>
      ) : null}
      {notice ? <p className="publish-notice">{notice}</p> : null}
      <div className="publish-grid">
        <div>
          <section className="publish-card">
            <h3>Book details</h3>
            <form
              key={`${book.id}-${book.title}-${book.author}-${book.language}`}
              action={saveDetails}
            >
              <label>
                Publication title
                <input
                  name="title"
                  defaultValue={book.title}
                  maxLength={200}
                  required
                  disabled={busy || metadataBusy}
                />
              </label>
              <label>
                Publication author
                <input
                  name="author"
                  defaultValue={book.author}
                  maxLength={200}
                  required
                  disabled={busy || metadataBusy}
                />
              </label>
              <label>
                Language tag
                <input
                  name="language"
                  defaultValue={book.language ?? "en"}
                  placeholder="en"
                  maxLength={35}
                  required
                  disabled={busy || metadataBusy}
                />
              </label>
              <p className="control-note">
                English defaults to en. Use a language tag such as en-US, fr or
                de.
              </p>
              <button disabled={busy || metadataBusy}>
                {metadataBusy ? "Saving…" : "Save book details"}
              </button>
            </form>
          </section>
          <section className="publish-card">
            <h3>Before you export</h3>
            <div className="preflight-summary">
              {errors.length
                ? `${errors.length} issue${errors.length === 1 ? "" : "s"} to fix`
                : "Metadata and chapter checks passed"}
              <span>
                {warnings.length} review note{warnings.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="preflight-issues">
              {issues.map((issue, i) => (
                <li key={i}>
                  <span
                    className={
                      issue.severity === "error"
                        ? "issue-error"
                        : "issue-warning"
                    }
                  >
                    {issue.severity === "error" ? "Fix" : "Review"}
                  </span>
                  <strong>{issue.location}</strong>
                  <p>{issue.message}</p>
                  <small>{issue.action}</small>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <div>
          <section className="publish-card export-card">
            <div className="eyebrow">{getEbookEdition(book).template.id.toUpperCase()} · VERSION {getEbookEdition(book).template.version}</div>
            <h3>Your ebook, to go.</h3>
            <p>
              {book.chapters.length} section
              {book.chapters.length === 1 ? "" : "s"} ·{" "}
              {getEbookEdition(book).bodyFont === "baskerville"
                ? "Libre Baskerville embedded"
                : "System serif; no font embedded"}
            </p>
            <ul>
              <li>Navigable table of contents</li>
              <li>Bold, italic, headings and scene ornaments</li>
              <li>Saved typography and paragraph settings</li>
              <li>Build versions and snapshot checksum</li>
            </ul>
            <button
              className="primary"
              disabled={!!errors.length || busy || metadataBusy}
              onClick={generate}
            >
              {busy ? "Generating EPUB…" : "Generate & download EPUB"}
            </button>
            {busy ? (
              <div className="export-progress" aria-live="polite">
                <p>{phase}</p>
                <button
                  onClick={() => {
                    stop();
                    setBusy(false);
                    setPhase("");
                    setNotice("Export cancelled. Your book was not changed.");
                  }}
                >
                  Cancel export
                </button>
              </div>
            ) : null}
            {result ? (
              <div className="export-result" aria-live="polite">
                <strong>EPUB generated. Download started.</strong>
                <p>
                  {result.filename} · {(result.byteLength / 1024).toFixed(0)} KB
                </p>
                <p>
                  Local package checks passed.
                  <br />
                  <b>{result.epubCheck==="passed"?"EPUBCheck passed":result.epubCheck==="failed"?"EPUBCheck reported errors":"EPUBCheck has not run on this file."}</b>
                </p>
              </div>
            ) : null}
            <div className="validation-note">
              <strong>About validation</strong>
              <p>
                Local checks cover metadata, chapter content and expected
                package files. They do not replace EPUBCheck or a visual reader
                proof. This browser does not label exports publication-ready.
              </p>
              <p>You can run EPUBCheck entirely locally with the <strong>Run EPUBCheck in browser</strong> button on the saved export below. Alternatively, run official EPUBCheck with Java outside the browser using <code>node scripts/validate-epub.mjs book.epub path/to/epubcheck.jar</code>, then attach the resulting <code>.epubcheck.json</code> report to the matching export-history entry. No book upload occurs. A report must match the saved EPUB SHA-256 before the result can be recorded.</p>
              <a
                href="https://www.w3.org/publishing/epubcheck/"
                target="_blank"
                rel="noreferrer"
              >
                How to run EPUBCheck ↗
              </a>
            </div>
          </section>
          <section className="publish-card export-history">
            <h3>Export history</h3>
            <p className="control-note">
              Recent 20 locally generated exports. Generated EPUB files are retained in this browser when storage permits. Keep independent downloads and backups.
            </p>
            {history.length ? (
              history.map((row) => (
                <details key={row.id}>
                  <summary>
                    <span>{new Date(row.createdAt).toLocaleString()}</span>
                    <small
                      className={
                        row.inputChecksum !== currentChecksum
                          ? "history-stale"
                          : "history-current"
                      }
                    >
                      {row.inputChecksum !== currentChecksum
                        ? "Earlier snapshot"
                        : "Current snapshot"}
                    </small>
                  </summary>
                  <p>{row.filename}</p>
                  <button type="button" disabled={validationBusy} onClick={()=>void validateInBrowser(row)}>{validationBusy?"Validating EPUB…":"Run EPUBCheck in browser"}</button>
                  <label className="epubcheck-report-input">Attach EPUBCheck JSON report
                    <input type="file" accept=".json,application/json" disabled={validationBusy} onChange={e=>{const file=e.target.files?.[0];if(file)void importEpubCheckReport(row,file);e.target.value="";}}/>
                  </label>
                  {row.epubCheckMessages?.length?<ul className="epubcheck-findings">{row.epubCheckMessages.map((m,i)=><li key={i}><strong>{m.severity} {m.code}</strong> {m.location?<small>{m.location}</small>:null}<p>{m.message}</p>{m.suggestion?<p>Suggested fix: {m.suggestion}</p>:null}</li>)}</ul>:null}
                  <button type="button" onClick={()=>void db.artifacts.get(row.id).then(artifact=>{if(!artifact){setNotice("This older export has no saved file. Generate it again.");return;}const url=URL.createObjectURL(new Blob([new Uint8Array(artifact.bytes)],{type:"application/epub+zip"}));const a=document.createElement("a");a.href=url;a.download=row.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);})}>Download saved EPUB</button>
                  <dl>
                    <dt>Manuscript revision</dt>
                    <dd>{row.revision}</dd>
                    <dt>Renderer</dt>
                    <dd>{row.renderer}</dd>
                    <dt>Template</dt>
                    <dd>
                      {row.edition.template.id} v{row.edition.template.version}
                    </dd>
                    <dt>Local checks</dt>
                    <dd>Passed</dd>
                    <dt>EPUBCheck</dt>
                    <dd>{row.epubCheck==="passed"?"Passed":row.epubCheck==="failed"?"Errors found":"Not run"}</dd>
                    <dt>SHA-256</dt>
                    <dd className="file-checksum">{row.artifactChecksum}</dd>
                  </dl>
                </details>
              ))
            ) : (
              <p className="muted">Your first export will appear here.</p>
            )}
          </section>
        </div>
      </div>
    </section>
  );
}
