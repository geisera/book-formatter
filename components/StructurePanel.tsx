"use client";
import { useState } from "react";
import { SECTION_TYPES, sectionMatter, showSectionTitle, getSectionLayout, type Book, type SectionType } from "../lib/model";
import { orderedSections, sectionGroups, type StructureAction } from "../lib/structure";

const labels: Record<SectionType, string> = {
  chapter: "Chapter", prologue: "Prologue", epilogue: "Epilogue", interlude: "Interlude",
  part: "Part", "half-title": "Half title", title: "Title page", copyright: "Copyright",
  dedication: "Dedication", epigraph: "Epigraph", toc: "Table of contents", preface: "Preface",
  "about-author": "About the Author", "also-by": "Also By", notes: "Notes",
  acknowledgments: "Acknowledgments", custom: "Custom section",
};
/** Purpose and placement guidance for each available section type. */
const sectionDescriptions: Record<SectionType, string> = {
  chapter: "A numbered or titled installment of the main story. Chapter heading appearance is set in Design.",
  prologue: "An opening scene or introduction that precedes the main chapters.",
  epilogue: "A closing scene or reflection following the main story.",
  interlude: "A brief passage between chapters, often from another viewpoint or time.",
  part: "A major division grouping multiple chapters, with a prominent opening page.",
  "half-title": "A simple preliminary page displaying only the book title.",
  title: "A formal title page for the book title, subtitle, author, and publisher.",
  copyright: "Publication rights and edition details, such as copyright notices and ISBN.",
  dedication: "A short personal dedication, typically centered on its own page.",
  epigraph: "A quotation or excerpt placed before the book or a major division.",
  toc: "An automatically generated table of contents linking to book sections.",
  preface: "An introductory note from the author about the work or its background.",
  "about-author": "A short author biography, usually placed after the main text.",
  "also-by": "A list of other works by the author.",
  notes: "Explanatory, research, or reference notes for the reader.",
  acknowledgments: "Thanks and recognition for people who contributed to the work.",
  custom: "A section for material that does not fit a standard book section type.",
};
export default function StructurePanel({
  book, selectedId, onAction, onEdit, onPreviewPrint,
}: {
  book: Book;
  selectedId: string;
  onAction: (action: StructureAction) => void;
  onEdit: (id: string) => void;
  onPreviewPrint: () => void;
}) {
  const [type, setType] = useState<SectionType>("chapter");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [layoutNotice, setLayoutNotice] = useState(false);
  const groups = sectionGroups(book);
  const ordered = orderedSections(book);
  const dispatch = (action: StructureAction) => {
    try { onAction(action); setError(""); if (action.kind === "layout" || action.kind === "reset-layout" || action.kind === "visibility") setLayoutNotice(true); } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change structure.");
    }
  };
  return (
    <section className="structure-panel" aria-label="Book structure editor">
      <div className="eyebrow">BOOK STRUCTURE</div>
      <h2>Arrange your book.</h2>
      <p>Move chapters, organize front and back matter, or split and merge sections. Changes save locally and determine the order of EPUB and PDF exports.</p>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      {layoutNotice ? <div className="publish-notice" role="status"><p>Section settings saved locally. They affect a newly generated paperback PDF, not this editing screen. Open Print and rebuild the PDF to see the result.</p><button type="button" onClick={onPreviewPrint}>Go to Print</button></div> : null}
      <form className="structure-add" onSubmit={e => {
        e.preventDefault();
        if (!title.trim()) { setError("Enter a title for the new section."); return; }
        dispatch({ kind: "add", title: title.trim(), sectionType: type });
        setTitle("");
      }}>
        <label>New section type
          <select aria-label="New section type" aria-describedby="new-section-type-description" value={type} onChange={e => setType(e.target.value as SectionType)}>
            {SECTION_TYPES.map(t => <option key={t} value={t}>{labels[t]}</option>)}
          </select>
        </label>
        <label>Section title
          <input value={title} maxLength={200} placeholder="e.g. Prologue" onChange={e => setTitle(e.target.value)} />
        </label>
        <button className="primary" type="submit">+ Add section</button>
        <div id="new-section-type-description" className="structure-add-description" aria-live="polite">{sectionDescriptions[type]}</div>
      </form>
      {(["front", "body", "back"] as const).map(matter => (
        <div className="structure-group" key={matter}>
          <h3>{matter === "front" ? "Front matter" : matter === "body" ? "Body matter" : "Back matter"} <small>{groups[matter].length}</small></h3>
          {groups[matter].length === 0 ? <p className="muted">No sections yet.</p> : null}
          <ol>
            {groups[matter].map(section => {
              const index = ordered.findIndex(c => c.id === section.id);
              const positionInGroup = groups[matter].findIndex(c => c.id === section.id);
              const blocks = (section.content.content as unknown[] | undefined) ?? [];
              const layout = getSectionLayout(section);
              return <li className={selectedId === section.id ? "structure-item active" : "structure-item"}
                key={section.id} draggable onDragStart={e => { setDragId(section.id); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={e => e.preventDefault()} onDrop={e => {
                  e.preventDefault();
                  if (dragId && dragId !== section.id) dispatch({ kind: "move", id: dragId, to: index });
                  setDragId(null);
                }} onDragEnd={() => setDragId(null)}>
                <div className="structure-item-heading">
                  <span aria-hidden="true" title="Drag to reorder">⠿</span>
                  <strong>{index + 1}. {section.title}</strong>
                  <button onClick={() => onEdit(section.id)} type="button">Edit text</button>
                </div>
                <div className="structure-item-fields">
                  <label>Title
                    <input aria-label={`Title of ${section.title}`} key={section.id + section.title}
                      defaultValue={section.title} maxLength={200}
                      onBlur={e => { if (e.target.value !== section.title) dispatch({ kind: "rename", id: section.id, title: e.target.value }); }}
                      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} />
                  </label>
                  <label>Type
                    <select aria-label={`Type of ${section.title}`} value={section.sectionType ?? "chapter"}
                      onChange={e => dispatch({ kind: "type", id: section.id, sectionType: e.target.value as SectionType })}>
                      {SECTION_TYPES.map(t => <option key={t} value={t}>{labels[t]}</option>)}
                    </select>
                  </label>
                </div>
                {section.sectionType === "toc" ? (
                  <p className="structure-generated-note">Generated contents: EPUB links and PDF page numbers are built automatically from the current section order. Text typed into this section is not used in the generated contents.</p>
                ) : null}
                {(section.sectionType??"chapter")!=="chapter" ? <label className="structure-title-visibility">
                  <input type="checkbox" aria-label={`Show title on page for ${section.title}`}
                    checked={showSectionTitle(section)}
                    onChange={e => dispatch({kind:"visibility",id:section.id,showTitle:e.target.checked})} />
                  Show section title on page
                </label> : null}
                <details className="structure-page-layout">
                  <summary>Page Layout</summary>
                  <p className="control-note">These controls do not change the manuscript editor. Build a new PDF in Print to see the effect. Page side refers to the physical sheet; headers and folios depend on section and page type. EPUB readers control pagination.</p>
                  <div className="structure-layout-grid">
                    <label>Start page
                      <select aria-label={`Start page for ${section.title}`} value={layout.start}
                        onChange={e=>dispatch({kind:"layout",id:section.id,changes:{start:e.target.value as typeof layout.start}})}>
                        <option value="next">Next page</option>
                        <option value="recto">Right-hand (recto)</option>
                        <option value="verso">Left-hand (verso)</option>
                      </select>
                    </label>
                    <label>Vertical position
                      <select aria-label={`Vertical position for ${section.title}`} value={layout.vertical}
                        onChange={e=>dispatch({kind:"layout",id:section.id,changes:{vertical:e.target.value as typeof layout.vertical}})}>
                        <option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option>
                      </select>
                    </label>
                    <label>Running header
                      <select aria-label={`Running header for ${section.title}`} value={layout.header}
                        onChange={e=>dispatch({kind:"layout",id:section.id,changes:{header:e.target.value as typeof layout.header}})}>
                        <option value="auto">Automatic</option><option value="show">Show</option><option value="hide">Hide</option>
                      </select>
                    </label>
                    <label>Page number
                      <select aria-label={`Page number for ${section.title}`} value={layout.pageNumber}
                        onChange={e=>dispatch({kind:"layout",id:section.id,changes:{pageNumber:e.target.value as typeof layout.pageNumber}})}>
                        <option value="auto">Automatic</option><option value="show">Show</option><option value="hide">Hide</option>
                      </select>
                    </label>
                    <label>Spacing before (pt)
                      <input type="number" min="0" max="120" step="1"
                        aria-label={`Spacing before for ${section.title}`} value={layout.spaceBefore}
                        onChange={e=>dispatch({kind:"layout",id:section.id,changes:{spaceBefore:Number(e.target.value)}})}/>
                    </label>
                    <label>Spacing after (pt)
                      <input type="number" min="0" max="120" step="1"
                        aria-label={`Spacing after for ${section.title}`} value={layout.spaceAfter}
                        onChange={e=>dispatch({kind:"layout",id:section.id,changes:{spaceAfter:Number(e.target.value)}})}/>
                    </label>
                  </div>
                  <button type="button" onClick={() => dispatch({kind:"reset-layout",id:section.id})}>Restore section layout defaults</button>
                  <p>Exact page sides, vertical placement, headers and folios apply to PDF. EPUB uses compatible spacing and page breaks; reading devices control physical pages.</p>
                </details>
                <div className="structure-item-actions">
                  <button type="button" disabled={positionInGroup === 0} onClick={() => dispatch({kind:"move",id:section.id,to:index-1})}>↑ Up</button>
                  <button type="button" disabled={positionInGroup === groups[matter].length - 1} onClick={() => dispatch({kind:"move",id:section.id,to:index+1})}>↓ Down</button>
                  <button type="button" onClick={() => dispatch({kind:"add",sectionType:section.sectionType ?? "chapter",title:"New section",after:section.id})}>+ After</button>
                  <button type="button" disabled={blocks.length < 2} onClick={() => {
                    const answer = window.prompt(`Split after which paragraph/block? (1–${blocks.length-1})`, String(Math.floor(blocks.length/2)));
                    if (answer !== null) dispatch({kind:"split",id:section.id,blockIndex:Number(answer),title:`${section.title} (continued)`});
                  }}>Split…</button>
                  <button type="button" disabled={index === ordered.length-1 || sectionMatter(ordered[index+1].sectionType ?? "chapter") !== matter} onClick={() => {
                    if (window.confirm("Merge this section with the next? The next section title will be removed.")) dispatch({kind:"merge",id:section.id});
                  }}>Merge next</button>
                  <button type="button" disabled={book.chapters.length === 1} onClick={() => {
                    if (window.confirm(`Delete "${section.title}" and all its text? This cannot be undone.`)) dispatch({kind:"delete",id:section.id});
                  }}>Delete</button>
                </div>
                <small>{labels[section.sectionType ?? "chapter"]} · {sectionMatter(section.sectionType ?? "chapter")} · {blocks.length} blocks</small>
              </li>;
            })}
          </ol>
        </div>
      ))}
      <p className="control-note">Sections are numbered continuously from Front Matter through Body Matter to Back Matter. Drag within a group or use Up/Down; to change groups, change the section type. Section IDs remain stable when renamed or reordered. Splitting occurs between text blocks, not within a paragraph. New sections are placed in their selected matter group. Merging is restricted to the same matter group. Use Restore section layout defaults to remove custom page settings. The EPUB navigation follows the book order. Hiding a title affects the rendered page in EPUB and PDF, not the section name in navigation.</p>
    </section>
  );
}
