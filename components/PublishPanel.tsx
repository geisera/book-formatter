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
    [metadataBusy, setMetadataBusy] = useState(false);
  const unsavedExport=useRef<{id:string;bytes:Uint8Array}|null>(null);
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
  async function runEpubCheck(bytes:Uint8Array,id:string):Promise<{valid:boolean;messages:NonNullable<ExportRecord["epubCheckMessages"]>}>{
    const validator=new Worker("/epubcheck-worker.js",{type:"module"});
    try{
      return await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error("EPUBCheck timed out.")),180000);
        validator.onmessage=(event:MessageEvent<{ok:boolean;valid:boolean;messages:NonNullable<ExportRecord["epubCheckMessages"]>;error?:string}>)=>{
          clearTimeout(timer);
          if(event.data.ok)resolve({valid:event.data.valid,messages:event.data.messages});
          else reject(Error(event.data.error||"EPUBCheck failed."));
        };
        validator.onerror=()=>{clearTimeout(timer);reject(Error("The local EPUBCheck worker failed to load."));};
        validator.postMessage({id,bytes:new Uint8Array(bytes)});
      });
    }finally{validator.terminate();}
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
    unsavedExport.current=null;
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
        setPhase("Running EPUBCheck locally…");
        let checked:ExportRecord=record;
        let validationProblem="";
        try{
          const report=await runEpubCheck(bytes,record.id);
          checked={...record,epubCheck:report.valid?"passed":"failed",epubCheckVersion:"5.4.0",epubCheckCheckedAt:new Date().toISOString(),epubCheckMessages:report.messages.slice(0,250)};
        }catch(e){validationProblem=e instanceof Error?e.message:"EPUBCheck unavailable.";}
        if(token!==generation.current)return;
        try{
          await db.transaction("rw",db.exports,db.artifacts,async()=>{
            await db.exports.add(checked);
            await db.artifacts.put({id:checked.id,bookId:checked.bookId,format:"epub",createdAt:checked.createdAt,bytes:new Uint8Array(bytes)});
          });
          if(token!==generation.current)return;
          setHistory(items=>[checked,...items].slice(0,20));
        }catch{
          if(token!==generation.current)return;
          validationProblem+=(validationProblem?" ":"")+"Unable to save export history. Download a troubleshooting copy before leaving.";
        }
        if(token!==generation.current)return;
        unsavedExport.current={id:checked.id,bytes:new Uint8Array(bytes)};
        setResult(checked);setBusy(false);setPhase("");
        if(checked.epubCheck==="passed"){
          const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"application/epub+zip"}));
          const link=document.createElement("a");link.href=url;link.download=record.filename;link.click();
          onExportSuccess?.();setTimeout(()=>URL.revokeObjectURL(url),1000);
          setNotice("EPUBCheck passed. EPUB downloaded automatically.");
        }else if(checked.epubCheck==="failed"){
          setNotice("EPUBCheck found errors. The EPUB has been saved locally but was not downloaded automatically. Inspect findings and use the troubleshooting download if needed.");
        }else{
          setNotice("EPUB generated but validation could not complete: "+validationProblem+" The file was not downloaded automatically.");
        }
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
              {busy ? "Generating EPUB…" : "Generate & validate EPUB"}
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
                <strong>{result.epubCheck==="passed"?"EPUB validated and downloaded.":result.epubCheck==="failed"?"EPUB generated — validation failed.":"EPUB generated — validation unavailable."}</strong>
                <p>
                  {result.filename} · {(result.byteLength / 1024).toFixed(0)} KB
                </p>
                {result.epubCheck!=="passed"?<button type="button" onClick={()=>void db.artifacts.get(result.id).then(artifact=>{const bytes=artifact?.bytes??(unsavedExport.current?.id===result.id?unsavedExport.current.bytes:null);if(!bytes){setError("Saved EPUB unavailable. Generate another copy.");return;}const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:"application/epub+zip"}));const a=document.createElement("a");a.href=url;a.download=result.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);})}>Download unvalidated EPUB for troubleshooting</button>:null}
                {result.epubCheckMessages?.length?<ul className="epubcheck-findings">{result.epubCheckMessages.map((m,i)=><li key={i}><strong>{m.severity} {m.code}</strong> {m.location}<p>{m.message}</p></li>)}</ul>:null}
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
                Every time you select <strong>Generate &amp; validate EPUB</strong>, Book Formatter builds the EPUB and automatically runs EPUBCheck locally in your browser. Files that pass validation download automatically. If EPUBCheck finds errors or cannot complete, the EPUB is kept for troubleshooting and is not labeled as validated.
              </p>
              <p>
                Results and detailed findings are saved in <strong>Export history</strong>. No book content is uploaded.
              </p>
              <p>
                EPUBCheck verifies technical conformance, not visual appearance or retailer approval. Review your EPUB in an ebook reader before publication.
              </p>
              <a href="https://www.w3.org/publishing/epubcheck/" target="_blank" rel="noreferrer">
                About EPUBCheck ↗
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
