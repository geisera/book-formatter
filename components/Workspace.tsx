"use client";
import { useEffect, useRef, useState, useDeferredValue } from "react";
import Link from "next/link";
import Editor from "./Editor";
import FindReplacePanel,{type SearchConfig} from "./FindReplacePanel";
import {findInBook,replaceAcrossBook,type TextMatch} from "../lib/find-replace";
import ImportPanel from "./ImportPanel";
import DesignPanel from "./DesignPanel";
import BookDetailsPanel from "./BookDetailsPanel";
import type {PublicationMetadata} from "../lib/publication-metadata";
import EbookPreview from "./EbookPreview";
import PublishPanel from "./PublishPanel";
import PrintPanel from "./PrintPanel";
import StructurePanel from "./StructurePanel";
import { changeStructure, type StructureAction } from "../lib/structure";
import { getEbookEdition, type EbookEdition } from "../lib/edition";
import { getPrintEdition, printPreset } from "../lib/print-profile";
import { blankChapter, createBook, type Book } from "../lib/model";
import { db, saveBook, saveImportedBook, deleteBook } from "../lib/storage";
import { backupBook, restoreProject } from "../lib/backup";
export default function Workspace() {
  const [findOpen,setFindOpen]=useState(false);
  const [findConfig,setFindConfig]=useState<SearchConfig>({query:"",replacement:"",scope:"chapter",caseSensitive:false,wholeWord:false});
  const [findFocus,setFindFocus]=useState<{from:number;to:number;nonce:number}|undefined>();
  const [editorVersion,setEditorVersion]=useState(0);
  const [replacementHistory,setReplacementHistory]=useState<{before:Book;after:Book}|null>(null);
  const [replacementUndone,setReplacementUndone]=useState(false);
  const focusCounter=useRef(0);
  const [importing, setImporting] = useState(false);
  const [activeBookMenu, setActiveBookMenu] = useState<string | null>(null);
  const [deletingBookId, setDeletingBookId] = useState<string | null>(null);
  const [mode, setMode] = useState<
    "manuscript" | "structure" | "design" | "details" | "publish" | "print"
  >("manuscript");
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
  useEffect(() => {
    if (!activeBookMenu) return;
    const dismissOutside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && target.parentElement?.closest(".bookshelf-menu-wrap")) return;
      setActiveBookMenu(null);
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveBookMenu(null);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissEscape);
    };
  }, [activeBookMenu]);
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="f"&&current.current){
        event.preventDefault();setMode("manuscript");setFindOpen(true);
      }
      if(event.key==="Escape")setFindOpen(false);
    };
    window.addEventListener("keydown",key);
    return()=>window.removeEventListener("keydown",key);
  },[]);
  function navigateMatch(match:TextMatch){
    setChapterId(match.chapterId);
    setMode("manuscript");
    setFindFocus({from:match.from,to:match.to,nonce:++focusCounter.current});
  }
  function applyReplacements(matches:TextMatch[],replacement:string){
    const b=current.current;if(!b||!matches.length)return;
    const next=replaceAcrossBook(b,matches,replacement);
    setReplacementHistory({before:structuredClone(b),after:structuredClone(next)});
    setReplacementUndone(false);
    edit(next);
    setEditorVersion(x=>x+1);
    if(matches[0].chapterId!==chapterId)setChapterId(matches[0].chapterId);
    setFindFocus(undefined);
  }
  function swapReplacement(undoReplace:boolean){
    const change=replacementHistory,b=current.current;
    if(!change||!b)return;
    edit({...b,chapters:(undoReplace?change.before:change.after).chapters});
    setEditorVersion(x=>x+1);
    setReplacementUndone(undoReplace);
    setFindFocus(undefined);
  }
  function open(b: Book) {
    current.current = b;
    setBook(b);
    setMode("manuscript");
    setFindOpen(false);setReplacementHistory(null);setFindFocus(undefined);
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
  async function bookshelfBackup(item: Book) {
    try {
      setActiveBookMenu(null);
      const source = await db.sources.get(item.id);
      if (item.importInfo && !source)
        throw Error("The original imported manuscript is missing. A complete project backup cannot be created.");
      const bytes = backupBook(item, source);
      download(bytes,
        `${item.title.replace(/[^a-z0-9]/gi, "-") || "book"}.book.zip`,
        "application/zip");
      setStatus("Project backup downloaded");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create project backup.");
    }
  }
  async function bookshelfDelete(item: Book) {
    setActiveBookMenu(null);
    if (!window.confirm(
      `Permanently delete "${item.title}"?\\n\\nThis removes the manuscript, original imported file, and saved EPUB/PDF export records from this browser. This cannot be undone. Download a backup first if you want to keep a copy.`
    )) return;
    setDeletingBookId(item.id);
    try {
      await queue.current;
      if (failed.current || blocked.current)
        throw Error("A save failed. Resolve the save error before deleting a book.");
      await deleteBook(item.id);
      setBooks(items => items.filter(b => b.id !== item.id));
      setStatus("Manuscript permanently deleted");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the manuscript.");
    } finally {
      setDeletingBookId(null);
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
    metadata?: PublicationMetadata;
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
  function updateStructure(action: StructureAction) {
    const b = current.current;
    if (!b) return;
    try {
      const result = changeStructure(b, action);
      edit(result.book);
      if (result.selectedId) setChapterId(result.selectedId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Structure update failed.");
      throw e;
    }
  }
  function changePrintAlignment(alignment: "left" | "justify") {
    const b = current.current;
    if (!b) return;
    edit({ ...b, editions: {
      ...b.editions, ebook: getEbookEdition(b),
      print: { ...getPrintEdition(b), alignment },
    } });
  }
  function changeEdition(edition: EbookEdition) {
    const b = current.current;
    if (!b) return;
    const printAlignment = getPrintEdition(b).alignment ?? "left";
    edit({ ...b, editions: {
      ...b.editions, ebook: edition,
      print: printPreset(edition.template.id, printAlignment),
    } });
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
        <div className="topbar-actions">
          <Link className="help-top-link" href="/help/" aria-label="Open help and documentation">Help &amp; Docs</Link>
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
                  <div className="bookshelf-item" key={b.id}>
                    <button
                      className="book-card"
                      onClick={() => open(b)}
                      disabled={deletingBookId === b.id}
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
                    <div className="bookshelf-menu-wrap">
                      <button
                        className="bookshelf-menu-trigger"
                        type="button"
                        aria-label={`Actions for ${b.title}`}
                        aria-expanded={activeBookMenu === b.id}
                        aria-haspopup="menu"
                        disabled={Boolean(deletingBookId)}
                        onClick={() => setActiveBookMenu(activeBookMenu === b.id ? null : b.id)}
                      >⋯</button>
                      {activeBookMenu === b.id ? (
                        <div className="bookshelf-menu" role="menu" aria-label={`Actions for ${b.title}`}>
                          <button type="button" role="menuitem" onClick={() => {setActiveBookMenu(null);open(b);}}>Open manuscript</button>
                          <button type="button" role="menuitem" onClick={() => void bookshelfBackup(b)}>Export backup</button>
                          <button type="button" role="menuitem" className="bookshelf-delete" onClick={() => void bookshelfDelete(b)}>Delete manuscript</button>
                        </div>
                      ) : null}
                    </div>
                  </div>
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
              <button onClick={() => setMode("print")}>Print PDF proof</button>
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
                <button aria-pressed={mode === "structure"} onClick={() => setMode("structure")}>
                  Structure
                </button>
                <button
                  aria-pressed={mode === "design"}
                  onClick={() => setMode("design")}
                >
                  Design
                </button>
                <button aria-pressed={mode === "details"} onClick={() => setMode("details")}>
                  Details
                </button>
                <button
                  aria-pressed={mode === "publish"}
                  onClick={() => setMode("publish")}
                >
                  Publish
                </button>
                <button
                  aria-pressed={mode === "print"}
                  onClick={() => setMode("print")}
                >
                  Print
                </button>
              </div>
              <div className="workspace-save">
                <span>{getEbookEdition(book).template.id.replace(/^./, (c) => c.toUpperCase())} · ebook edition</span>
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
                {findOpen?<FindReplacePanel book={book} chapterId={chapterId} config={findConfig} onConfig={setFindConfig} onClose={()=>setFindOpen(false)} onNavigate={navigateMatch}
                  onReplace={applyReplacements} onUndo={()=>swapReplacement(true)} onRedo={()=>swapReplacement(false)}
                  canUndo={!!replacementHistory&&!replacementUndone} canRedo={!!replacementHistory&&replacementUndone}/>:null}

                <div className="editor-meta">
                  <span>MANUSCRIPT / {chapter?.title}</span>
                  <button type="button" onClick={()=>setFindOpen(v=>!v)} aria-label="Find and replace manuscript">Find & Replace</button>
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
                      key={`${book.id}-${chapter.id}-${editorVersion}`}
                      search={findOpen?{query:findConfig.query,options:{caseSensitive:findConfig.caseSensitive,wholeWord:findConfig.wholeWord}}:undefined}
                      focusMatch={findFocus}
                      content={chapter.content}
                      onChange={(content) => {
                        setReplacementHistory(null);setReplacementUndone(false);
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
              {mode === "structure" ? (
                <StructurePanel
                  book={book}
                  selectedId={chapterId}
                  onAction={updateStructure}
                  onEdit={(id) => { setChapterId(id); setMode("manuscript"); }}
                />
              ) : null}
              <DesignPanel
                hidden={mode !== "design"}
                cover={book.cover}
                onCoverChange={cover=>{const b=current.current;if(b)edit({...b,cover});}}
                edition={getEbookEdition(book)}
                onChange={changeEdition}
              />
              {mode === "details" ? <BookDetailsPanel book={book} onSave={updateMetadata}/> : null}
              {mode === "publish" ? (
                <PublishPanel
                  book={book}
                  getSnapshot={exportSnapshot}
                  onMetadata={updateMetadata}
                />
              ) : null}
              {mode === "print" ? (
                <PrintPanel
                  book={book}
                  getSnapshot={exportSnapshot}
                  onPublish={() => setMode("publish")}
                  onAlignmentChange={changePrintAlignment}
                />
              ) : null}
              <EbookPreview
                hidden={mode === "publish" || mode === "print" || mode === "structure" || mode === "details"}
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
