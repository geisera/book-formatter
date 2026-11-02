"use client";
import { chapterNumberLabel, chapterOrdinal } from "../lib/chapter-numbering";
import { sectionMatter } from "../lib/model";
import { openingDesign } from "../lib/front-matter";
import {sectionIsEmpty,sampleForSection} from "../lib/section-samples";
import {
  memo,
  useEffect,
  useLayoutEffect,
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
  const bibliography = chapter.sectionType === "bibliography";
  const doc = useMemo(
    () => schema.nodeFromJSON(chapter.content),
    [chapter.content],
  );
  if(sectionIsEmpty(chapter)) return <div className="ebook-prose" aria-label="Example text, not part of manuscript" style={{opacity:.63}}>
    {sampleForSection(chapter).map((block,index)=>block.kind==="heading"
      ? <h3 key={index} style={{textAlign:"center"}}>{block.text}</h3>
      : <p key={index} className={index===0?"opening-paragraph":undefined} style={{
        ...(bibliography?{textIndent:"-1.25em",paddingLeft:"1.25em",marginBottom:".85em",textAlign:"left" as const}:{}),
        fontStyle:block.kind==="quotation"?"italic":undefined,
        fontSize:block.kind==="small"?"0.85em":undefined,
        textAlign:block.kind==="attribution"?"right":block.kind==="quotation"?"center":undefined
      }}>{block.text}</p>)}
    <p style={{fontSize:".75em",fontStyle:"italic",textAlign:"center",marginTop:"1.5em"}}>Sample only — not included in exported books</p>
  </div>;
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
        <p key={index} className={[opening ? "opening-paragraph" : "", node.attrs.align ? `align-${node.attrs.align}` : ""].filter(Boolean).join(" ") || undefined} style={bibliography?{paddingLeft:"1.25em",textIndent:"-1.25em",textAlign:"left",marginBottom:".85em"}:undefined}>
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
  formatControl,
}: {
  book: Book;
  chapter: Chapter | undefined;
  chapterId: string;
  edition: EbookEdition;
  onNavigate: (id: string) => void;
  updating: boolean;
  hidden?: boolean;
  formatControl?: ReactNode;
}) {
  const [showCover,setShowCover] = useState(false);
  const [width, setWidth] = useState("420"),
    [theme, setTheme] = useState("light"),
    [scale, setScale] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const pageWindow = useRef<HTMLDivElement>(null);
  const pageFlow = useRef<HTMLDivElement>(null);
  const previousChapterEnd = useRef<string | null>(null);
  const swipeStart = useRef<{x:number;y:number} | null>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [pageWidth, setPageWidth] = useState(1);
  const index = book.chapters.findIndex((c) => c.id === chapterId);
  useEffect(() => {
    setPage(0);
  }, [chapterId, showCover]);
  useLayoutEffect(() => {
    const frame = pageWindow.current, flow = pageFlow.current;
    if (!frame || !flow || hidden || updating || chapter?.id !== chapterId) return;
    let active = true;
    let request = 0;
    const measure = () => {
      if (!active || frame.clientWidth === 0) return;
      const size = frame.clientWidth;
      flow.style.columnWidth = `${size}px`;
      const count = showCover ? 1 : Math.max(1, Math.round((flow.scrollWidth + 40) / (size + 40)));
      setPageWidth(size);
      setPageCount(count);
      if (previousChapterEnd.current === chapterId) {
        setPage(count - 1);
        previousChapterEnd.current = null;
      } else {
        setPage(p => Math.min(p, count - 1));
      }
    };
    const schedule = () => {
      if (!active) return;
      cancelAnimationFrame(request);
      request = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(frame);
    flow.addEventListener("load", schedule, true);
    document.fonts.addEventListener("loadingdone", schedule);
    void document.fonts.ready.then(schedule);
    schedule();
    return () => {
      active = false;
      cancelAnimationFrame(request);
      observer.disconnect();
      flow.removeEventListener("load", schedule, true);
      document.fonts.removeEventListener("loadingdone", schedule);
    };
  }, [chapterId, chapter, book, edition, scale, width, showCover, hidden, updating]);

  function turnPage(direction: -1 | 1) {
    if (showCover) {
      if (direction === 1) { setShowCover(false); setPage(0); }
      return;
    }
    if (direction === 1 && page < pageCount - 1) { setPage(p => p + 1); return; }
    if (direction === -1 && page > 0) { setPage(p => p - 1); return; }
    const next = book.chapters[index + direction];
    if (next) {
      if (direction === -1) previousChapterEnd.current = next.id;
      onNavigate(next.id);
    } else if (direction === -1 && book.cover) {
      setShowCover(true);
    }
  }
  const previousDisabled = showCover || (page === 0 && index <= 0 && !book.cover);
  const nextDisabled = !showCover && page >= pageCount - 1 && index >= book.chapters.length - 1;
  const style = {
    fontFamily: BODY_FONTS[edition.bodyFont],
    fontSize: `${edition.fontSize * scale}px`,
    lineHeight: edition.lineHeight,
    "--paragraph-indent": `${edition.paragraphIndent}em`,
    "--paragraph-spacing": `${edition.paragraphSpacing}em`,
    "--chapter-space": `${edition.chapterSpacing}em`,
    "--front-heading-scale": edition.frontMatterTitleScale??1,
    width: width === "fit" ? "100%" : `${width}px`,
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
      <div className="unified-preview-toolbar" aria-label="Preview simulator controls">
        {formatControl}
        <label>
          Reading width
          <select
            aria-label="Reading width"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
          >
            <option value="fit">Fit column</option>
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
        <div className="text-size-control"><span>Text size</span>
        <div className="reader-zoom" title="Preview only — text size does not change the exported edition">
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
            aria-label="Reset preview text size (preview only)"
            aria-live="polite"
            title="Reset to 100%"
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
      </div>
      {book.cover ? <div className="cover-preview-toggle" role="group" aria-label="Preview page">
        <button type="button" aria-pressed={showCover} onClick={()=>setShowCover(true)}>Cover</button>
        <button type="button" aria-pressed={!showCover} onClick={()=>setShowCover(false)}>Chapter</button>
      </div> : null}
      <div className={`reader-viewport paginated-reader theme-${theme}${width === "fit" ? " fit-column" : ""}`} ref={viewport}
        tabIndex={0} role="region" aria-label="Paginated ebook reader"
        onKeyDown={event => {
          if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return;
          if (event.key === "ArrowRight") { event.preventDefault(); turnPage(1); }
          if (event.key === "ArrowLeft") { event.preventDefault(); turnPage(-1); }
        }}
        onTouchStart={event => { const touch = event.touches[0]; swipeStart.current = {x:touch.clientX,y:touch.clientY}; }}
        onTouchEnd={event => {
          const start = swipeStart.current, end = event.changedTouches[0];
          swipeStart.current = null;
          if (start && end && Math.abs(end.clientX-start.x)>50 && Math.abs(end.clientX-start.x)>Math.abs(end.clientY-start.y)*1.5) turnPage(end.clientX<start.x?1:-1);
        }}>
        <article
          className={`ebook-page paginated-ebook-page heading-${edition.headingStyle} template-${edition.template.id} opening-${openingDesign(chapter?.sectionType??"chapter",edition.template.id).style}${chapter && sectionMatter(chapter.sectionType??"chapter")==="front"?" front-matter":""}`}
          style={style}
          aria-label="Formatted chapter"
          aria-busy={updating}
        >
          <div className="ebook-pagination-window" ref={pageWindow}>
          <div className={`ebook-page-flow${showCover?" showing-cover":""}`} ref={pageFlow}
            style={{transform:`translateX(-${page * (pageWidth + 40)}px)`}}>
          {showCover && book.cover ? <div className="ebook-cover-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={book.cover.src} alt={book.cover.alt}/>
          </div> : <><header className="ebook-chapter-header">
            {chapter && (showSectionTitle(chapter)||chapter.sectionType==="title") ? <>
              {chapterOrdinal(book.chapters,index)!==null && (edition.chapterNumberStyle??"none")!=="none"
                ? ((edition.showChapterTitle??true)
                    ? <span className="ebook-chapter-number">{chapterNumberLabel(edition.chapterNumberStyle??"none",chapterOrdinal(book.chapters,index)!)}</span>
                    : <h2 className="ebook-chapter-number number-only">{chapterNumberLabel(edition.chapterNumberStyle??"none",chapterOrdinal(book.chapters,index)!)}</h2>)
                : null}
              {(chapter.sectionType==="title" || chapter.sectionType==="half-title") ? <h2>{chapter.title}</h2> : openingDesign(chapter.sectionType??"chapter",edition.template.id).suppressHeading ? null : (chapter.sectionType??"chapter")!=="chapter" || (edition.showChapterTitle??true)
                ? <h2 style={chapter.sectionType==="bibliography"?{fontSize:"1.35em",textAlign:"left",letterSpacing:".02em",fontWeight:600}:undefined}>{chapter.title}</h2>
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
          </div>
          </div>
        </article>
      </div>
      <div className="preview-footer">
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

        <button
          disabled={previousDisabled}
          onClick={() => turnPage(-1)}
          aria-label="Previous preview page"
        >
          ← Previous
        </button>
        <span role="status" aria-live="polite">
          {showCover ? "Cover" : `Page ${page + 1} of ${pageCount} · Section ${index + 1} of ${book.chapters.length}`}
        </span>
        <button
          disabled={nextDisabled}
          onClick={() => turnPage(1)}
          aria-label="Next preview page"
        >
          Next →
        </button>

      </div>
    </section>
  );
}
