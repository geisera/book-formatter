import { decodeImage, embeddedImages } from "./images";
import {hyphenationPoints} from "./hyphenation";
import {shouldBalanceParagraphTail} from "./facing-balance";
import { normalizedIsbn } from "./publication-metadata";
import { PDFDocument, grayscale, degrees, type PDFFont, type PDFPage, type PDFImage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { schema, validateBook, showSectionTitle, getSectionLayout, sectionMatter, type SectionPageLayout, type TextAlignment, type Book } from "./model";
import { getPrintEdition, PRINT_TRIMS, type PrintEdition } from "./print-profile";
import { checksum, preflight, snapshotChecksum } from "./epub";
import type { Node as ManuscriptNode } from "prosemirror-model";
export const PRINT_RENDERER = "print-proof-1.5.0";
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
  kind: "cover" | "title" | "blank" | "chapter" | "body";
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
  includeFrontCover?: boolean;
  filename: string;
  checks: { overflow: number; splitViolations: number; fonts: "embedded" };
  warnings: string[];
  pages: PageProof[];
};
export type PrintResult = { bytes: Uint8Array; record: PrintRecord };

export async function buildPrintPdf(
  input: Book,
  assets: PrintFonts,
  options: { id: string; createdAt: string; includeFrontCover?: boolean; onProgress?: (percent:number,stage:string)=>void },
): Promise<PrintResult> {
  options.onProgress?.(5,"Preparing manuscript");
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
  if (options.includeFrontCover && !book.cover) throw Error("Upload cover artwork in Design before including a front cover in the PDF.");
  options.onProgress?.(10,"Loading print fonts");
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const fonts = {} as Record<Face, PDFFont>;
  for (const face of ["regular", "italic", "bold", "boldItalic"] as const)
    fonts[face] = await pdf.embedFont(assets[face], { subset: true });
  const glyphs = Object.fromEntries(
    Object.entries(fonts).map(([k, v]) => [k, new Set(v.getCharacterSet())]),
  ) as Record<Face, Set<number>>;
  const embedded = new Map<string,PDFImage>();
  for (const section of book.chapters) for (const image of embeddedImages(section.content)) {
    if (embedded.has(image.src)) continue;
    const source = decodeImage(image.src);
    embedded.set(image.src, source.mediaType === "image/png" ? await pdf.embedPng(source.bytes) : await pdf.embedJpg(source.bytes));
  }
  const WIDTH = PRINT_TRIMS[profile.trim].width,
    HEIGHT = PRINT_TRIMS[profile.trim].height,
    contentWidth = WIDTH - profile.inside - profile.outside,
    leading = profile.leading,
    size = profile.fontSize,
    bottom = profile.bottom + 4;
  const pages: PageProof[] = [],
    warnings = new Set<string>([
      "Feasibility proof only: reader/retailer approval and a physical print proof are still required.",
      "Automatic hyphenation and complex-script shaping are not supported.",
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
  let activeLayout: SectionPageLayout = getSectionLayout(book.chapters[0]);
  const contentsPages: { index: number; entries: typeof book.chapters }[] = [];
  // Bounded width cache: large books contain many unique tokens, and keeping
  // every string forever can grow worker memory without improving reuse.
  const widths = new Map<string, number>();
  const WIDTH_CACHE_LIMIT = 12000;
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
    if (widths.size >= WIDTH_CACHE_LIMIT) widths.clear();
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
    alignment: TextAlignment = "left",
  ) {
    // Never stretch the last paragraph line or a line without enough word gaps.
    // If justification would create visually disruptive gaps, leave it ragged-right.
    const spaces = runs.filter((r) => r.text === " ").length;
    const naturalWidth = runs.reduce((n, r) => n + measure(r.text, r.face, fontSize), 0);
    const available = contentWidth - indent - naturalWidth;
    const normalSpace = measure(" ", "regular", fontSize);
    const extra = justify && spaces >= 2 && available > 0 &&
      available / spaces <= normalSpace * 0.95 ? available / spaces : 0;
    let x = proof.left + indent + (alignment === "center" ? Math.max(0, available) / 2 : alignment === "right" ? Math.max(0, available) : 0);
    for (const run of runs) {
      draw(run.text, x, baseline, fontSize, run.face);
      x += measure(run.text, run.face, fontSize);
      if (run.text === " ") x += extra;
    }
    proof.lineCount++;
  }
  function slots() {
    return Math.max(0, Math.floor((y - bottom - activeLayout.spaceAfter) / leading) + 1);
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
  const exceptionWords=new Set((profile.hyphenationExceptions??"").toLowerCase().split(/[\s,]+/).filter(Boolean));
  const locale=profile.hyphenationLanguage??"en-us";
  const hyphenCache=new Map<string,number[]>();
  function hyphenPoints(word:string):number[]{
    const key=locale+":"+word.toLowerCase();
    const cached=hyphenCache.get(key);
    if(cached)return cached;
    const points=hyphenationPoints(word,locale,exceptionWords);
    if(hyphenCache.size>=12000)hyphenCache.clear();
    hyphenCache.set(key,points);
    return points;
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
      indent = firstIndent,
      consecutiveHyphens=0;
    const flush = () => {
      if(runs.length){
        result.push({ runs, width, indent });
        consecutiveHyphens = runs[runs.length-1]?.text.endsWith("-") ? consecutiveHyphens+1 : 0;
      }
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
      // Hyphenate at a normal line boundary before pushing an entire word
      // to the next line; this reduces excessive justification gaps.
      if(runs.length && profile.hyphenate!==false && word.length===1 &&
         /^[a-z]+$/i.test(word[0].text) &&
         consecutiveHyphens < (profile.maxConsecutiveHyphens??2)){
        const fitting=hyphenPoints(word[0].text).filter(pos=>
          measure(word[0].text.slice(0,pos)+"-",word[0].face,fontSize)+blank <= maxWidth-indent-width+0.001);
        if(fitting.length){
          const at=fitting[fitting.length-1];
          const prefix=word[0].text.slice(0,at)+"-";
          if(blank){runs.push({text:" ",face:"regular"});width+=blank;}
          runs.push({text:prefix,face:word[0].face});width+=measure(prefix,word[0].face,fontSize);
          flush();
          add([{text:word[0].text.slice(at),face:word[0].face}],false);
          return;
        }
      }
      if (runs.length) flush();
      if (wordWidth <= maxWidth - indent + 0.001) {
        runs.push(...word);
        width = wordWidth;
        return;
      }
      // Prefer only TeX-approved breaks; never split arbitrary characters.
      // Restrict automatic splitting to unstyled alphabetic words so marks
      // and punctuation retain their original content.
      if(profile.hyphenate!==false && word.length===1 && /^[a-z]+$/i.test(word[0].text)){
        let remaining=word[0].text;
        while(remaining){
          const candidates=consecutiveHyphens < (profile.maxConsecutiveHyphens??2)
            ? hyphenPoints(remaining) : [];
          const available=maxWidth-indent-width;
          const fit=candidates.filter(pos=>measure(remaining.slice(0,pos)+"-",word[0].face,fontSize)<=available+0.001);
          if(fit.length){
            const cut=fit[fit.length-1];
            const fragment=remaining.slice(0,cut)+"-";
            runs.push({text:fragment,face:word[0].face});
            width+=measure(fragment,word[0].face,fontSize);
            flush();
            remaining=remaining.slice(cut);
          }else{
            if(runs.length){flush();continue;}
            throw Error("A word is too wide for this print page and cannot be hyphenated safely. Try a larger trim, smaller font, or edit the word.");
          }
          if(measure(remaining,word[0].face,fontSize)<=maxWidth-indent){
            runs.push({text:remaining,face:word[0].face});
            width+=measure(remaining,word[0].face,fontSize);
            break;
          }
        }
      }else{
        if(runs.length){flush();add(word,false);return;}
        throw Error("A word or styled span is too wide for print margins. Adjust the book design or text.");
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
    // Avoid a one-word final line where the preceding line can safely yield
    // its last word. Never alter manuscript text or force overflow.
    if (result.length > 1) {
      const last = result[result.length - 1];
      const previous = result[result.length - 2];
      const finalWords = last.runs.map(r=>r.text).join("").trim().split(/\\s+/);
      const prevText = previous.runs.map(r=>r.text).join("");
      if (finalWords.length === 1 && /\\S+\\s+\\S+\\s*$/.test(prevText)) {
        const cut = prevText.trimEnd().lastIndexOf(" ");
        const word = prevText.slice(cut + 1).trim();
        const candidate = word + " " + last.runs.map(r=>r.text).join("");
        // Only move plain, unstyled lines; marked spans retain their styling.
        if (previous.runs.every(r=>r.face==="regular") && last.runs.every(r=>r.face==="regular") &&
            measure(candidate,"regular",fontSize) <= maxWidth - last.indent) {
          const kept = prevText.slice(0,cut).trimEnd();
          previous.runs=[{text:kept,face:"regular"}];
          previous.width=measure(kept,"regular",fontSize);
          last.runs=[{text:candidate,face:"regular"}];
          last.width=measure(candidate,"regular",fontSize);
        }
      }
    }
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
  for (const [chapterIndex,chapter] of book.chapters.entries()) {
    options.onProgress?.(Math.round(15+65*chapterIndex/book.chapters.length),`Laying out section ${chapterIndex+1} of ${book.chapters.length}`);
    chapterId = chapter.id;
    chapterTitle = chapter.title;
    activeLayout = getSectionLayout(chapter);
    if (activeLayout.start !== "next" && (pages.length + 1) % 2 !== (activeLayout.start === "recto" ? 1 : 0)) newPage("blank");
    if (chapter.sectionType === "toc") {
      // Allocate pages first; actual folios become known after pagination completes.
      const entries = book.chapters.filter(section => section.id !== chapter.id && section.sectionType !== "toc");
      const capacity = 16;
      for (let start = 0; start < Math.max(1, entries.length); start += capacity) {
        newPage(start === 0 ? "chapter" : "body");
        contentsPages.push({index: pages.length - 1, entries: entries.slice(start, start + capacity)});
      }
      continue;
    }
    newPage("chapter");
    const template = profile.template.id;
    const headingSize = template === "gothic" ? 19 : template === "modern" ? 17 : 18;
    const topBaseline = HEIGHT - profile.top - (template === "gothic" ? 107 : template === "modern" ? 51 : 75);
    // Estimate short-section height before drawing; on multi-page sections top alignment is safer.
    // Use conservative line counts and reserve some headroom to avoid orphaned layout.
    const doc = schema.nodeFromJSON(chapter.content);
    let estimated = showSectionTitle(chapter) ? 110 : 0;
    doc.forEach(node => {
      if (node.type.name === "image") {
        const asset = embedded.get(node.attrs.src)!;
        estimated += Math.min(350, contentWidth * node.attrs.width / 100 * asset.height / asset.width) + 22 + (node.attrs.caption ? 40 : 0);
      } else if (node.type.name === "scene_break") estimated += leading * 4;
      else if (node.type.name === "heading") estimated += wrap(units(node), 0, 13).length * 19 + 30;
      else if (node.textContent.trim()) estimated += Math.max(1, wrap(units(node), profile.firstLineIndent ?? 14).length + 1) * leading + (profile.paragraphSpacing ?? 0);
    });
    const room = Math.max(0, topBaseline - bottom - activeLayout.spaceBefore - activeLayout.spaceAfter - estimated - 28);
    const offset = estimated < topBaseline - bottom - 28
      ? activeLayout.vertical === "center" ? room / 2 : activeLayout.vertical === "bottom" ? room : 0
      : 0;
    y = topBaseline - activeLayout.spaceBefore - offset - (profile.chapterOpeningSpace ?? 0);
    if (showSectionTitle(chapter)) {
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
    }
    let opening = true;
    doc.forEach((node, _offset, index) => {
      if (node.type.name === "image") {
        const asset = embedded.get(node.attrs.src);
        if (!asset) throw Error("Embedded print image could not be loaded.");
        const maxWidth = contentWidth * node.attrs.width / 100;
        const maxHeight = HEIGHT - profile.top - profile.bottom - 120;
        const scale = Math.min(maxWidth / asset.width, maxHeight / asset.height);
        const width = asset.width * scale, height = asset.height * scale;
        const captionLines = node.attrs.caption ? textLines(node.attrs.caption, 9, "italic") : [];
        const captionHeight = captionLines.length * 13;
        if (y - height - captionHeight - 20 < bottom + activeLayout.spaceAfter) bodyPage();
        const x = node.attrs.align === "left" ? proof.left
          : node.attrs.align === "right" ? proof.right - width
          : proof.left + (contentWidth - width) / 2;
        const imgY = y - height;
        page.drawImage(asset,{x,y:imgY,width,height});
        proof.minX = Math.min(proof.minX,x);
        proof.maxX = Math.max(proof.maxX,x+width);
        proof.minY = Math.min(proof.minY,imgY);
        proof.maxY = Math.max(proof.maxY,y);
        proof.lineCount++;
        y = imgY - 13;
        for (const l of captionLines) {
          const start = proof.left + (contentWidth - l.width) / 2;
          let cursor = start;
          for (const run of l.runs) { draw(run.text, cursor, y, 9, run.face); cursor += measure(run.text, run.face, 9); }
          proof.lineCount++;
          y -= 13;
        }
        y -= leading * 0.7;
        opening = true;
        return;
      }
      if (node.type.name === "scene_break") {
        const following=index+1<doc.childCount?doc.child(index+1):null;
        const followingLines=following?.type.name==="paragraph" && following.textContent.trim()
          ? Math.min(2,wrap(units(following),0).length) : 0;
        const sceneRequired=3 + followingLines;
        if (slots() < sceneRequired && proof.lineCount>0) bodyPage();
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
        // Keep a subheading together with at least the first two lines of text.
        // If the following block is a non-text element, keep enough room for it to start.
        const next = index + 1 < doc.childCount ? doc.child(index + 1) : null;
        const nextLines = next?.type.name === "paragraph" && next.textContent.trim()
          ? Math.min(2, wrap(units(next), 0).length) : 0;
        const headingHeight = 10 + lines.length * 19 + 9;
        const required = headingHeight + nextLines * leading + (nextLines ? leading : 0);
        if (y - required < bottom + activeLayout.spaceAfter && proof.lineCount > 0)
          bodyPage();
        y -= 10;
        for (const l of lines) {
          line(l.runs, 0, 13, y, false, (node.attrs.align as TextAlignment | null) ?? "left");
          y -= 19;
        }
        y -= 9;
        opening = true;
        return;
      }
      if (!node.textContent.trim()) return;
      const blockAlignment = node.attrs.align as TextAlignment | null;
      const indent = blockAlignment ? 0 : opening ? 0 : (profile.firstLineIndent ?? 14);
      const lines = wrap(units(node), indent);
      // In Balanced mode, consider the last few *whole paragraphs* as a
      // group. Move them onto the following recto only when that page was
      // already necessary, the tail fits on it, and the estimated facing
      // page bottom disparity improves. No added leaves or moved headings.
      if (profile.layoutPriority === "balanced" && proof.kind === "body" &&
          proof.page % 2 === 0 && index < doc.childCount - 1 &&
          doc.childCount - index <= 4) {
        const tail:ManuscriptNode[] = [];
        for(let i=index;i<doc.childCount;i++)tail.push(doc.child(i));
        if(tail.every(p=>p.type.name==="paragraph"&&p.textContent.trim())) {
          const spacingSlots=Math.ceil((profile.paragraphSpacing??0)/leading);
          const tailLines=tail.reduce((total,p,i)=>
            total+(i===0?lines.length:wrap(units(p),p.attrs.align?0:(profile.firstLineIndent??14)).length)+spacingSlots,0);
          const nextSlots=Math.max(0,Math.floor(
            (HEIGHT-profile.top-size-bottom-activeLayout.spaceAfter)/leading)+1);
          if(shouldBalanceParagraphTail({
            page:proof.page,kind:proof.kind,writtenLines:proof.lineCount,
            remainingSlots:slots(),nextPageSlots:nextSlots,
            tailLines,tailParagraphs:tail.length,firstParagraphLines:lines.length
          }))bodyPage();
        }
      }
      // Keep a short chapter ending together when it would otherwise leave a
      // stranded final paragraph on a nearly full page. Limit the reservation
      // so longer endings do not cause excessive blank space.
      if (profile.layoutPriority !== "flow" && index === doc.childCount - 2) {
        const last = doc.child(index + 1);
        if (last.type.name === "paragraph" && last.textContent.trim()) {
          const finalLines = wrap(units(last), profile.firstLineIndent ?? 14).length;
          const endingLines = lines.length + finalLines;
          const cap = profile.layoutPriority === "balanced" ? 9 : 6;
          if (finalLines <= 3 && endingLines <= cap &&
              slots() < endingLines && proof.lineCount > 0)
            bodyPage();
        }
      }
      // A short paragraph looks better on one page; do not force overly long
      // paragraphs to stay together and leave an unnecessarily blank page.
      const keepLimit = profile.layoutPriority==="balanced" ? 6 : profile.layoutPriority==="flow" ? 2 : 4;
      if (lines.length <= keepLimit && slots() < lines.length && proof.lineCount > 0)
        bodyPage();
      let offset = 0;
      while (offset < lines.length) {
        let capacity = slots();
        const remaining = lines.length - offset;
        if (capacity === 0 || (capacity < 2 && remaining > 1)) {
          bodyPage();
          capacity = slots();
        }
        let count = Math.min(remaining, capacity);
        // Balanced pages favor three lines at both sides of a split when the
        // paragraph is long enough; the other modes preserve two-line minima.
        const minFragment = profile.layoutPriority === "balanced" && remaining >= 6 ? 3 : 2;
        if (remaining > count && remaining - count < minFragment)
          count = remaining - minFragment;
        // At the final paragraph of a section, a left (verso) body page and
        // the following right (recto) page form a physical spread. Prefer
        // a modestly earlier break only when it reduces their line-count
        // disparity. Keep at least three lines on either side and never
        // rebalance chapter openings or force additional pages.
        if (profile.layoutPriority === "balanced" && index === doc.childCount - 1 &&
            proof.kind === "body" && proof.page % 2 === 0 &&
            remaining > count && count >= 3) {
          const disparity = (leftCount:number) =>
            Math.abs((proof.lineCount + leftCount) - (remaining - leftCount));
          let best = count;
          for (let candidate = count - 1; candidate >= Math.max(3,count - 4); candidate--) {
            if (remaining - candidate < 3) continue;
            if (disparity(candidate) < disparity(best)) best = candidate;
          }
          count = best;
        }
        if (count < 1 || (remaining > count && count < minFragment)) {
          bodyPage();
          continue;
        }
        if (remaining > count && (count < 2 || remaining - count < 2))
          splitViolations++;
        for (let i = 0; i < count; i++) {
          const l = lines[offset + i];
          line(l.runs, l.indent, size, y,
            (blockAlignment === "justify" || (!blockAlignment && profile.alignment === "justify")) && offset + i < lines.length - 1,
            blockAlignment ?? "left");
          y -= leading;
        }
        offset += count;
        if (offset < lines.length) bodyPage();
      }
      y -= profile.paragraphSpacing ?? 0;
      opening = false;
    });
  }
  options.onProgress?.(82,"Finishing pagination");
  // Roman folios in front matter; Arabic numerals restart at 1 for main matter.
  const firstFront = pages.findIndex(p => p.chapterId && book.chapters.some(
    c => c.id === p.chapterId && sectionMatter(c.sectionType ?? "chapter") === "front"
  ) && p.kind !== "blank");
  const firstMain = pages.findIndex(p => p.chapterId && book.chapters.some(
    c => c.id === p.chapterId && sectionMatter(c.sectionType ?? "chapter") !== "front"
  ) && p.kind !== "blank");
  function roman(value: number): string {
    const symbols: [number,string][] = [[1000,"m"],[900,"cm"],[500,"d"],[400,"cd"],[100,"c"],[90,"xc"],[50,"l"],[40,"xl"],[10,"x"],[9,"ix"],[5,"v"],[4,"iv"],[1,"i"]];
    let result = "";
    for (const [amount,symbol] of symbols) while (value >= amount) { result += symbol; value -= amount; }
    return result;
  }
  function folio(index: number, sectionId?: string): string {
    const section = book.chapters.find(c => c.id === sectionId);
    const front = section && sectionMatter(section.sectionType ?? "chapter") === "front";
    if (front) return roman(index - (firstFront >= 0 ? firstFront : 0) + 1);
    return String(index - (firstMain >= 0 ? firstMain : 0) + 1);
  }
  for (const item of contentsPages) {
    proof = pages[item.index];
    page = pdf.getPage(item.index);
    activeLayout = getSectionLayout(book.chapters.find(c => c.id === proof.chapterId)!);
    y = HEIGHT - profile.top - 86 - activeLayout.spaceBefore;
    if (proof.kind === "chapter" && showSectionTitle(book.chapters.find(c => c.id === proof.chapterId)!)) {
      centered(textLines(proof.chapterTitle ?? "Contents", 18, "bold"), 18, 27);
      y -= 18;
    }
    for (const entry of item.entries) {
      const start = pages.findIndex(p => p.chapterId === entry.id && p.kind === "chapter");
      if (start < 0) throw Error("A table of contents entry has no printable page.");
      const pageLabel = folio(start, entry.id);
      const numberWidth = measure(pageLabel, "regular", 10);
      const reserved = numberWidth + 15;
      let label = entry.title;
      const labelWidth = contentWidth - reserved - 8;
      if (measure(label, "regular", 10) > labelWidth) {
        while (label && measure(label.trimEnd() + "...", "regular", 10) > labelWidth)
          label = label.slice(0, -1);
        label = label.trimEnd() + "...";
      }
      draw(label, proof.left, y, 10);
      draw(pageLabel, proof.right - numberWidth, y, 10);
      proof.lineCount++;
      y -= 21;
    }
  }
  if (pages.length % 2) newPage("blank");
  for (let i = 0; i < pages.length; i++) {
    proof = pages[i];
    page = pdf.getPage(i);
    if (proof.kind === "blank" || proof.kind === "title") continue;
    const section = book.chapters.find(c => c.id === proof.chapterId);
    const settings = section ? getSectionLayout(section) : activeLayout;
    const numbered = settings.pageNumber === "show" ||
      (settings.pageNumber === "auto" && !!section && sectionMatter(section.sectionType ?? "chapter") !== "front");
    if (numbered) {
    const number = folio(i, section?.id);
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
    }
    if (settings.header !== "hide" && (settings.header === "show" || proof.kind === "body") &&
        (settings.header === "show" || !section || getSectionLayout(section).header === "auto")) {
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
  // Add a cover and its unnumbered reverse *after* laying out the print interior.
  // Two front leaves preserve existing recto/verso chapter parity and interior folios.
  if (options.includeFrontCover && book.cover) {
    const decoded = decodeImage(book.cover.src);
    const art = decoded.mediaType === "image/png"
      ? await pdf.embedPng(decoded.bytes)
      : await pdf.embedJpg(decoded.bytes);
    const coverPage = pdf.insertPage(0, [WIDTH, HEIGHT]);
    const verso = pdf.insertPage(1, [WIDTH, HEIGHT]);
    for (const sheet of [coverPage, verso]) {
      sheet.setTrimBox(0, 0, WIDTH, HEIGHT);
      sheet.setBleedBox(0, 0, WIDTH, HEIGHT);
    }
    const scale = Math.min(WIDTH / art.width, HEIGHT / art.height);
    const coverWidth = art.width * scale, coverHeight = art.height * scale;
    coverPage.drawImage(art, {
      x: (WIDTH - coverWidth) / 2, y: (HEIGHT - coverHeight) / 2,
      width: coverWidth, height: coverHeight,
    });
    pages.unshift(
      {page:1,kind:"cover",left:0,right:WIDTH,lineCount:0,minX:0,maxX:0,minY:0,maxY:0},
      {page:2,kind:"blank",left:0,right:WIDTH,lineCount:0,minX:0,maxX:0,minY:0,maxY:0},
    );
    for (let i = 2; i < pages.length; i++) pages[i].page = i + 1;
    warnings.add("Front cover is for digital proofs only. Print retailers typically require separate full-wrap paperback cover artwork.");
  }
  const created = new Date(options.createdAt);
  if (!Number.isFinite(created.getTime()))
    throw Error("Invalid print build timestamp.");
  const inputChecksum = snapshotChecksum(book);
  pdf.setTitle(book.metadata?.subtitle ? `${book.title}: ${book.metadata.subtitle}` : book.title);
  pdf.setAuthor(book.author);
  if (book.metadata?.description) pdf.setSubject(book.metadata.description);
  pdf.setCreator("Book Formatter");
  pdf.setProducer(PRINT_RENDERER);
  pdf.setCreationDate(created);
  pdf.setModificationDate(created);
  pdf.setLanguage(book.language ?? "en");
  pdf.setKeywords([
    `${profile.template.id} ${profile.trim} no bleed`,
    `revision:${book.revision}`,
    `snapshot:${inputChecksum}`,
    ...(book.metadata?.isbn ? [`isbn:${normalizedIsbn(book.metadata.isbn)}`] : []),
    ...(book.metadata?.publisher ? [`publisher:${book.metadata.publisher}`] : []),
    ...(book.metadata?.seriesName ? [`series:${book.metadata.seriesName}${book.metadata.seriesNumber ? " #"+book.metadata.seriesNumber : ""}`] : []),
    ...(book.metadata?.publicationDate ? [`publication-date:${book.metadata.publicationDate}`] : []),
  ]);
  options.onProgress?.(92,"Writing PDF");
  const bytes = await pdf.save({ useObjectStreams: false });
  const filename = `${book.title.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 100) || "book"}${profile.template.id === "classic" ? "" : `-${profile.template.id}`}${options.includeFrontCover ? "-with-cover" : ""}-${profile.trim}-proof.pdf`;
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
      includeFrontCover: Boolean(options.includeFrontCover),
      filename,
      checks: { overflow: 0, splitViolations, fonts: "embedded" },
      warnings: [...warnings],
      pages,
    },
  };
}
