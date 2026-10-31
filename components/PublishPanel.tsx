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

export default function PublishPanel({
  book,
  getSnapshot,
  onMetadata,
}: {
  book: Book;
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
  const worker = useRef<Worker | null>(null),
    abort = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    generation = useRef(0);
  function stop() {
    generation.current++;
    worker.current?.terminate();
    worker.current = null;
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
            const response = await fetch(path, { signal: controller.signal });
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
      const encoder = new Worker(`/epub-worker.js?renderer=${EPUB_RENDERER}`);
      worker.current = encoder;
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
        if (timer.current) clearTimeout(timer.current);
        timer.current = null;
        try {
          await db.exports.add(record);
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
                  <b>EPUBCheck has not run on this file.</b>
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
              Recent 20 locally generated exports. Keep the downloaded EPUB
              files; history stores build details only.
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
                    <dd>Not run</dd>
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
