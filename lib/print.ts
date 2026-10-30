import { PDFDocument, grayscale, degrees, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { schema, validateBook, type Book } from "./model";
import { getPrintEdition, type PrintEdition } from "./print-profile";
import { checksum, preflight, snapshotChecksum } from "./epub";
import type { Node as ManuscriptNode } from "prosemirror-model";
export const PRINT_RENDERER = "print-proof-1.2.0";
export type PrintFonts = {
  regular: Uint8Array;
  italic: Uint8Array;
  bold: Uint8Array;
  boldItalic: Uint8Array;
};
type Face = keyof PrintFonts;
type Run = { text: string; face: Face };
type Word = { runs: Run[]; space: boolean; hardBreak?: boolean };
type Line = { runs: Run[]; width: number; indent: number };
export type PageProof = {
  page: number;
  kind: "title" | "blank" | "chapter" | "body";
  chapterId?: string;
  chapterTitle?: string;
  left: number;
  right: number;
  lineCount: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  header?: string;
  footer?: string;
};
export type PrintRecord = {
  id: string;
  bookId: string;
  title: string;
  createdAt: string;
  revision: number;
  renderer: string;
  profile: PrintEdition;
  inputChecksum: string;
  artifactChecksum: string;
  byteLength: number;
  pageCount: number;
  filename: string;
  checks: { overflow: number; splitViolations: number; fonts: "embedded" };
  warnings: string[];
  pages: PageProof[];
};
export type PrintResult = { bytes: Uint8Array; record: PrintRecord };

export async function buildPrintPdf(
  input: Book,
  assets: PrintFonts,
  options: { id: string; createdAt: string },
): Promise<PrintResult> {
  const book = structuredClone(validateBook(input)),
    profile = structuredClone(getPrintEdition(book));
  if (preflight(book).some((i) => i.severity === "error"))
    throw Error(
      "Fix missing metadata or empty sections in Publish before building a print proof.",
    );
  for (const bytes of Object.values(assets))
    if (
      !bytes?.length ||
      bytes.length < 4 ||
      new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
        0,
        false,
      ) !== 0x774f4646
    )
      throw Error(
        "A print font file is unavailable or damaged. Open the app online once and retry.",
      );
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts = {} as Record<Face, PDFFont>;
  for (const face of ["regular", "italic", "bold", "boldItalic"] as const)
    fonts[face] = await pdf.embedFont(assets[face], { subset: true });
  const glyphs = Object.fromEntries(
    Object.entries(fonts).map(([k, v]) => [k, new Set(v.getCharacterSet())]),
  ) as Record<Face, Set<number>>;
  const WIDTH = 432,
    HEIGHT = 648,
    contentWidth = WIDTH - profile.inside - profile.outside,
    leading = profile.leading,
    size = profile.fontSize,
    bottom = profile.bottom + 4;
  const pages: PageProof[] = [],
    warnings = new Set<string>([
      "Feasibility proof only: reader/retailer approval and a physical print proof are still required.",
      "Automatic hyphenation, images and complex-script shaping are not supported.",
      ...(profile.alignment === "justify" ? ["Justification uses capped word-space expansion; lines requiring excessive gaps remain ragged-right."] : []),
    ]);
  if (book.importInfo?.diagnostics.some((d) => d.severity === "warning"))
    warnings.add(
      "The manuscript import has conversion warnings. Compare the original file; imported images remain text placeholders.",
    );
  let page: PDFPage,
    proof: PageProof,
    y = HEIGHT - profile.top - size,
    chapterId = "",
    chapterTitle = "",
    splitViolations = 0;
  const widths = new Map<string, number>();
  function measure(text: string, face: Face, fontSize: number): number {
    const key = `${face}/${fontSize}/${text}`;
    const cached = widths.get(key);
    if (cached !== undefined) return cached;
    if (/[\u0590-\u08ff]/u.test(text))
      throw Error(
        "This print proof currently supports left-to-right Latin text, not complex-script shaping. Use EPUB for this manuscript.",
      );
    for (const c of text) {
      const code = c.codePointAt(0)!;
      if (!glyphs[face].has(code))
        throw Error(
          `The print font cannot represent U+${code.toString(16).toUpperCase()} in “${text.slice(0, 35)}”. Replace this character before generating a proof.`,
        );
    }
    const w = fonts[face].widthOfTextAtSize(text, fontSize);
    widths.set(key, w);
    return w;
  }
  function newPage(kind: PageProof["kind"]) {
    if (pages.length >= 700)
      throw Error(
        "This fixed proof profile supports at most 700 pages. A larger gutter/profile is required for a longer book.",
      );
    page = pdf.addPage([WIDTH, HEIGHT]);
    page.setTrimBox(0, 0, WIDTH, HEIGHT);
    page.setBleedBox(0, 0, WIDTH, HEIGHT);
    const n = pages.length + 1;
    const left = n % 2 ? profile.inside : profile.outside;
    proof = {
      page: n,
      kind,
      ...(chapterId ? { chapterId, chapterTitle } : {}),
      left,
      right: WIDTH - (n % 2 ? profile.outside : profile.inside),
      lineCount: 0,
      minX: WIDTH,
      maxX: 0,
      minY: HEIGHT,
      maxY: 0,
    };
    pages.push(proof);
    y = HEIGHT - profile.top - size;
    return page;
  }
  function draw(
    text: string,
    x: number,
    baseline: number,
    fontSize: number,
    face: Face = "regular",
    body = true,
  ) {
    if (!text) return;
    const w = measure(text, face, fontSize);
    const ascent = fonts[face].heightAtSize(fontSize, { descender: false });
    const descent = fonts[face].heightAtSize(fontSize) - ascent;
    if (
      x < 0 ||
      x + w > WIDTH + 0.01 ||
      baseline - descent < 0 ||
      baseline + ascent > HEIGHT + 0.01
    )
      throw Error(
        "Print layout overflow was detected. The PDF was not generated.",
      );
    if (
      body &&
      (x < proof.left - 0.01 ||
        x + w > proof.right + 0.01 ||
        baseline - descent < profile.bottom - 0.01 ||
        baseline + ascent > HEIGHT - profile.top + 0.01)
    )
      throw Error(
        "Text exceeded the print content margins. The PDF was not generated.",
      );
    page.drawText(text, {
      x,
      y: baseline,
      size: fontSize,
      font: fonts[face],
      color: grayscale(0),
    });
    if (body) {
      proof.minX = Math.min(proof.minX, x);
      proof.maxX = Math.max(proof.maxX, x + w);
      proof.minY = Math.min(proof.minY, baseline - descent);
      proof.maxY = Math.max(proof.maxY, baseline + ascent);
    }
  }
  function line(
    runs: Run[],
    indent = 0,
    fontSize: number = size,
    baseline = y,
    justify = false,
  ) {
    // Never stretch the last paragraph line or a line without enough word gaps.
    // If justification would create visually disruptive gaps, leave it ragged-right.
    const spaces = runs.filter((r) => r.text === " ").length;
    const naturalWidth = runs.reduce((n, r) => n + measure(r.text, r.face, fontSize), 0);
    const available = contentWidth - indent - naturalWidth;
    const normalSpace = measure(" ", "regular", fontSize);
    const extra = justify && spaces >= 2 && available > 0 &&
      available / spaces <= normalSpace * 0.65 ? available / spaces : 0;
    let x = proof.left + indent;
    for (const run of runs) {
      draw(run.text, x, baseline, fontSize, run.face);
      x += measure(run.text, run.face, fontSize);
      if (run.text === " ") x += extra;
    }
    proof.lineCount++;
  }
  function slots() {
    return Math.max(0, Math.floor((y - bottom) / leading) + 1);
  }
  function bodyPage() {
    newPage("body");
  }
  function units(node: ManuscriptNode): Word[] {
    const out: Word[] = [];
    let word: Run[] = [],
      space = false;
    const flush = () => {
      if (word.length) {
        out.push({ runs: word, space });
        word = [];
        space = false;
      }
    };
    node.forEach((child) => {
      const strong = child.marks.some((m) => m.type.name === "strong"),
        em = child.marks.some((m) => m.type.name === "em");
      const face: Face =
        strong && em
          ? "boldItalic"
          : strong
            ? "bold"
            : em
              ? "italic"
              : "regular";
      for (const part of (child.text ?? "").split(/(\r?\n|[^\S\r\n]+)/u)) {
        if (!part) continue;
        if (/^\r?\n$/.test(part)) {
          flush();
          out.push({ runs: [], space: false, hardBreak: true });
        } else if (/^\s+$/u.test(part)) {
          flush();
          space = true;
        } else word.push({ text: part, face });
      }
    });
    flush();
    return out;
  }
  function wrap(
    words: Word[],
    firstIndent: number,
    fontSize: number = size,
    maxWidth = contentWidth,
  ): Line[] {
    const result: Line[] = [];
    let runs: Run[] = [],
      width = 0,
      indent = firstIndent;
    const flush = () => {
      result.push({ runs, width, indent });
      runs = [];
      width = 0;
      indent = 0;
    };
    function add(word: Run[], space: boolean) {
      const wordWidth = word.reduce(
        (n, r) => n + measure(r.text, r.face, fontSize),
        0,
      );
      const blank =
        space && runs.length ? measure(" ", "regular", fontSize) : 0;
      if (width + blank + wordWidth <= maxWidth - indent + 0.001) {
        if (blank) {
          runs.push({ text: " ", face: "regular" });
          width += blank;
        }
        runs.push(...word);
        width += wordWidth;
        return;
      }
      if (runs.length) flush();
      if (wordWidth <= maxWidth - indent + 0.001) {
        runs.push(...word);
        width = wordWidth;
        return;
      }
      warnings.add(
        "At least one overlong word was split across lines without a hyphen; inspect the proof.",
      );
      for (const run of word)
        for (const character of run.text) {
          const w = measure(character, run.face, fontSize);
          if (width + w > maxWidth - indent && runs.length) flush();
          runs.push({ text: character, face: run.face });
          width += w;
        }
    }
    for (const word of words) {
      if (word.hardBreak) {
        flush();
        continue;
      }
      add(word.runs, word.space);
    }
    if (runs.length) flush();
    return result;
  }
  function textLines(text: string, fontSize: number, face: Face): Line[] {
    const node = schema.nodes.paragraph.create(
      null,
      text ? schema.text(text) : null,
    );
    const words = units(node).map((w) => ({
      ...w,
      runs: w.runs.map((r) => ({ ...r, face })),
    }));
    return wrap(words, 0, fontSize);
  }
  function centered(lines: Line[], fontSize: number, step: number) {
    for (const l of lines) {
      const x = proof.left + (contentWidth - l.width) / 2;
      let cursor = x;
      for (const run of l.runs) {
        draw(run.text, cursor, y, fontSize, run.face);
        cursor += measure(run.text, run.face, fontSize);
      }
      proof.lineCount++;
      y -= step;
    }
  }
  // Front title leaf and all chapter openings use physical right-hand pages.
  newPage("title");
  y = HEIGHT - 160;
  const title = textLines(book.title, 23, "regular"),
    author = textLines(book.author, 12, "regular");
  if (title.length > 8 || author.length > 5)
    throw Error("The title or author is too long for this proof's title page.");
  centered(title, 23, 31);
  y -= 35;
  centered(author, 12, 19);
  for (const chapter of book.chapters) {
    chapterId = chapter.id;
    chapterTitle = chapter.title;
    if ((pages.length + 1) % 2 === 0) newPage("blank");
    newPage("chapter");
    const template = profile.template.id;
    const headingSize = template === "gothic" ? 19 : template === "modern" ? 17 : 18;
    y = HEIGHT - profile.top - (template === "gothic" ? 107 : template === "modern" ? 51 : 75);
    const headingText = template === "gothic" ? chapter.title.toLocaleUpperCase(book.language ?? "en") : chapter.title;
    const heading = textLines(headingText, headingSize, "bold");
    if (heading.length > 8)
      throw Error(
        "A chapter title is too long for the fixed print opening. Shorten it and retry.",
      );
    if (template === "modern") {
      for (const h of heading) {
        line(h.runs, 0, headingSize);
        y -= 25;
      }
      y -= 16;
    } else {
      centered(heading, headingSize, template === "gothic" ? 30 : 25);
      y -= template === "gothic" ? 36 : 25;
    }
    let opening = true;
    schema.nodeFromJSON(chapter.content).forEach((node) => {
      if (node.type.name === "scene_break") {
        if (slots() < 5) bodyPage();
        y -= leading;
        if (template === "modern") {
          page.drawLine({
            start: { x: proof.left + contentWidth / 2 - 22, y },
            end: { x: proof.left + contentWidth / 2 + 22, y },
            thickness: 0.65,
            color: grayscale(0.35),
          });
        } else if (template === "gothic") {
          // Vector diamonds avoid depending on a font's ornamental Unicode glyph coverage.
          for (const dx of [-15, 0, 15]) {
            page.drawRectangle({
              x: proof.left + contentWidth / 2 + dx - 3.5,
              y: y - 3.5,
              width: 7,
              height: 7,
              rotate: degrees(45),
              color: grayscale(0.25),
            });
          }
        } else {
          const ornament = "* * *";
          const w = measure(ornament, "regular", 11);
          draw(ornament, proof.left + (contentWidth - w) / 2, y, 11);
        }
        proof.lineCount++;
        y -= leading * 2;
        opening = true;
        return;
      }
      if (node.type.name === "heading") {
        const lines = wrap(
          units(node).map((w) => ({
            ...w,
            runs: w.runs.map((r) => ({ ...r, face: "bold" as const })),
          })),
          0,
          13,
        );
        if (slots() < Math.ceil((lines.length * 19 + leading * 3) / leading))
          bodyPage();
        y -= 10;
        for (const l of lines) {
          line(l.runs, 0, 13);
          y -= 19;
        }
        y -= 9;
        opening = true;
        return;
      }
      if (!node.textContent.trim()) return;
      const lines = wrap(units(node), opening ? 0 : 14);
      let offset = 0;
      while (offset < lines.length) {
        let capacity = slots();
        const remaining = lines.length - offset;
        if (capacity === 0 || (capacity < 2 && remaining > 1)) {
          bodyPage();
          capacity = slots();
        }
        let count = Math.min(remaining, capacity);
        if (remaining > count && remaining - count === 1) count--;
        if (count < 1 || (remaining > count && count < 2)) {
          bodyPage();
          continue;
        }
        if (remaining > count && (count < 2 || remaining - count < 2))
          splitViolations++;
        for (let i = 0; i < count; i++) {
          const l = lines[offset + i];
          line(l.runs, l.indent, size, y, profile.alignment === "justify" && offset + i < lines.length - 1);
          y -= leading;
        }
        offset += count;
        if (offset < lines.length) bodyPage();
      }
      opening = false;
    });
  }
  if (pages.length % 2) newPage("blank");
  for (let i = 0; i < pages.length; i++) {
    proof = pages[i];
    page = pdf.getPage(i);
    if (proof.kind === "blank" || proof.kind === "title") continue;
    const number = String(i + 1);
    const numberWidth = measure(number, "regular", 9);
    draw(
      number,
      proof.page % 2 ? proof.right - numberWidth : proof.left,
      28,
      9,
      "regular",
      false,
    );
    proof.footer = number;
    if (proof.kind === "body") {
      let header = profile.template.id === "modern"
        ? (proof.page % 2 ? book.title : "")
        : profile.template.id === "gothic"
          ? (proof.page % 2 ? (proof.chapterTitle ?? book.title) : book.title)
          : (proof.page % 2 ? book.title : book.author);
      while (header.length && measure(header, "regular", 8) > contentWidth)
        header = header.slice(0, -1);
      if (header && measure(header, "regular", 8) > contentWidth) {
        header = header.trimEnd();
        while (
          header.length &&
          measure(header + "…", "regular", 8) > contentWidth
        )
          header = header.slice(0, -1);
        header += "…";
      }
      draw(header, proof.left, HEIGHT - 32, 8, "regular", false);
      proof.header = header;
    }
  }
  if (splitViolations)
    throw Error(
      "A paragraph could not be split with two lines on each page. The proof was not generated.",
    );
  if (pages.length < 24)
    warnings.add(
      "This proof has fewer than 24 pages and is not a retail paperback submission.",
    );
  for (const p of pages)
    if (!p.lineCount) {
      p.minX = p.maxX = p.minY = p.maxY = 0;
    }
  const created = new Date(options.createdAt);
  if (!Number.isFinite(created.getTime()))
    throw Error("Invalid print build timestamp.");
  const inputChecksum = snapshotChecksum(book);
  pdf.setTitle(book.title);
  pdf.setAuthor(book.author);
  pdf.setCreator("Book Formatter");
  pdf.setProducer(PRINT_RENDERER);
  pdf.setCreationDate(created);
  pdf.setModificationDate(created);
  pdf.setLanguage(book.language ?? "en");
  pdf.setKeywords([
    `${profile.template.id} 6x9 no bleed`,
    `revision:${book.revision}`,
    `snapshot:${inputChecksum}`,
  ]);
  const bytes = await pdf.save({ useObjectStreams: false });
  const filename = `${book.title.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 100) || "book"}-${profile.template.id}-6x9-proof.pdf`;
  return {
    bytes,
    record: {
      id: options.id,
      bookId: book.id,
      title: book.title,
      createdAt: created.toISOString(),
      revision: book.revision,
      renderer: PRINT_RENDERER,
      profile,
      inputChecksum,
      artifactChecksum: checksum(bytes),
      byteLength: bytes.length,
      pageCount: pages.length,
      filename,
      checks: { overflow: 0, splitViolations, fonts: "embedded" },
      warnings: [...warnings],
      pages,
    },
  };
}
