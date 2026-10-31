"use client";
import { classifyImportedSection, splitImportedSection, mergeImportedSections } from "../lib/import-classify";
import { useEffect, useRef, useState } from "react";
import {
  importedBook,
  splitChapters,
  suggestedSplit,
  blockText,
  type ImportDraft,
  type SplitMode,
} from "../lib/import-model";
import { SECTION_TYPES, schema, type Book, type Chapter, type SectionType } from "../lib/model";
import { saveImportedBook } from "../lib/storage";

export default function ImportPanel({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (book: Book) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    worker = useRef<Worker | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    bytes = useRef<Uint8Array | null>(null),
    request = useRef(0);
  const [splitPositions,setSplitPositions]=useState<Record<string,number>>({}),
    [reviewNotes,setReviewNotes]=useState<Record<string,string>>({}),
    [draft, setDraft] = useState<ImportDraft | null>(null),
    [chapters, setChapters] = useState<Chapter[]>([]),
    [mode, setMode] = useState<SplitMode>("auto"),
    [title, setTitle] = useState(""),
    [author, setAuthor] = useState(""),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [dragSection,setDragSection]=useState<string|null>(null),
    [dropBefore,setDropBefore]=useState<string|null>(null),
    [previewId,setPreviewId]=useState<string|null>(null),
    [stage,setStage]=useState("Preparing file");
  function stop() {
    worker.current?.terminate();
    worker.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    request.current++;
  }
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      stop();
    };
  }, []);
  async function choose(file: File) {
    stop();
    setError("");
    setDraft(null);
    setReviewNotes({});
    setSplitPositions({});
    bytes.current = null;
    if (file.size > 10_000_000) {
      setError("Choose a manuscript smaller than 10 MB.");
      return;
    }
    if (!/\.(docx|md|markdown|txt)$/i.test(file.name)) {
      setError("Choose a .docx, .md, .markdown or .txt file.");
      return;
    }
    setBusy(true);
    setStage("Reading source file");
    const token = request.current;
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      if (token !== request.current) return;
      bytes.current = data;
      setStage("Detecting sections and converting content");
      const parser = new Worker("/import-worker.js");
      worker.current = parser;
      const fail = (message: string) => {
        if (token !== request.current) return;
        stop();
        setBusy(false);
        setError(message);
      };
      timer.current = setTimeout(
        () =>
          fail(
            "Import took too long and was stopped. Your books were not changed. Try splitting the manuscript or saving a simpler DOCX copy.",
          ),
        30_000,
      );
      parser.onerror = () =>
        fail(
          "The local importer could not start. Reopen the app online once to cache its files, then try again.",
        );
      parser.onmessage = (
        event: MessageEvent<{
          ok: boolean;
          draft?: ImportDraft;
          error?: string;
        }>,
      ) => {
        if (token !== request.current) return;
        if (!event.data.ok || !event.data.draft) {
          fail(
            event.data.error ?? "Import failed. Your books were not changed.",
          );
          return;
        }
        const imported = event.data.draft;
        stop();
        setStage("Review ready");
        setDraft(imported);
        setMode("auto");
        setChapters(splitChapters(imported, "auto"));
        setReviewNotes({});
        setSplitPositions({});
        setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "));
        setBusy(false);
      };
      parser.postMessage({ bytes: data, filename: file.name });
    } catch (e) {
      if (token !== request.current) return;
      stop();
      setBusy(false);
      setError(
        e instanceof Error ? e.message : "The selected file could not be read.",
      );
    }
  }
  async function commit() {
    if (!draft || !bytes.current) return;
    setSaving(true);
    setStage("Saving local project");
    setError("");
    try {
      const project = importedBook(
        draft,
        chapters,
        title,
        author,
        bytes.current,
      );
      const book = await saveImportedBook(project.book, project.source);
      onImported(book);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Import could not be saved. Your existing books were not changed.",
      );
      setSaving(false);
    }
  }
  function resplit(nextMode:SplitMode) {
    if (!draft) return;
    setMode(nextMode);
    setChapters(splitChapters(draft,nextMode));
    setReviewNotes({});
    setSplitPositions({});
  }
  function changeType(id:string,sectionType:SectionType) {
    setChapters(items=>items.map(c=>c.id===id?{...c,sectionType}:c));
    setReviewNotes(current=>({...current,[id]:"Author selected this section type."}));
  }
  function reorderSection(id:string,before?:string) {
    setChapters(items=>{
      const source=items.find(c=>c.id===id);
      if(!source||before===id)return items;
      const without=items.filter(c=>c.id!==id);
      const destination=before?without.findIndex(c=>c.id===before):without.length;
      if(destination<0)return items;
      without.splice(destination,0,source);
      return without;
    });
    setDropBefore(null);setDragSection(null);
  }
  function moveSection(index:number,offset:number) {
    setChapters(items=>{
      const target=index+offset;
      if(target<0||target>=items.length)return items;
      const copy=[...items];
      [copy[index],copy[target]]=[copy[target],copy[index]];
      return copy;
    });
  }
  function divideSection(index:number) {
    const c=chapters[index];
    try {
      const [first,second]=splitImportedSection(c,splitPositions[c.id]??1);
      setChapters(items=>[...items.slice(0,index),first,second,...items.slice(index+1)]);
      setReviewNotes(current=>({...current,[second.id]:"Split from previous section; review its title and classification."}));
      setError("");
    } catch(e) { setError(e instanceof Error?e.message:"Unable to split section."); }
  }
  function joinSections(index:number) {
    if(index+1>=chapters.length)return;
    try {
      const merged=mergeImportedSections(chapters[index],chapters[index+1]);
      setChapters(items=>[...items.slice(0,index),merged,...items.slice(index+2)]);
      setError("");
    } catch(e) { setError(e instanceof Error?e.message:"Unable to merge sections."); }
  }
  const typeLabel=(type:SectionType):string=>{
    const special:Partial<Record<SectionType,string>>={toc:"Table of contents","half-title":"Half title",title:"Title page","about-author":"About the Author","also-by":"Also By",praise:"Praise / Blurbs"};
    return special[type]??type.split("-").map(word=>word[0].toUpperCase()+word.slice(1)).join(" ");
  };
  const words =
    draft?.blocks.reduce(
      (n, b) => n + (blockText(b).match(/\S+/g)?.length ?? 0),
      0,
    ) ?? 0;
  return (
    <dialog
      ref={dialog}
      className="import-dialog"
      aria-labelledby="import-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) onClose();
      }}
    >
      <div className="import-heading">
        <div>
          <div className="eyebrow">LOCAL MANUSCRIPT IMPORT</div>
          <h2 id="import-title">Bring your story in.</h2>
        </div>
        <button aria-label="Close import" disabled={saving} onClick={onClose}>
          ×
        </button>
      </div>
      <p className="import-intro">
        Your file stays on this device. Import creates a separate book and
        retains the original file.
      </p>
      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}
      {!draft ? (
        <>
          <label className="file-drop">
            Choose a manuscript
            <span>DOCX, Markdown or plain text · up to 10 MB</span>
            <input
              aria-label="Manuscript file"
              type="file"
              accept=".docx,.md,.markdown,.txt"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void choose(f);
                e.target.value = "";
              }}
            />
          </label>
          {busy ? (
            <div className="import-progress" role="status">
              {stage}…{" "}<progress aria-label="Import progress" />{" "}
              <button
                onClick={() => {
                  stop();
                  setBusy(false);
                  bytes.current = null;
                }}
              >
                Cancel import
              </button>
            </div>
          ) : (
            <p className="muted">
              Headings, paragraphs, bold, italic and scene breaks are supported.
              Review conversion warnings before saving.
            </p>
          )}
        </>
      ) : (
        <>
          <div className="import-summary">
            <strong>{draft.filename}</strong>
            <span>
              {words.toLocaleString()} words · {chapters.length} sections
            </span>
          </div>
          <div className="import-fields">
            <label>
              Imported book title
              <input
                value={title}
                maxLength={200}
                required
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label>
              Imported author name
              <input
                value={author}
                maxLength={200}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </label>
          </div>
          <label>
            Chapter boundaries
            <select
              value={mode}
              onChange={(e) => {
                resplit(e.target.value as SplitMode);
              }}
            >
              <option value="auto">
                Automatic (
                {suggestedSplit(draft) === "none"
                  ? "one section"
                  : suggestedSplit(draft).toUpperCase() + " headings"}
                )
              </option>
              <option value="h1">Heading 1</option>
              <option value="h2">Heading 2</option>
              <option value="none">Keep as one section</option>
            </select>
          </label>
          <p className="muted">
            Local rules recognize conventional headings and classify sections automatically. Review low-confidence types, change titles or types, adjust boundaries, and reorder sections before saving. Changing the boundary mode restarts this review.
          </p>
          <section className="import-report" aria-label="Import diagnostics">
            <h3>Conversion review</h3>
            {draft.diagnostics.length ? (
              <ul>
                {draft.diagnostics.map((d, i) => (
                  <li key={i}>
                    <span className={`diagnostic-${d.severity}`}>
                      {d.severity === "warning" ? "Review" : "Info"}
                    </span>{" "}
                    {d.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                No conversion warnings detected. Check section titles and your
                manuscript after import.
              </p>
            )}
          </section>
          <div className="import-review-progress" role="status">Review step 2 of 3 · {chapters.length} sections detected. Adjust their order, type, and boundaries before saving.</div>
          <div className="section-review" aria-label="Detected sections">
            {chapters.map((c, index) => {
              const guess=classifyImportedSection(c.title,index,chapters.length,title);
              const blocks=(c.content.content as {type:string;content?:{text?:string}[]}[] | undefined)??[];
              const type=c.sectionType??"chapter";
              const overridden=!!reviewNotes[c.id] || type!==guess.type;
              return <div className={`section-row${dropBefore===c.id?" import-drop-before":""}`} key={c.id}
                onDragOver={e=>{if(dragSection){e.preventDefault();setDropBefore(c.id);}}}
                onDrop={e=>{e.preventDefault();if(dragSection)reorderSection(dragSection,c.id);}}
              >
                <span className="import-drag-handle" draggable title="Drag to reorder section" aria-label={`Drag section ${index+1}`}
                  onDragStart={e=>{setDragSection(c.id);e.dataTransfer.setData("text/plain",c.id);e.dataTransfer.effectAllowed="move";}}
                  onDragEnd={()=>{setDragSection(null);setDropBefore(null);}}>⠿</span>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div className="import-review-main">
                  <div className="import-review-fields">
                    <label>Section {index + 1} title
                      <input value={c.title} maxLength={200} onChange={e=>setChapters(items=>items.map(x=>x.id===c.id?{...x,title:e.target.value}:x))}/>
                    </label>
                    <label>Section {index + 1} type
                      <select aria-label={`Section ${index+1} type`} value={type} onChange={e=>changeType(c.id,e.target.value as SectionType)}>
                        {SECTION_TYPES.map(t=><option key={t} value={t}>{typeLabel(t)}</option>)}
                      </select>
                    </label>
                  </div>
                  <p className="import-classification" aria-label={`Section ${index+1} classification`}>
                    <strong title={guess.reason}>{overridden?"Review / edited":guess.confidence==="high"?"High confidence":guess.confidence==="medium"?"Medium confidence":"Low confidence · review"}</strong>
                    <span className="import-confidence-help" title="Confidence is a rule-based suggestion from section headings, not an AI judgment. Check the title and section type before importing." aria-label="About section confidence">ⓘ</span>
                    {" · "}{reviewNotes[c.id]??(type!==guess.type?"Section type differs from the detected suggestion.":guess.reason)}
                  </p>
                  <small>{blocks.map(n=>n.content?.map(x=>x.text??"").join("")??"").join(" ").slice(0,140)||"Heading-only section or no body text"}</small>
                  <button type="button" className="import-preview-toggle" aria-expanded={previewId===c.id} onClick={()=>setPreviewId(previewId===c.id?null:c.id)}>{previewId===c.id?"Hide comparison":"Compare source and imported text"}</button>
                  {previewId===c.id?<div className="import-side-by-side" aria-label={`Section ${index+1} before and after preview`}>
                    <div><strong>Source document · original extracted text</strong><pre>{draft.blocks.map(blockText).join("\n").slice(0,3000)}</pre></div>
                    <div><strong>Imported section · resulting text</strong><pre>{schema.nodeFromJSON(c.content).textContent.slice(0,3000)}</pre></div>
                  </div>:null}
                  <div className="import-review-actions">
                    <span className="import-boundary-label" title="Each listed section becomes a separate book section">Section boundary {index+1}</span>
                    <button type="button" disabled={index===0} onClick={()=>moveSection(index,-1)} aria-label={`Move section ${index+1} up`}>↑ Up</button>
                    <button type="button" disabled={index===chapters.length-1} onClick={()=>moveSection(index,1)} aria-label={`Move section ${index+1} down`}>↓ Down</button>
                    {blocks.length>1 ? <>
                      <label>Split before block
                        <select aria-label={`Split section ${index+1} before block`} value={splitPositions[c.id]??1} onChange={e=>setSplitPositions(old=>({...old,[c.id]:Number(e.target.value)}))}>
                          {blocks.slice(1).map((b,i)=><option key={i+1} value={i+1}>{i+2}. {(b.content?.map(x=>x.text??"").join("")??b.type).slice(0,55)||b.type}</option>)}
                        </select>
                      </label>
                      <button type="button" onClick={()=>divideSection(index)} aria-label={`Split section ${index+1}`}>Split</button>
                    </> : null}
                    <button type="button" disabled={index===chapters.length-1} onClick={()=>joinSections(index)} aria-label={`Merge section ${index+1} with next`}>Merge with next</button>
                  </div>
                </div>
              </div>;
            })}
            {dragSection?<div className="import-drop-last" onDragOver={e=>{e.preventDefault();setDropBefore(null);}} onDrop={e=>{e.preventDefault();reorderSection(dragSection);}}>Drop here to move to end</div>:null}
          </div>
          <div className="import-actions">
            <button
              disabled={saving}
              onClick={() => {
                setDraft(null);
                bytes.current = null;
              }}
            >
              Choose another file
            </button>
            <button
              className="primary"
              disabled={saving || !title.trim() || !chapters.length}
              onClick={commit}
            >
              {saving ? "Step 3 of 3 · Saving locally…" : "Step 3 of 3 · Import as new book"}
            </button>
          </div>
        </>
      )}
    </dialog>
  );
}
