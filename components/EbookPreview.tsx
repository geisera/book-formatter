"use client";
import { chapterNumberLabel, chapterOrdinal } from "../lib/chapter-numbering";
import { sectionMatter } from "../lib/model";
import { openingDesign } from "../lib/front-matter";
import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { Node as ManuscriptNode } from "prosemirror-model";
import { schema, showSectionTitle, type Book, type Chapter } from "../lib/model";
import { BODY_FONTS, type EbookEdition } from "../lib/edition";

function inlineContent(node: ManuscriptNode): ReactNode[] {
  const result: ReactNode[] = [];
  node.forEach((child, _, index) => {
    let content: ReactNode = child.text ?? "";
    for (const mark of child.marks) {
      if (mark.type.name === "strong") content = <strong>{content}</strong>;
      if (mark.type.name === "em") content = <em>{content}</em>;
    }
    result.push(<span key={index}>{content}</span>);
  });
  return result;
}
const ChapterContent = memo(function ChapterContent({
  chapter,
  ornament,
}: {
  chapter: Chapter;
  ornament: EbookEdition["sceneOrnament"];
}) {
  const doc = useMemo(
    () => schema.nodeFromJSON(chapter.content),
    [chapter.content],
  );
  const blocks: ReactNode[] = [];
  let opening = true;
  doc.forEach((node, _, index) => {
    if (node.type.name === "image") {
      blocks.push(<figure key={index} className={`ebook-illustration align-${node.attrs.align}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={node.attrs.src} alt={node.attrs.alt} style={{width:`${node.attrs.width}%`,maxWidth:"100%",height:"auto"}} />
        {node.attrs.caption ? <figcaption>{node.attrs.caption}</figcaption> : null}
      </figure>);
      opening = true;
    } else if (node.type.name === "scene_break") {
      blocks.push(
        <div
          key={index}
          role="separator"
          aria-label="Scene break"
          className={`ebook-scene ornament-${ornament}`}
        >
          <span aria-hidden="true">
            {ornament === "diamonds"
              ? "◆ ◆ ◆"
              : ornament === "asterisks"
                ? "* * *"
                : ""}
          </span>
        </div>,
      );
      opening = true;
    } else if (node.type.name === "heading") {
      blocks.push(
        <h3 key={index} className={`ebook-subheading${node.attrs.align ? ` align-${node.attrs.align}` : ""}`}>
          {inlineContent(node)}
        </h3>,
      );
      opening = true;
    } else {
      blocks.push(
        <p key={index} className={[opening ? "opening-paragraph" : "", node.attrs.align ? `align-${node.attrs.align}` : ""].filter(Boolean).join(" ") || undefined}>
          {inlineContent(node)}
        </p>,
      );
      if (node.textContent.trim()) opening = false;
    }
  });
  return <div className="ebook-prose">{blocks}</div>;
});
export default function EbookPreview({
  book,
  chapter,
  chapterId,
  edition,
  onNavigate,
  updating,
  hidden,
}: {
  book: Book;
  chapter: Chapter | undefined;
  chapterId: string;
  edition: EbookEdition;
  onNavigate: (id: string) => void;
  updating: boolean;
  hidden?: boolean;
}) {
  const [showCover,setShowCover] = useState(false);
  const [width, setWidth] = useState("420"),
    [theme, setTheme] = useState("light"),
    [scale, setScale] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const index = book.chapters.findIndex((c) => c.id === chapterId);
  useEffect(() => {
    if (viewport.current) viewport.current.scrollTop = 0;
  }, [chapterId,showCover]);
  const style = {
    fontFamily: BODY_FONTS[edition.bodyFont],
    fontSize: `${edition.fontSize * scale}px`,
    lineHeight: edition.lineHeight,
    "--paragraph-indent": `${edition.paragraphIndent}em`,
    "--paragraph-spacing": `${edition.paragraphSpacing}em`,
    "--chapter-space": `${edition.chapterSpacing}em`,
    "--front-heading-scale": edition.frontMatterTitleScale??1,
    width: `${width}px`,
  } as CSSProperties;
  return (
    <section
      className="preview-panel"
      aria-label="Ebook preview"
      hidden={hidden}
    >
      <div className="preview-heading">
        <div>
          <div className="eyebrow">LIVE EBOOK PREVIEW</div>
          <h2>A reader’s view.</h2>
        </div>
        <span className="live-indicator" aria-live="polite">
          {updating ? "Updating…" : "● Live"}
        </span>
      </div>
      <div className="reader-controls">
        <label>
          Reading width
          <select
            aria-label="Reading width"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
          >
            <option value="320">Phone · 320 px</option>
            <option value="420">Ereader · 420 px</option>
            <option value="600">Tablet · 600 px</option>
          </select>
        </label>
        <label>
          Preview theme
          <select
            aria-label="Preview theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>
      {book.cover ? <div className="cover-preview-toggle" role="group" aria-label="Preview page">
        <button type="button" aria-pressed={showCover} onClick={()=>setShowCover(true)}>Cover</button>
        <button type="button" aria-pressed={!showCover} onClick={()=>setShowCover(false)}>Chapter</button>
      </div> : null}
      <div className="reader-navigation">
        <label className="preview-chapter-label">
          <span className="sr-only">Preview chapter</span>
          <select
            aria-label="Preview chapter"
            value={chapterId}
            onChange={(e) => {setShowCover(false);onNavigate(e.target.value);}}
          >
            {book.chapters.map((c, i) => (
              <option key={c.id} value={c.id}>
                {i + 1}. {c.title}
              </option>
            ))}
          </select>
        </label>
        <div className="reader-zoom">
          <button
            aria-label="Decrease preview text size"
            disabled={scale <= 0.8}
            onClick={() =>
              setScale((s) => Math.max(0.8, Math.round((s - 0.1) * 10) / 10))
            }
          >
            A−
          </button>
          <button
            aria-label="Reset preview text size"
            onClick={() => setScale(1)}
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            aria-label="Increase preview text size"
            disabled={scale >= 1.4}
            onClick={() =>
              setScale((s) => Math.min(1.4, Math.round((s + 0.1) * 10) / 10))
            }
          >
            A+
          </button>
        </div>
      </div>
      <div className={`reader-viewport theme-${theme}`} ref={viewport}>
        <article
          className={`ebook-page heading-${edition.headingStyle} template-${edition.template.id} opening-${openingDesign(chapter?.sectionType??"chapter",edition.template.id).style}${chapter && sectionMatter(chapter.sectionType??"chapter")==="front"?" front-matter":""}`}
          style={style}
          aria-label="Formatted chapter"
          aria-busy={updating}
        >
          {showCover && book.cover ? <div className="ebook-cover-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={book.cover.src} alt={book.cover.alt}/>
          </div> : <><header className="ebook-chapter-header">
            <p className="ebook-book-title">{book.title}</p>
            <div className="ebook-opening-rule" aria-hidden="true" />
            {chapter && (showSectionTitle(chapter)||chapter.sectionType==="title") ? <>
              {chapterOrdinal(book.chapters,index)!==null && (edition.chapterNumberStyle??"none")!=="none"
                ? ((edition.showChapterTitle??true)
                    ? <span className="ebook-chapter-number">{chapterNumberLabel(edition.chapterNumberStyle??"none",chapterOrdinal(book.chapters,index)!)}</span>
                    : <h2 className="ebook-chapter-number number-only">{chapterNumberLabel(edition.chapterNumberStyle??"none",chapterOrdinal(book.chapters,index)!)}</h2>)
                : null}
              {chapter.sectionType==="title" ? <h2>{book.title}</h2> : openingDesign(chapter.sectionType??"chapter",edition.template.id).suppressHeading ? null : (chapter.sectionType??"chapter")!=="chapter" || (edition.showChapterTitle??true)
                ? <h2>{chapter.title}</h2>
                : null}
            </> : null}
            {chapter?.sectionType==="title" ? <div className="ebook-title-details">
              {book.metadata?.subtitle ? <p className="title-subtitle">{book.metadata.subtitle}</p> : null}
              <p className="title-author">{book.author}</p>
              {book.metadata?.publisher ? <p className="title-publisher">{book.metadata.publisher}</p> : null}
            </div> : null}
            {chapter?.sectionType==="copyright" ? <div className="ebook-copyright-details">
              {book.metadata?.publisher ? <p>Publisher: {book.metadata.publisher}</p> : null}
              {book.metadata?.publicationDate ? <p>Publication date: {book.metadata.publicationDate}</p> : null}
              {book.metadata?.isbn ? <p>ISBN: {book.metadata.isbn}</p> : null}
            </div> : null}
          </header>
          {chapter?.sectionType === "toc" ? (
            <nav aria-label="Generated table of contents" className="ebook-prose">
              <ol>
                {book.chapters.filter(c => c.id !== chapter.id && c.sectionType !== "toc").map(c => (
                  <li key={c.id}><button type="button" onClick={() => onNavigate(c.id)}>{c.title}</button></li>
                ))}
              </ol>
            </nav>
          ) : chapter ? (
            <ChapterContent chapter={chapter} ornament={edition.sceneOrnament} />
          ) : null}</>}
        </article>
      </div>
      <div className="preview-footer">
        <button
          disabled={index <= 0}
          onClick={() => onNavigate(book.chapters[index - 1].id)}
          aria-label="Previous preview chapter"
        >
          ← Previous
        </button>
        <span>
          {index + 1} / {book.chapters.length}
        </span>
        <button
          disabled={index >= book.chapters.length - 1}
          onClick={() => onNavigate(book.chapters[index + 1].id)}
          aria-label="Next preview chapter"
        >
          Next →
        </button>
      </div>
      <p className="preview-note">
        Reflowable preview · width adapts to available space.
        <br />
        Reader controls affect this preview only. Print pagination is not shown.
      </p>
    </section>
  );
}
