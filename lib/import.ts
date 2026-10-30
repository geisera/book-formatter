import { decodeImage, MAX_PROJECT_IMAGES_BYTES } from "./images";
import { unified } from "unified";
import remarkParse from "remark-parse";
import rehypeParse from "rehype-parse";
import { strFromU8, unzipSync } from "fflate";
import mammoth from "mammoth";
import {
  blockText,
  type Diagnostic,
  type Inline,
  type ImportBlock,
  type ImportDraft,
} from "./import-model";
export const MAX_SOURCE_BYTES = 10_000_000;

type Ast = {
  type: string;
  tagName?: string;
  value?: string;
  depth?: number;
  alt?: string | null;
  properties?: Record<string, unknown>;
  children?: Ast[];
};
const scene = /^(?:(?:\*\s*){3,}|(?:_\s*){3,}|(?:-\s*){3,}|(?:#\s*){3,})$/;
const chapterName =
  /^(?:(?:chapter|part|book)\s+(?:\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)(?:\s*[:.\-–—]\s*.+)?|prologue|epilogue|interlude|preface|foreword|dedication|acknowledg(?:e)?ments|about the author)$/i;
function paragraph(text: string): ImportBlock {
  return {
    type: "paragraph",
    ...(text ? { content: [{ type: "text", text }] } : {}),
  };
}
function diagnostic(
  d: Diagnostic[],
  message: string,
  severity: Diagnostic["severity"] = "warning",
) {
  if (!d.some((x) => x.message === message)) d.push({ severity, message });
}

// No DOM insertion or resource loading: only allowlisted semantic text reaches the editor.
function fromAst(
  root: Ast,
  html: boolean,
  diagnostics: Diagnostic[],
): ImportBlock[] {
  const blocks: ImportBlock[] = [];
  let visited = 0;
  let importedImages = 0;
  let importedImageBytes = 0;
  function check(depth: number) {
    if (++visited > 500_000 || depth > 100)
      throw Error(
        "The manuscript is too deeply nested or complex to import safely.",
      );
  }
  function imageBlock(node: Ast): ImportBlock | null {
    if (!html || node.tagName !== "img") return null;
    const src = node.properties?.src;
    if (typeof src !== "string" || !src.startsWith("data:image/")) return null;
    try {
      const decoded = decodeImage(src);
      importedImageBytes += src.length;
      if (importedImageBytes > MAX_PROJECT_IMAGES_BYTES)
        throw Error("DOCX embedded images exceed the 12 MB project limit. Resize the images and try again.");
      importedImages++;
      const alt = typeof node.properties?.alt === "string" && node.properties.alt.trim()
        ? node.properties.alt.trim().slice(0,500) : `Imported illustration ${importedImages}`;
      if (!node.properties?.alt) diagnostic(diagnostics, "Some imported images had no alternative text. Review their descriptions.");
      return {type:"image", attrs:{src,alt,width:100,align:"center",caption:""}};
    } catch(error) {
      if (error instanceof Error && error.message.includes("12 MB project limit")) throw error;
      diagnostic(diagnostics, "An embedded image could not be imported (unsupported or over 1.5 MB); a placeholder was retained.");
      return null;
    }
  }
  function inline(
    node: Ast,
    marks: ("em" | "strong")[] = [],
    depth = 0,
  ): Inline[] {
    check(depth);
    const kind = html ? (node.tagName ?? node.type) : node.type;
    if (kind === "text" || kind === "inlineCode") {
      if (kind === "inlineCode")
        diagnostic(diagnostics, "Code styling was converted to ordinary text.");
      return node.value
        ? [
            {
              type: "text",
              text: node.value,
              ...(marks.length
                ? { marks: [...new Set(marks)].map((type) => ({ type })) }
                : {}),
            },
          ]
        : [];
    }
    if (
      kind === "script" ||
      kind === "style" ||
      kind === "iframe" ||
      kind === "object" ||
      kind === "embed"
    ) {
      diagnostic(
        diagnostics,
        "Executable or embedded HTML was removed; review the original file.",
      );
      return [];
    }
    if (kind === "html") {
      diagnostic(
        diagnostics,
        "Raw HTML was retained as literal text, without executing it.",
      );
      return node.value ? [{ type: "text", text: node.value }] : [];
    }
    if (kind === "img" || kind === "image" || kind === "imageReference") {
      diagnostic(
        diagnostics,
        "Images are represented by text placeholders. The original file is retained for later image support.",
      );
      return [
        {
          type: "text",
          text: `[Image: ${String(html ? (node.properties?.alt ?? "no description") : (node.alt ?? "no description"))}]`,
        },
      ];
    }
    if (kind === "br" || kind === "break")
      return [{ type: "text", text: "\n" }];
    if (["a", "link", "linkReference"].includes(kind))
      diagnostic(
        diagnostics,
        "Hyperlink labels were preserved as text; links are not active in this editor.",
      );
    const next =
      kind === "strong" || kind === "b"
        ? [...marks, "strong" as const]
        : kind === "emphasis" || kind === "em" || kind === "i"
          ? [...marks, "em" as const]
          : marks;
    if (["del", "s", "sup", "sub", "code"].includes(kind))
      diagnostic(
        diagnostics,
        "Strikethrough, superscript, subscript or code styling was converted to ordinary text.",
      );
    return (node.children ?? []).flatMap((c) => inline(c, next, depth + 1));
  }
  function visit(node: Ast, depth = 0) {
    check(depth);
    const kind = html ? (node.tagName ?? node.type) : node.type;
    const heading = html ? /^h[1-6]$/.test(kind) : kind === "heading";
    if (heading || kind === "p" || kind === "paragraph") {
      // Mammoth emits images inline within <p>. Split at each image while keeping
      // its exact reading position relative to the surrounding text.
      const nodes = node.children ?? [];
      const hasImages = html && nodes.some(c => c.tagName === "img");
      if (hasImages) {
        let pending: Inline[] = [];
        const flush = () => {
          if (pending.some(c => c.text.trim()))
            blocks.push({type: heading ? "heading" : "paragraph",
              ...(heading ? {level: Number(kind[1])} : {}), content:pending});
          pending = [];
        };
        for (const child of nodes) {
          if (child.tagName === "img") {
            flush();
            const image = imageBlock(child);
            if (image) blocks.push(image);
            else pending.push(...inline(child, [], depth + 1));
          } else pending.push(...inline(child, [], depth + 1));
        }
        flush();
        return;
      }
      const content = nodes.flatMap((c) => inline(c, [], depth + 1));
      const text = content.map(c => c.text).join("").trim();
      if (html && !heading && blocks.at(-1)?.type === "image" &&
          /^(?:Figure|Fig\\.|Illustration|Plate)\\s+[0-9IVXLCDM]+\\s*[:.\\-–—]\\s*\\S/i.test(text) &&
          text.length <= 1000) {
        blocks[blocks.length - 1].attrs!.caption = text;
        return;
      }
      if (scene.test(text)) blocks.push({ type: "scene_break" });
      else blocks.push({
        type: heading ? "heading" : "paragraph",
        ...(heading ? { level: html ? Number(kind[1]) : (node.depth ?? 1) } : {}),
        ...(content.length ? { content } : {}),
      });
      return;
    }
    if (kind === "hr" || kind === "thematicBreak") {
      blocks.push({ type: "scene_break" });
      return;
    }
    if (kind === "definition") {
      diagnostic(
        diagnostics,
        "Link definitions were omitted; hyperlink labels remain as ordinary text.",
      );
      return;
    }
    if (kind === "code") {
      diagnostic(diagnostics, "Code blocks were converted to ordinary text.");
      blocks.push(paragraph(node.value ?? ""));
      return;
    }
    if (kind === "blockquote")
      diagnostic(
        diagnostics,
        "Block quotes retain their text but not quotation layout.",
      );
    if (["ul", "ol", "list"].includes(kind))
      diagnostic(
        diagnostics,
        "Lists were converted to paragraphs; numbering and list layout need review.",
      );
    if (kind === "table")
      diagnostic(
        diagnostics,
        "Tables were flattened into row paragraphs with cell separators; review their layout.",
      );
    if (kind === "tr") {
      blocks.push({
        type: "paragraph",
        content: (node.children ?? [])
          .filter((c) => c.tagName === "td" || c.tagName === "th")
          .flatMap((c, i) => [
            ...(i ? [{ type: "text" as const, text: " | " }] : []),
            ...inline(c, [], depth + 1),
          ]),
      });
      return;
    }
    if (
      ["html", "script", "style", "iframe", "object", "embed"].includes(kind) &&
      kind !== "html" /* HTML AST root is named root */
    ) {
      inline(node, [], depth + 1);
      return;
    }
    if (kind === "html" && !html) {
      blocks.push(paragraph(node.value ?? ""));
      diagnostic(
        diagnostics,
        "Raw HTML was retained as literal text, without executing it.",
      );
      return;
    }
    if (kind === "text" && node.value?.trim()) {
      blocks.push(paragraph(node.value));
      return;
    }
    if (kind === "img") {
      const embedded = imageBlock(node);
      if (embedded) blocks.push(embedded);
      else blocks.push({ type: "paragraph", content: inline(node, [], depth + 1) });
      return;
    }
    for (const child of node.children ?? []) visit(child, depth + 1);
  }
  visit(root);
  return blocks;
}

export function parseMarkdown(
  text: string,
  filename = "manuscript.md",
): ImportDraft {
  const diagnostics: Diagnostic[] = [];
  const blocks = fromAst(
    unified().use(remarkParse).parse(text) as Ast,
    false,
    diagnostics,
  );
  if (/^\s*\|.*\|\s*$/m.test(text))
    diagnostic(
      diagnostics,
      "Markdown tables are imported as ordinary text; table layout is not supported.",
    );
  return finish({ filename, format: "markdown", blocks, diagnostics });
}
export function parsePlainText(
  text: string,
  filename = "manuscript.txt",
): ImportDraft {
  const blocks: ImportBlock[] = [];
  let lines: string[] = [];
  const flush = () => {
    if (lines.length) {
      blocks.push(paragraph(lines.join("\n")));
      lines = [];
    }
  };
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (scene.test(trimmed)) {
      flush();
      blocks.push({ type: "scene_break" });
      continue;
    }
    if (trimmed.length <= 120 && chapterName.test(trimmed)) {
      flush();
      blocks.push({
        type: "heading",
        level: 1,
        content: [{ type: "text", text: trimmed }],
      });
      continue;
    }
    lines.push(line);
  }
  flush();
  return finish({
    filename,
    format: "text",
    blocks,
    diagnostics: [
      {
        severity: "info",
        message:
          "Plain text has no emphasis information. Short chapter labels and blank-line paragraph boundaries were detected.",
      },
    ],
  });
}
export function parseConvertedHtml(
  html: string,
  filename: string,
  diagnostics: Diagnostic[] = [],
): ImportDraft {
  return finish({
    filename,
    format: "docx",
    blocks: fromAst(
      unified().use(rehypeParse, { fragment: true }).parse(html) as Ast,
      true,
      diagnostics,
    ),
    diagnostics,
  });
}
function finish(draft: ImportDraft): ImportDraft {
  if (!draft.blocks.some((b) => b.type === "heading"))
    diagnostic(
      draft.diagnostics,
      "No chapter headings were detected. This manuscript will import as a single section.",
      "info",
    );
  if (!draft.blocks.some((b) => blockText(b).trim() || b.type === "image"))
    throw Error("No readable manuscript text was found.");
  if (draft.blocks.length > 100_000)
    throw Error("This manuscript has too many paragraphs to import safely.");
  return draft;
}

export function inspectDocx(bytes: Uint8Array): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const names = new Set<string>();
  let expanded = 0,
    count = 0;
  const files = unzipSync(bytes, {
    filter: (file) => {
      if (++count > 5000) throw Error("DOCX archive contains too many files.");
      if (
        file.name.startsWith("/") ||
        file.name.includes("\\") ||
        file.name.split("/").includes("..") ||
        /^[a-z]:/i.test(file.name) ||
        names.has(file.name)
      )
        throw Error("DOCX archive contains unsafe or duplicate paths.");
      names.add(file.name);
      expanded += file.originalSize;
      if (
        file.originalSize > 15_000_000 ||
        expanded > 40_000_000 ||
        file.originalSize > Math.max(file.size, 1) * 1000
      )
        throw Error(
          "DOCX archive exceeds safe expansion limits (40 MB total, 15 MB per file).",
        );
      return /\.(?:xml|rels)$/.test(file.name);
    },
  });
  if (!names.has("[Content_Types].xml") || !names.has("word/document.xml"))
    throw Error("This ZIP is not a supported DOCX manuscript.");
  for (const [name, bytes] of Object.entries(files)) {
    const xml = strFromU8(bytes);
    if (/<!DOCTYPE|<!ENTITY/i.test(xml))
      throw Error(
        "DOCX files containing XML entities or doctypes are not supported.",
      );
    if (/word\/(?:header|footer|comments)/.test(name))
      diagnostic(
        diagnostics,
        "Headers, footers and comments are not imported into the manuscript; they remain in the original file.",
      );
    if (/<w:(?:ins|del|moveFrom|moveTo)\b/.test(xml))
      diagnostic(
        diagnostics,
        "Tracked changes were found. Conversion may include inserted text and omit deleted text; review against the original file.",
      );
    if (/<m:oMath|<w:altChunk|<w:object/.test(xml))
      diagnostic(
        diagnostics,
        "Equations, embedded objects or attached content may not be represented. Review the retained original file.",
      );
  }
  return diagnostics;
}

