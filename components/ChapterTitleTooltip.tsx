"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** Presentation-only tooltip for chapter titles that do not fit their row. */
export default function ChapterTitleTooltip({ title }: { title: string }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  useEffect(() => {
    const row = anchor.current?.parentElement;
    if (!row) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hide = () => { clearTimeout(timer); setPosition(null); };
    const show = () => {
      hide();
      timer = setTimeout(() => {
        const label = row.querySelector<HTMLElement>(".sidebar-section-title");
        if (!label || label.scrollWidth <= label.clientWidth) return;
        const rect = row.getBoundingClientRect();
        const tooltipWidth = Math.min(260, window.innerWidth - 16);
        setPosition({
          left: rect.right + 8 + tooltipWidth <= window.innerWidth - 8
            ? rect.right + 8 : Math.max(8, rect.left - tooltipWidth - 8),
          top: Math.max(8, Math.min(rect.top, window.innerHeight - 100)),
        });
      }, 200);
    };
    const leave = () => { if (!row.contains(document.activeElement)) hide(); };
    const blur = (event: FocusEvent) => {
      if (!(event.relatedTarget instanceof Node) || !row.contains(event.relatedTarget)) hide();
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") hide(); };
    row.addEventListener("pointerenter", show);
    row.addEventListener("pointerleave", leave);
    row.addEventListener("focusin", show);
    row.addEventListener("focusout", blur);
    row.addEventListener("keydown", key);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      clearTimeout(timer);
      row.removeEventListener("pointerenter", show);
      row.removeEventListener("pointerleave", leave);
      row.removeEventListener("focusin", show);
      row.removeEventListener("focusout", blur);
      row.removeEventListener("keydown", key);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, [title]);
  return <><span ref={anchor} hidden aria-hidden="true" />{position ? createPortal(
    <span className="chapter-title-tooltip" aria-hidden="true" style={position}>{title}</span>,
    document.body,
  ) : null}</>;
}
