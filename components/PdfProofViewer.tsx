"use client";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import type { PrintRecord } from "../lib/print";
import {PRINT_TRIMS} from "../lib/print-profile";
function PageCanvas({
  document,
  pageNumber,
  scale,
  kind,
  width,
  height,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  kind: string;
  width: number;
  height: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let task: RenderTask | undefined;
    setReady(false);
    setError("");
    async function render() {
      try {
        const page = await document.getPage(pageNumber);
        if (!active || !canvas.current) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: scale * ratio });
        canvas.current.width = Math.ceil(viewport.width);
        canvas.current.height = Math.ceil(viewport.height);
        task = page.render({ canvas: canvas.current, viewport });
        await task.promise;
        if (active) setReady(true);
      } catch (e) {
        if (
          active &&
          !(e instanceof Error && e.name === "RenderingCancelledException")
        )
          setError(
            "This PDF page could not be displayed. You can still download the proof.",
          );
      }
    }
    void render();
    return () => {
      active = false;
      task?.cancel();
    };
  }, [document, pageNumber, scale]);
  return (
    <figure className="pdf-leaf" style={{ width: width * scale }}>
      <canvas
        ref={canvas}
        role="img"
        aria-label={`Print proof page ${pageNumber}`}
        data-rendered={ready ? "true" : "false"}
        style={{ width: width * scale, height: height * scale }}
      />
      {error ? <p role="alert">{error}</p> : null}
      <figcaption>
        Page {pageNumber} ·{" "}
        {kind === "cover"
          ? "Front cover"
          : kind === "blank"
          ? "Intentional blank"
          : kind === "chapter"
            ? "Chapter opening"
            : kind === "title"
              ? "Title page"
              : "Body"}
      </figcaption>
    </figure>
  );
}
export default function PdfProofViewer({
  bytes,
  record,
  selectedSectionId,
}: {
  selectedSectionId?: string;
  bytes: Uint8Array;
  record: PrintRecord;
}) {
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [facing, setFacing] = useState(true),
    [scale, setScale] = useState(0.75);
  useEffect(() => {
    let active = true;
    let destroy: (() => void) | undefined;
    setDocument(null);
    setError("");
    setPage(1);
    async function open() {
      try {
        const pdfjs = await import("pdfjs-dist");
        if (!active) return;
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
        const task = pdfjs.getDocument({
          data: new Uint8Array(bytes),
          useSystemFonts: false,
          useWasm: false,
        });
        destroy = () => {
          void task.destroy();
        };
        const loaded = await task.promise;
        if (active) setDocument(loaded);
        else void task.destroy();
      } catch {
        if (active)
          setError(
            "The PDF preview could not open. The generated file can still be downloaded.",
          );
      }
    }
    void open();
    return () => {
      active = false;
      destroy?.();
    };
  }, [bytes]);
  useEffect(() => {
    if(!selectedSectionId)return;
    const opening=record.pages.find(p=>p.chapterId===selectedSectionId&&p.kind==="chapter");
    if(opening)setPage(opening.page);
  },[selectedSectionId,record]);
  const {width,height}=PRINT_TRIMS[record.profile.trim] ?? PRINT_TRIMS["6x9"];
  const first = facing ? (page % 2 ? page - 1 : page) : page;
  const visible = facing ? [first, first + 1] : [first];
  return (
    <section className="pdf-proof-viewer" aria-label="PDF proof preview">
      <div className="pdf-toolbar">
        <label>
          Page
          <input
            aria-label="Print page"
            type="number"
            min="1"
            max={record.pageCount}
            value={page}
            onChange={(e) =>
              setPage(
                Math.min(
                  record.pageCount,
                  Math.max(1, Number(e.target.value) || 1),
                ),
              )
            }
          />
        </label>
        <span>of {record.pageCount}</span>
        <label>
          View
          <select
            aria-label="Print view"
            value={facing ? "facing" : "single"}
            onChange={(e) => setFacing(e.target.value === "facing")}
          >
            <option value="facing">Facing pages</option>
            <option value="single">Single page</option>
          </select>
        </label>
        <label>
          Zoom
          <select
            aria-label="Print zoom"
            value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
          >
            <option value="0.5">50%</option>
            <option value="0.75">75%</option>
            <option value="1">100%</option>
            <option value="1.25">125%</option>
          </select>
        </label>
        <button
          aria-label="Previous print pages"
          disabled={page === 1}
          onClick={() => setPage((p) => Math.max(1, p - (facing ? 2 : 1)))}
        >
          ←
        </button>
        <button
          aria-label="Next print pages"
          disabled={page >= record.pageCount}
          onClick={() =>
            setPage((p) => Math.min(record.pageCount, p + (facing ? 2 : 1)))
          }
        >
          →
        </button>
      </div>
      {error ? <p role="alert">{error}</p> : null}
      {!document && !error ? (
        <p aria-live="polite">Opening the generated PDF locally…</p>
      ) : null}
      <div className="pdf-spread">
        {document
          ? visible.map((n) =>
              n >= 1 && n <= record.pageCount ? (
                <PageCanvas
                  key={n}
                  document={document}
                  pageNumber={n}
                  scale={scale}
                  kind={record.pages[n - 1].kind}
                  width={width}
                  height={height}
                />
              ) : (
                <div
                  key={n}
                  className="pdf-outside"
                  style={{ width: width * scale, height: height * scale }}
                >
                  Outside interior
                </div>
              ),
            )
          : null}
      </div>
      <p className="preview-note">
        The preview renders the same PDF bytes used by Download. It is not a
        separate HTML approximation.
      </p>
    </section>
  );
}
