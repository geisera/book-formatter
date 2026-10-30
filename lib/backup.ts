import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import {
  type Book,
  type SourceFile,
  validateBook,
  validateSource,
  newId,
} from "./model";
export function backupBook(book: Book, source?: SourceFile): Uint8Array {
  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(
      JSON.stringify({
        format: "book-formatter",
        version: 1,
        source: source ? "source/original" : undefined,
      }),
    ),
    "manuscript.json": strToU8(JSON.stringify(validateBook(book))),
  };
  if (book.importInfo && !source)
    throw Error(
      "The original manuscript file is required for a complete backup.",
    );
  if (source) {
    validateSource(book, source);
    files["source/original"] = source.bytes;
    files["source.json"] = strToU8(
      JSON.stringify({ filename: source.filename, format: source.format }),
    );
  }
  if (
    Object.values(files).reduce((total, file) => total + file.length, 0) >
    50_000_000
  )
    throw Error(
      "This project exceeds the 50 MB expanded backup limit. A restorable backup could not be created.",
    );
  const bytes = zipSync(files);
  if (bytes.length > 20_000_000)
    throw Error(
      "This backup exceeds 20 MB. Keep the original file separately.",
    );
  return bytes;
}
export function restoreProject(bytes: Uint8Array): {
  book: Book;
  source?: SourceFile;
} {
  if (bytes.length > 20_000_000)
    throw Error("Backup exceeds the 20 MB foundation limit.");
  let total = 0,
    count = 0;
  const names = new Set<string>();
  const files = unzipSync(bytes, {
    filter: (file) => {
      total += file.originalSize;
      if (++count > 100 || total > 50_000_000)
        throw Error("Expanded backup exceeds safe limits.");
      if (
        names.has(file.name) ||
        file.name.includes("\\") ||
        file.name.startsWith("/") ||
        file.name.split("/").includes("..")
      )
        throw Error("Unsafe or duplicate backup entry.");
      names.add(file.name);
      return [
        "manifest.json",
        "manuscript.json",
        "source.json",
        "source/original",
      ].includes(file.name);
    },
  });
  if (!files["manifest.json"] || !files["manuscript.json"])
    throw Error("Missing backup files.");
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  if (manifest.format !== "book-formatter" || manifest.version !== 1)
    throw Error("Unsupported backup format.");
  const original = validateBook(
    JSON.parse(strFromU8(files["manuscript.json"])),
  );
  const book = {
    ...original,
    id: newId(),
    revision: 0,
    chapters: original.chapters.map((c) => ({ ...c, id: newId() })),
  };
  if (!manifest.source) {
    if (original.importInfo)
      throw Error(
        "Imported project backup is missing its original source file.",
      );
    return { book };
  }
  if (
    manifest.source !== "source/original" ||
    !files["source/original"] ||
    !files["source.json"]
  )
    throw Error("The original source file is missing from this backup.");
  const meta = JSON.parse(strFromU8(files["source.json"]));
  if (
    typeof meta.filename !== "string" ||
    !["docx", "markdown", "text"].includes(meta.format) ||
    files["source/original"].length > 10_000_000
  )
    throw Error("Invalid source file in backup.");
  const source: SourceFile = {
    bookId: book.id,
    filename: meta.filename,
    format: meta.format,
    bytes: files["source/original"],
  };
  validateSource(book, source);
  return { book, source };
}
export function restoreBook(bytes: Uint8Array): Book {
  return restoreProject(bytes).book;
}
