"use client";
import { useState } from "react";
import { SECTION_TYPES, sectionMatter, type Book, type SectionType } from "../lib/model";
import { orderedSections, sectionGroups, type StructureAction } from "../lib/structure";

const labels: Record<SectionType, string> = {
  chapter: "Chapter", prologue: "Prologue", epilogue: "Epilogue", interlude: "Interlude",
  part: "Part", "half-title": "Half title", title: "Title page", copyright: "Copyright",
  dedication: "Dedication", epigraph: "Epigraph", toc: "Table of contents", preface: "Preface",
  "about-author": "About the Author", "also-by": "Also By", notes: "Notes",
  acknowledgments: "Acknowledgments", custom: "Custom section",
};
export default function StructurePanel({
  book, selectedId, onAction, onEdit,
}: {
  book: Book;
  selectedId: string;
  onAction: (action: StructureAction) => void;
  onEdit: (id: string) => void;
}) {
  const [type, setType] = useState<SectionType>("chapter");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const groups = sectionGroups(book);
  const ordered = orderedSections(book);
  const dispatch = (action: StructureAction) => {
    try { onAction(action); setError(""); } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to change structure.");
    }
  };
  return (
    <section className="structure-panel" aria-label="Book structure editor">
      <div className="eyebrow">BOOK STRUCTURE</div>
      <h2>Arrange your book.</h2>
      <p>Move chapters, organize front and back matter, or split and merge sections. Changes save locally and determine the order of EPUB and PDF exports.</p>
      {error ? <p className="alert" role="alert">{error}</p> : null}
      <form className="structure-add" onSubmit={e => {
        e.preventDefault();
        if (!title.trim()) { setError("Enter a title for the new section."); return; }
        dispatch({ kind: "add", title: title.trim(), sectionType: type });
        setTitle("");
      }}>
        <label>New section type
          <select value={type} onChange={e => setType(e.target.value as SectionType)}>
            {SECTION_TYPES.map(t => <option key={t} value={t}>{labels[t]}</option>)}
          </select>
        </label>
        <label>Section title
          <input value={title} maxLength={200} placeholder="e.g. Prologue" onChange={e => setTitle(e.target.value)} />
        </label>
        <button className="primary" type="submit">+ Add section</button>
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
                <div className="structure-item-actions">
                  <button type="button" disabled={positionInGroup === 0} onClick={() => dispatch({kind:"move",id:section.id,to:index-1})}>↑ Up</button>
                  <button type="button" disabled={positionInGroup === groups[matter].length - 1} onClick={() => dispatch({kind:"move",id:section.id,to:index+1})}>↓ Down</button>
                  <button type="button" onClick={() => dispatch({kind:"add",sectionType:section.sectionType ?? "chapter",title:"New section",after:section.id})}>+ After</button>
                  <button type="button" disabled={blocks.length < 2} onClick={() => {
                    const answer = window.prompt(`Split after which paragraph/block? (1–${blocks.length-1})`, String(Math.floor(blocks.length/2)));
                    if (answer !== null) dispatch({kind:"split",id:section.id,blockIndex:Number(answer),title:`${section.title} (continued)`});
                  }}>Split…</button>
                  <button type="button" disabled={index === ordered.length-1} onClick={() => {
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
      <p className="control-note">Sections are numbered continuously from Front Matter through Body Matter to Back Matter. Drag within a group or use Up/Down; to change groups, change the section type. Section IDs remain stable when renamed or reordered. Splitting occurs between text blocks, not within a paragraph. The EPUB navigation follows the book order.</p>
    </section>
  );
}