export async function importBytes(
  bytes: Uint8Array,
  filename: string,
): Promise<ImportDraft> {
  if (bytes.length > MAX_SOURCE_BYTES)
    throw Error("Choose a manuscript smaller than 10 MB.");
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "docx") {
    const diagnostics = inspectDocx(bytes);
    const input = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;
    // Browser bundle uses Mammoth's browser file adapter, which cannot open linked files.
    const result = await mammoth.convertToHtml(
      { arrayBuffer: input },
      {
        externalFileAccess: false,
        includeEmbeddedStyleMap: false,
        convertImage: mammoth.images.imgElement(async (image) => {
          if (!["image/png","image/jpeg"].includes(image.contentType)) {
            diagnostic(diagnostics, "Unsupported DOCX image types were kept as text placeholders.");
            return {src:""};
          }
          const base64 = await image.read("base64");
          if (base64.length > 2_000_000) {
            diagnostic(diagnostics, "DOCX images larger than 1.5 MB were kept as placeholders.");
            return {src:""};
          }
          return {src:`data:${image.contentType};base64,${base64}`};
        }),
      },
    );
    if (result.messages.some((m) => m.type === "error"))
      throw Error(
        "DOCX conversion could not safely finish. Save a fresh DOCX copy and try again.",
      );
    for (const message of result.messages)
      diagnostic(diagnostics, message.message);
    return parseConvertedHtml(result.value, filename, diagnostics);
  }
  if (!["txt", "md", "markdown"].includes(ext ?? ""))
    throw Error("Choose a .docx, .md, .markdown or .txt file.");
  let text: string;
  try {
    const encoding =
      bytes[0] === 0xff && bytes[1] === 0xfe
        ? "utf-16le"
        : bytes[0] === 0xfe && bytes[1] === 0xff
          ? "utf-16be"
          : "utf-8";
    text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    throw Error(
      "The text file has an unsupported encoding. Save it as UTF-8 and try again.",
    );
  }
  if (text.includes("\0"))
    throw Error(
      "The text file appears to contain binary data. Save it as UTF-8 and try again.",
    );
  return ext === "txt"
    ? parsePlainText(text, filename)
    : parseMarkdown(text, filename);
}
