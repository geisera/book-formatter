"use client";
import { useEffect, useRef, useState, useDeferredValue, type CSSProperties } from "react";
import Link from "next/link";
import Editor from "./Editor";
import {sectionIsEmpty,sectionTemplateContent} from "../lib/section-samples";
import FindReplacePanel,{type SearchConfig} from "./FindReplacePanel";
import {findInBook,replaceAcrossBook,type TextMatch} from "../lib/find-replace";
import ImportPanel from "./ImportPanel";
import DesignPanel from "./DesignPanel";
import DesignPrintPreview from "./DesignPrintPreview";
import BookDetailsPanel from "./BookDetailsPanel";
import type {PublicationMetadata} from "../lib/publication-metadata";
import EbookPreview from "./EbookPreview";
import PublishPanel from "./PublishPanel";
import PrintPanel from "./PrintPanel";
import StructurePanel from "./StructurePanel";
import { changeStructure, type StructureAction } from "../lib/structure";
import { getEbookEdition, type EbookEdition } from "../lib/edition";
import { getPrintEdition, printPreset, type PrintTrim } from "../lib/print-profile";
import { blankChapter, createBook, sectionMatter, type Book } from "../lib/model";
import { romanNumeral } from "../lib/chapter-numbering";
import { db, saveBook, saveImportedBook, deleteBook } from "../lib/storage";
import { backupBook, restoreProject } from "../lib/backup";
import { preflight } from "../lib/epub";
import { schema } from "../lib/model";
/** UI-only section labels; never modifies manuscript content. */
function manuscriptSectionLabel(book: Book, section: Book["chapters"][number]): string {
  const type=section.sectionType??"chapter";
  const matter=sectionMatter(type);
  const label=type.replaceAll("-"," ").toUpperCase();
  if(matter==="front")return `FRONT MATTER · ${label}`;
  if(matter==="back")return `BACK MATTER · ${label}`;
  const index=book.chapters.findIndex(c=>c.id===section.id);
  if(type==="chapter"){
    const n=book.chapters.slice(0,index+1).filter(c=>(c.sectionType??"chapter")==="chapter"&&sectionMatter(c.sectionType??"chapter")==="body").length;
    return `CHAPTER ${n}`;
  }
  if(type==="part"){
    const n=book.chapters.slice(0,index+1).filter(c=>c.sectionType==="part").length;
    return `PART ${n<=3999?romanNumeral(n):n}`;
  }
  return label;
}
type BackupMarker={at:number;words:number};
function bookWords(book:Book):number {
  return book.chapters.reduce((sum,c)=>sum+(schema.nodeFromJSON(c.content).textContent.match(/\S+/g)?.length??0),0);
}
function backupKey(id:string){return `book-formatter:backup:${id}`;}
function backupMarker(id:string):BackupMarker|null{
  try{const value=localStorage.getItem(backupKey(id));if(!value)return null;const parsed=JSON.parse(value) as BackupMarker;return typeof parsed.at==="number"&&typeof parsed.words==="number"?parsed:null;}catch{return null;}
}
function backupLabel(id:string):string{
  const marker=backupMarker(id);
  if(!marker)return "Never backed up";
  const days=Math.floor((Date.now()-marker.at)/86400000);
  return days<1?"Last backup: today":days===1?"Last backup: yesterday":`Last backup: ${days} days ago`;
}
export default function Workspace() {
  const [designPreview,setDesignPreview]=useState<"ebook"|"print">("ebook");
  const [inspectorTab,setInspectorTab]=useState<"preview"|"formatting">("preview");
  const [publishFormat,setPublishFormat]=useState<"ebook"|"print">("ebook");
  const [previewWidth,setPreviewWidth]=useState(44);
  const [previewVisible,setPreviewVisible]=useState(true);
  const [readinessOpen,setReadinessOpen]=useState(false);
  const [backupRefresh,setBackupRefresh]=useState(0);
  const [backupSnooze,setBackupSnooze]=useState<string|null>(null);
  const [backupPrompt,setBackupPrompt]=useState(false);
  const [dontAskBackup,setDontAskBackup]=useState(false);
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
          // An active worker is not necessarily controlling this first tab yet.
          // Offline mode is only safe after the controlling worker is attached.
          if (!navigator.serviceWorker.controller) {
            await new Promise<void>((resolve, reject) => {
              const timeout = window.setTimeout(() => {
                navigator.serviceWorker.removeEventListener("controllerchange", changed);
                reject(Error("Offline worker did not take control."));
              }, 15000);
              function changed() {
                if (!navigator.serviceWorker.controller) return;
                window.clearTimeout(timeout);
                navigator.serviceWorker.removeEventListener("controllerchange", changed);
                resolve();
              }
              navigator.serviceWorker.addEventListener("controllerchange", changed);
              changed();
            });
          }
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
      localStorage.setItem(backupKey(snapshot.id),JSON.stringify({at:Date.now(),words:bookWords(snapshot)}));
      setBackupRefresh(v=>v+1);setBackupSnooze(null);setBackupPrompt(false);
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
      localStorage.setItem(backupKey(item.id),JSON.stringify({at:Date.now(),words:bookWords(item)}));
      setBackupRefresh(v=>v+1);
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
  useEffect(()=>{
    if(!book)return;
    const key=`book-formatter:backup-first-seen:${book.id}`;
    if(!localStorage.getItem(key)){localStorage.setItem(key,String(Date.now()));setBackupRefresh(v=>v+1);}
  },[book?.id]);
  const backupBaseline=book?backupMarker(book.id):null;
  const backupWordDelta=book?bookWords(book)-(backupBaseline?.words??0):0;
  const backupFirstSeen=book?(Number(globalThis.window?.localStorage.getItem(`book-formatter:backup-first-seen:${book.id}`)??Date.now())):Date.now();
  const backupAgeDays=(Date.now()-(backupBaseline?.at??backupFirstSeen))/86400000;
  const backupDue=!!book&&(backupAgeDays>=7||backupWordDelta>=500);
  const backupSnoozed=!!book&&backupSnooze===book.id;
  const readinessIssues=book?preflight(book,publishFormat):[];
  const blockingIssues=readinessIssues.filter(issue=>issue.severity==="error");
  function fixReadinessIssue(location:string,message:string){
    setReadinessOpen(false);
    const match=/^Section (\d+):/.exec(location);
    if(match&&book){
      const target=book.chapters[Number(match[1])-1];
      if(target){setChapterId(target.id);setMode("manuscript");setInspectorTab(message.includes("visible section heading")?"formatting":"preview");setPreviewVisible(true);}
      return;
    }
    if(location==="Book details"){
      setMode("details");
      const selector=message.includes("author")?'input[aria-label="Author"]':message.includes("language")?'input[aria-label="Language tag"]':'input[aria-label="Publication title"]';
      requestAnimationFrame(()=>requestAnimationFrame(()=>{document.querySelector<HTMLInputElement>(selector)?.focus();}));
    }else if(location==="Book cover"){
      setMode("manuscript");setInspectorTab("formatting");setPreviewVisible(true);
    }else if(location==="Imported manuscript"){
      setMode("structure");
    }else{
      setMode("publish");
    }
  }

  function onExportSuccess(){
    const b=current.current;
    if(!b)return;
    const key=`book-formatter:export-backup-asked:${b.id}`;
    if(localStorage.getItem(key)||localStorage.getItem(`book-formatter:export-backup-dismiss:${b.id}`))return;
    localStorage.setItem(key,"1");
    setBackupPrompt(true);
  }
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
  function changePrintTypography(changes: Partial<Pick<ReturnType<typeof getPrintEdition>, "fontSize" | "leading" | "paragraphSpacing" | "firstLineIndent" | "chapterOpeningSpace" | "chapterNumberStyle" | "showChapterTitle" | "frontMatterTitleScale" | "layoutPriority" | "hyphenate" | "hyphenationLanguage" | "maxConsecutiveHyphens" | "hyphenationExceptions">>) {
    const b=current.current;if(!b)return;
    const existing=getPrintEdition(b);
    edit({...b,editions:{...b.editions,ebook:getEbookEdition(b),print:{...existing,...changes}}});
  }
  function changePrintTrim(trim: PrintTrim) {
    const b=current.current;if(!b)return;
    edit({...b,editions:{...b.editions,ebook:getEbookEdition(b),print:{...getPrintEdition(b),trim}}});
  }
  function changeEdition(edition: EbookEdition) {
    const b = current.current;
    if (!b) return;
    const priorPrint = getPrintEdition(b);
    const printAlignment = priorPrint.alignment ?? "left";
    edit({ ...b, editions: {
      ...b.editions, ebook: edition,
      print: { ...printPreset(edition.template.id, printAlignment, priorPrint.trim), fontSize:priorPrint.fontSize,leading:priorPrint.leading,paragraphSpacing:priorPrint.paragraphSpacing,firstLineIndent:priorPrint.firstLineIndent,chapterOpeningSpace:priorPrint.chapterOpeningSpace,chapterNumberStyle:priorPrint.chapterNumberStyle,showChapterTitle:priorPrint.showChapterTitle,frontMatterTitleScale:priorPrint.frontMatterTitleScale,layoutPriority:priorPrint.layoutPriority,hyphenate:priorPrint.hyphenate,hyphenationLanguage:priorPrint.hyphenationLanguage,maxConsecutiveHyphens:priorPrint.maxConsecutiveHyphens,hyphenationExceptions:priorPrint.hyphenationExceptions },
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
          <div className="eyebrow">YOUR LOCAL BOOKSHELF</div>
          <h1>
            Your bookshelf
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
                        <small className="backup-time">{backupLabel(b.id)}</small>
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
                  <p>Create a new book or import a manuscript to get started.</p>
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
            <div className="workspace-book-info"><div className="workspace-book-kicker">CURRENT BOOK</div><h2>{book.title}</h2><p className="muted">{book.author||"Author not set"}</p></div>
            <div className="section-navigator" aria-label="Book sections">
              {(["front","body","back"] as const).map(group=><details key={group} open className="section-navigator-group">
                <summary>{group==="front"?"Front Matter":group==="body"?"Body":"Back Matter"}</summary>
                <div className="chapter-list">{book.chapters.filter(c=>sectionMatter(c.sectionType??"chapter")===group).map(c=><button key={c.id} type="button" className={c.id===chapterId?"selected":""} aria-current={c.id===chapterId?"true":undefined} onClick={()=>setChapterId(c.id)}>
                  <small>{(c.sectionType??"chapter").replaceAll("-"," ")}
                    {readinessIssues.some(issue=>issue.severity==="error"&&issue.location.startsWith(`Section ${book.chapters.indexOf(c)+1}:`))?
                      <span className="section-issue-dot" title="Export validation issue" aria-label="Export validation issue">●</span>:null}
                  </small><span>{c.title}</span>
                </button>)}</div>
              </details>)}
            </div>
            <button className="add" onClick={()=>setMode("structure")}>+ Add or organize sections</button>
            <small className="backup-time sidebar-backup-time">{backupLabel(book.id)}</small>
            <div className="aside-bottom">
              <button onClick={() => {setPublishFormat("print");setMode("publish");}}>Print PDF proof</button>
              <button
                className="export-link"
                onClick={() => {setPublishFormat("ebook");setMode("publish");}}
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
              <div className="workspace-primary-modes">
                <button type="button" aria-pressed={mode==="manuscript"&&inspectorTab==="preview"}
                  onClick={()=>{setMode("manuscript");setInspectorTab("preview");setPreviewVisible(true);}}>Manuscript</button>
                <button type="button" aria-pressed={mode==="structure"}
                  onClick={()=>setMode("structure")}>Structure</button>
                <button type="button" aria-pressed={mode==="manuscript"&&inspectorTab==="formatting"}
                  onClick={()=>{setMode("manuscript");setInspectorTab("formatting");setPreviewVisible(true);}}>Design</button>
                <button type="button" aria-pressed={mode==="details"}
                  onClick={()=>setMode("details")}>Details</button>
                <button type="button" aria-pressed={mode==="publish"||mode==="print"}
                  onClick={()=>setMode("publish")}>Export</button>
              </div>
              <button type="button" className={blockingIssues.length?"readiness-pill has-issues":"readiness-pill is-ready"}
                aria-expanded={readinessOpen} aria-controls="export-readiness-list"
                onClick={()=>setReadinessOpen(v=>!v)}>
                {blockingIssues.length?`${blockingIssues.length} issue${blockingIssues.length===1?"":"s"}`:"Ready to export"}
              </button>
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
            {backupDue&&!backupSnoozed?<div className="backup-nudge" role="status">
              <span>Your changes exist only in this browser. Download a backup.</span>
              <button type="button" onClick={()=>void backup()}>Download</button>
              <button type="button" onClick={()=>setBackupSnooze(book.id)}>Remind me later</button>
            </div>:null}
            {backupPrompt?<div className="backup-nudge export-backup-prompt" role="status">
              <span>Also download a project backup?</span>
              <button type="button" onClick={()=>void backup()}>Download backup</button>
              <label><input type="checkbox" checked={dontAskBackup} onChange={e=>setDontAskBackup(e.target.checked)}/> Don't ask again</label>
              <button type="button" onClick={()=>{if(dontAskBackup)localStorage.setItem(`book-formatter:export-backup-dismiss:${book.id}`,"1");localStorage.setItem(`book-formatter:export-backup-asked:${book.id}`,"1");setBackupPrompt(false);}}>Not now</button>
            </div>:null}
            {readinessOpen?<section id="export-readiness-list" className="workspace-readiness-panel" aria-label="Export validation issues">
              <div className="workspace-readiness-head"><strong>Export checks · {publishFormat==="ebook"?"EPUB":"Paperback PDF"}</strong>
                <button type="button" onClick={()=>setReadinessOpen(false)} aria-label="Close export checks">Close</button></div>
              {readinessIssues.length===0?<p>No issues detected by the local preflight checks. Review your downloaded file before publication.</p>:
                <ul>{readinessIssues.map((issue,i)=><li key={i}>
                  <span className={issue.severity==="error"?"issue-error":"issue-warning"}>{issue.severity==="error"?"Error":"Warning"}</span>
                  <div><strong>{issue.location}</strong><p>{issue.message}</p></div>
                  <button type="button" onClick={()=>fixReadinessIssue(issue.location,issue.message)}>Fix</button>
                </li>)}</ul>}
            </section>:null}
            <div className={`workspace-body mode-${mode}${mode==="manuscript"&&!previewVisible?" preview-hidden":""}${mode==="manuscript"&&inspectorTab==="formatting"?" layout-format":" layout-write"}`} style={mode==="manuscript"?{"--preview-fraction":`${previewWidth}%`} as CSSProperties:undefined}>
              {mode==="manuscript" ? <div className="editor-shared-toolbar" role="group" aria-label="Manuscript and Design layout">
                <button type="button" aria-pressed={inspectorTab==="preview"} onClick={()=>{setInspectorTab("preview");setPreviewVisible(true);}}>Write</button>
                <button type="button" aria-pressed={inspectorTab==="formatting"} onClick={()=>{setInspectorTab("formatting");setPreviewVisible(true);}}>Format</button>
                <span className="editor-shared-toolbar-context">{chapter?.title}</span>
              </div> : null}
              <section className="editor-area" hidden={mode !== "manuscript"}>
                {findOpen?<FindReplacePanel book={book} chapterId={chapterId} config={findConfig} onConfig={setFindConfig} onClose={()=>setFindOpen(false)} onNavigate={navigateMatch}
                  onReplace={applyReplacements} onUndo={()=>swapReplacement(true)} onRedo={()=>swapReplacement(false)}
                  canUndo={!!replacementHistory&&!replacementUndone} canRedo={!!replacementHistory&&replacementUndone}/>:null}

                <div className="editor-meta">
                  <span>MANUSCRIPT</span>
                  <button type="button" onClick={()=>setFindOpen(v=>!v)} aria-label="Find and replace manuscript">Find & Replace</button>
                  <button type="button" onClick={()=>setPreviewVisible(v=>!v)}>{previewVisible?"Hide preview":"Show preview"}</button>
                </div>
                {chapter ? (
                  <article className="paper">
                    <div className="eyebrow">
                      {manuscriptSectionLabel(book,chapter)}
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
                      content={sectionIsEmpty(chapter)?sectionTemplateContent(chapter):chapter.content}
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
              {mode==="manuscript"&&previewVisible ? <div className="editor-work-panels">
                {inspectorTab==="formatting"?<section className="editor-format-panel" aria-label="Design controls">
                  <DesignPanel hidden={false} cover={book.cover} onCoverChange={cover=>{const b=current.current;if(b)edit({...b,cover});}}
                    edition={getEbookEdition(book)} onChange={changeEdition} format={designPreview}
                    printProfile={getPrintEdition(book)} onPrintTrim={changePrintTrim}
                    onPrintAlignment={changePrintAlignment} onPrintTypography={changePrintTypography}
                    book={book} selectedId={chapterId} onSelectSection={setChapterId} onSectionAction={updateStructure}
                    onTypeStyle={(type,style)=>{const b=current.current;if(!b)return;const sectionStyles={...b.sectionStyles};if(style)sectionStyles[type]=style;else delete sectionStyles[type];edit({...b,sectionStyles});}}/>
                </section>:null}
                <aside className="editor-live-proof" aria-label="Live formatted book preview">
                  <div className="workspace-live-preview-head">
                    <strong>Live preview</strong>
                    <div className="design-studio-format" role="group" aria-label="Preview format">
                      <button type="button" aria-pressed={designPreview==="ebook"} onClick={()=>setDesignPreview("ebook")}>Ebook</button>
                      <button type="button" aria-pressed={designPreview==="print"} onClick={()=>setDesignPreview("print")}>Paperback</button>
                    </div>
                    <label>Width <input type="range" aria-label="Preview width" min="30" max="65" value={previewWidth} onChange={e=>setPreviewWidth(Number(e.target.value))}/></label>
                  </div>
                  {designPreview==="ebook" ? <EbookPreview hidden={false} book={book} chapter={previewChapter} chapterId={chapterId} edition={getEbookEdition(book)} onNavigate={setChapterId} updating={previewChapter!==chapter}/> :
                    <DesignPrintPreview book={book} getSnapshot={exportSnapshot} selectedSectionId={chapterId}/>}
                </aside>
              </div>:null}
              {mode === "structure" ? (
                <StructurePanel
                  book={book}
                  selectedId={chapterId}
                  onAction={updateStructure}
                  onEdit={(id) => { setChapterId(id); setMode("manuscript"); }}
                  onPreviewPrint={() => {setPublishFormat("print");setMode("publish");}}
                />
              ) : null}
              {mode === "details" ? <BookDetailsPanel book={book} onSave={updateMetadata}/> : null}
              {mode === "publish" ? <section className="unified-publish">
                <div className="publish-format-switch" role="group" aria-label="Publication format">
                  <div><strong>Export your book</strong><p>Validate, preview, and export an edition.</p></div>
                  <div className="design-studio-format">
                    <button type="button" aria-pressed={publishFormat==="ebook"} onClick={()=>setPublishFormat("ebook")}>EPUB ebook</button>
                    <button type="button" aria-pressed={publishFormat==="print"} onClick={()=>setPublishFormat("print")}>Paperback PDF</button>
                  </div>
                </div>
                {publishFormat==="ebook"
                  ? <PublishPanel book={book} getSnapshot={exportSnapshot} onMetadata={updateMetadata} onExportSuccess={onExportSuccess}/>
                  : <PrintPanel book={book} getSnapshot={exportSnapshot} onPublish={()=>setPublishFormat("ebook")}
                      onAlignmentChange={changePrintAlignment} onTrimChange={changePrintTrim} onExportSuccess={onExportSuccess}/>}
              </section> : null}
              {mode === "print" ? (
                <PrintPanel
                  book={book}
                  getSnapshot={exportSnapshot}
                  onPublish={() => setMode("publish")}
                  onAlignmentChange={changePrintAlignment}
                  onTrimChange={changePrintTrim}
                />
              ) : null}

            </div>
          </div>
        </main>
      )}
    </>
  );
}
