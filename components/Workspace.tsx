"use client";
import { useEffect, useRef, useState, useDeferredValue } from "react";
import Editor from "./Editor";
import ImportPanel from "./ImportPanel";
import DesignPanel from "./DesignPanel";
import EbookPreview from "./EbookPreview";
import PublishPanel from "./PublishPanel";
import { getEbookEdition, type EbookEdition } from "../lib/edition";
import { blankChapter, createBook, type Book } from "../lib/model";
import { db, saveBook, saveImportedBook } from "../lib/storage";
import { backupBook, restoreProject } from "../lib/backup";
export default function Workspace() {
  const [importing, setImporting] = useState(false);
  const [mode, setMode] = useState<"manuscript" | "design" | "publish">(
    "manuscript",
  );
  const [books, setBooks] = useState<Book[]>([]),
    [book, setBook] = useState<Book | null>(null),
    [chapterId, setChapterId] = useState(""),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [offline, setOffline] = useState(false),
    [installed, setInstalled] = useState(false),
    [offlineSupported, setOfflineSupported] = useState(true),
    [storage, setStorage] = useState("");
  const pending = useRef(0),
    blocked = useRef(false);
  const current = useRef<Book | null>(null),
    queue = useRef(Promise.resolve()),
    failed = useRef(false),
    file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    db.books
      .orderBy("updatedAt")
      .reverse()
      .toArray()
      .then(setBooks)
      .catch(() =>
        setError(
          "Local storage could not be opened. Check your browser storage settings.",
        ),
      )
      .finally(() => setReady(true));
    const network = () => setOffline(!navigator.onLine);
    network();
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    setOfflineSupported("serviceWorker" in navigator);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker
        .register("/sw.js")
        .then(async () => {
          await navigator.serviceWorker.ready;
          setInstalled(true);
        })
        .catch(() =>
          setError(
            "Offline installation failed. Keep this tab online and reload to retry.",
          ),
        );
    navigator.storage?.estimate().then((e) => {
      if (e.quota && e.usage && e.usage / e.quota > 0.8)
        setStorage("Storage is nearly full. Download a backup.");
    });
    const leave = (event: BeforeUnloadEvent) => {
      if (current.current && failed.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
      window.removeEventListener("beforeunload", leave);
    };
  }, []);
  function open(b: Book) {
    current.current = b;
    setBook(b);
    setMode("manuscript");
    setChapterId(b.chapters[0].id);
    setStatus("Saved locally");
    failed.current = false;
    blocked.current = false;
    setError("");
  }
  function update(next: Book) {
    pending.current++;
    current.current = next;
    setBook(next);
    setStatus("Saving locally…");
    failed.current = true;
    queue.current = queue.current
      .then(async () => {
        if (blocked.current)
          throw Error(
            "Saving paused after an error. Download a backup and reload.",
          );
        const saved = await saveBook(next, next.revision);
        pending.current--;
        if (current.current?.id === next.id) {
          current.current = {
            ...current.current,
            revision: saved.revision,
            updatedAt: saved.updatedAt,
          };
          setBook(current.current);
          setStatus(pending.current ? "Saving locally…" : "Saved locally");
          failed.current = pending.current > 0;
        }
        setBooks((items) => [saved, ...items.filter((x) => x.id !== saved.id)]);
      })
      .catch((e) => {
        pending.current--;
        blocked.current = true;
        setStatus("Save failed");
        failed.current = true;
        setError(
          e instanceof Error
            ? e.message
            : "Save failed. Download a backup before closing.",
        );
      });
  }
  // Reserve revisions synchronously so rapid edits queue with unique expected revisions.
  const reserved = useRef(new Map<string, number>());
  function edit(next: Book) {
    const revision = reserved.current.get(next.id) ?? next.revision;
    reserved.current.set(next.id, revision + 1);
    update({ ...next, revision });
  }
  async function create(form: FormData) {
    try {
      const b = createBook(
        String(form.get("title") || "Untitled book"),
        String(form.get("author") || ""),
      );
      const saved = await saveBook(b, 0);
      setBooks((x) => [saved, ...x]);
      open(saved);
      navigator.storage
        ?.persist()
        .then((p) =>
          setStorage(
            p
              ? "Persistent storage granted. Keep independent backups."
              : "Browser storage may be cleared. Keep independent backups.",
          ),
        );
    } catch {
      setError("Could not create a book. Check browser storage.");
    }
  }
  async function dashboard() {
    await queue.current;
    if (failed.current) return;
    current.current = null;
    setBook(null);
  }
  function download(bytes: Uint8Array, name: string, type: string) {
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], { type }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function backup() {
    if (!current.current) return;
    try {
      const snapshot = current.current;
      const source = await db.sources.get(snapshot.id);
      if (snapshot.importInfo && !source)
        throw Error(
          "The original import file is missing. Download your current manuscript separately before reloading.",
        );
      const bytes = backupBook(snapshot, source);
      download(
        bytes,
        `${snapshot.title.replace(/[^a-z0-9]/gi, "-") || "book"}.book.zip`,
        "application/zip",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Backup failed. Try again before closing.",
      );
    }
  }
  async function original() {
    if (!current.current) return;
    try {
      const source = await db.sources.get(current.current.id);
      if (!source) throw Error("No original file is available for this book.");
      download(source.bytes, source.filename, "application/octet-stream");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Original file could not be read.",
      );
    }
  }
  async function restore(f: File) {
    try {
      if (f.size > 20_000_000) throw Error("Backup exceeds 20 MB.");
      const project = restoreProject(new Uint8Array(await f.arrayBuffer()));
      const saved = await saveImportedBook(project.book, project.source);
      setBooks((x) => [saved, ...x]);
      open(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed.");
    }
  }
  const chapter = book?.chapters.find((c) => c.id === chapterId);
  const previewChapter = useDeferredValue(chapter);
  async function exportSnapshot(): Promise<Book> {
    await queue.current;
    if (failed.current || blocked.current)
      throw Error(
        "The current book has unsaved changes. Resolve the save error before exporting.",
      );
    if (!current.current) throw Error("Open a book before exporting.");
    return structuredClone(current.current);
  }
  async function updateMetadata(metadata: {
    title: string;
    author: string;
    language: string;
  }) {
    const b = current.current;
    if (!b) throw Error("Open a book first.");
    edit({ ...b, ...metadata });
    await queue.current;
    if (failed.current)
      throw Error(
        "Book details could not be saved. Resolve the local save error.",
      );
  }
  function changeEdition(edition: EbookEdition) {
    const b = current.current;
    if (b) edit({ ...b, editions: { ebook: edition } });
  }
  return (
    <>
      {importing ? (
        <ImportPanel
          onClose={() => setImporting(false)}
          onImported={(saved) => {
            setBooks((x) => [saved, ...x]);
            open(saved);
            setImporting(false);
          }}
        />
      ) : null}
      <header className="topbar">
        <button className="brand" onClick={dashboard}>
          <span className="brand-icon">▤</span> Book Formatter
          <span className="badge">FOUNDATION</span>
        </button>
        <div className="connection">
          {offline ? "● Offline" : "● Local workspace"}
          <span>
            {!offlineSupported
              ? "Offline installation requires HTTPS"
              : installed
                ? "Offline app ready"
                : "Preparing offline app…"}
          </span>
        </div>
      </header>
      {error ? (
        <div className="alert" role="alert">
          {error} <button onClick={() => setError("")}>Dismiss</button>
        </div>
      ) : null}
      <input
        ref={file}
        type="file"
        accept=".zip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void restore(f);
          e.target.value = "";
        }}
      />
      {!book ? (
        <main className="dashboard">
          <div className="eyebrow">A PLACE FOR YOUR NEXT BOOK</div>
          <h1>
            Your words.
            <br />
            <em>Beautifully bound.</em>
          </h1>
          <p className="intro">
            Give your manuscript room to become a book.
            <br />
            Private by default. Yours to keep.
          </p>
          <div className="dashboard-grid">
            <section className="card">
              <h2>Start a new book</h2>
              <form action={create}>
                <label>
                  Book title
                  <input
                    name="title"
                    placeholder="The story begins here"
                    required
                    maxLength={200}
                  />
                </label>
                <label>
                  Author name
                  <input
                    name="author"
                    placeholder="Your pen name"
                    maxLength={200}
                  />
                </label>
                <button className="primary" disabled={!ready}>
                  Create local book <span>↗</span>
                </button>
              </form>
              <button
                className="secondary"
                disabled={!ready}
                onClick={() => setImporting(true)}
              >
                ↑ Import a manuscript
              </button>
              <button
                className="text-button"
                onClick={() => file.current?.click()}
              >
                Restore a project backup
              </button>
            </section>
            <section className="library">
              <h2>
                Your bookshelf <span>{books.length}</span>
              </h2>
              {!ready ? (
                <p>Opening your bookshelf…</p>
              ) : books.length ? (
                books.map((b) => (
                  <button
                    className="book-card"
                    key={b.id}
                    onClick={() => open(b)}
                  >
                    <span className="book-spine">{b.title.slice(0, 1)}</span>
                    <span>
                      <strong>{b.title}</strong>
                      <small>
                        {b.author || "Author not set"} · {b.chapters.length}{" "}
                        chapter{b.chapters.length !== 1 ? "s" : ""}
                      </small>
                    </span>
                    <span className="arrow">→</span>
                  </button>
                ))
              ) : (
                <div className="empty">
                  <span>▤</span>
                  <h3>A shelf of possibilities.</h3>
                  <p>Your local books will appear here.</p>
                </div>
              )}
            </section>
          </div>
          <footer>
            No account required. Manuscripts stay in this browser.
            <br />
            Browser data can be cleared; download regular backups. {storage}
          </footer>
        </main>
      ) : (
        <main className="workspace">
          <aside>
            <button className="text-button" onClick={dashboard}>
              ← Bookshelf
            </button>
            <div className="eyebrow">MANUSCRIPT</div>
            <h2>{book.title}</h2>
            <p className="muted">{book.author || "Author not set"}</p>
            <div className="chapter-list">
              {book.chapters.map((c, i) => (
                <button
                  className={c.id === chapterId ? "selected" : ""}
                  key={c.id}
                  onClick={() => setChapterId(c.id)}
                >
                  <small>{String(i + 1).padStart(2, "0")}</small>
                  {c.title}
                </button>
              ))}
            </div>
            <button
              className="add"
              onClick={() => {
                const c = blankChapter(`Chapter ${book.chapters.length + 1}`);
                edit({ ...book, chapters: [...book.chapters, c] });
                setChapterId(c.id);
              }}
            >
              + Add chapter
            </button>
            <div className="aside-bottom">
              <button
                className="export-link"
                onClick={() => setMode("publish")}
              >
                Export EPUB
              </button>
              {book.importInfo ? (
                <>
                  <button onClick={original}>↓ Download original</button>
                  <details className="saved-import-report">
                    <summary>Import report</summary>
                    <p>{book.importInfo.filename}</p>
                    {book.importInfo.diagnostics.length ? (
                      <ul>
                        {book.importInfo.diagnostics.map((d, i) => (
                          <li key={i}>{d.message}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>No conversion warnings.</p>
                    )}
                  </details>
                </>
              ) : null}
              <button onClick={backup}>↓ Download backup</button>
              <p>
                Stored on this device.
                <br />
                Keep an independent backup.
              </p>
            </div>
          </aside>
          <div className="workspace-content">
            <nav className="workspace-modes" aria-label="Workspace mode">
              <div>
                <button
                  aria-pressed={mode === "manuscript"}
                  onClick={() => setMode("manuscript")}
                >
                  Manuscript
                </button>
                <button
                  aria-pressed={mode === "design"}
                  onClick={() => setMode("design")}
                >
                  Design
                </button>
                <button
                  aria-pressed={mode === "publish"}
                  onClick={() => setMode("publish")}
                >
                  Publish
                </button>
              </div>
              <div className="workspace-save">
                <span>Classic · ebook edition</span>
                <span
                  role="status"
                  className={status === "Save failed" ? "failed" : "saved"}
                >
                  {status}
                </span>
              </div>
            </nav>
            <div className={`workspace-body mode-${mode}`}>
              <section className="editor-area" hidden={mode !== "manuscript"}>
                <div className="editor-meta">
                  <span>MANUSCRIPT / {chapter?.title}</span>
                  <span>Chapter text</span>
                </div>
                {chapter ? (
                  <article className="paper">
                    <div className="eyebrow">
                      CHAPTER {book.chapters.indexOf(chapter) + 1}
                    </div>
                    <input
                      className="chapter-title"
                      aria-label="Chapter title"
                      value={chapter.title}
                      onChange={(e) =>
                        edit({
                          ...book,
                          chapters: book.chapters.map((c) =>
                            c.id === chapter.id
                              ? { ...c, title: e.target.value }
                              : c,
                          ),
                        })
                      }
                    />
                    <Editor
                      key={`${book.id}-${chapter.id}`}
                      content={chapter.content}
                      onChange={(content) => {
                        const b = current.current;
                        if (b)
                          edit({
                            ...b,
                            chapters: b.chapters.map((c) =>
                              c.id === chapter.id ? { ...c, content } : c,
                            ),
                          });
                      }}
                    />
                  </article>
                ) : null}
                <p className="editor-foot">
                  A quiet space for your story.{" "}
                  <span>⌘ / Ctrl + B bold · ⌘ / Ctrl + I italic</span>
                </p>
              </section>
              <DesignPanel
                hidden={mode !== "design"}
                edition={getEbookEdition(book)}
                onChange={changeEdition}
              />
              {mode === "publish" ? (
                <PublishPanel
                  book={book}
                  getSnapshot={exportSnapshot}
                  onMetadata={updateMetadata}
                />
              ) : null}
              <EbookPreview
                hidden={mode === "publish"}
                book={book}
                chapter={previewChapter}
                chapterId={chapterId}
                edition={getEbookEdition(book)}
                onNavigate={setChapterId}
                updating={previewChapter !== chapter}
              />
            </div>
          </div>
        </main>
      )}
    </>
  );
}
