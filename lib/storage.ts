import Dexie, { type EntityTable } from "dexie";
import {
  type Book,
  type SourceFile,
  validateBook,
  validateSource,
} from "./model";
export const db = new Dexie("book-formatter") as Dexie & {
  books: EntityTable<Book, "id">;
  sources: EntityTable<SourceFile, "bookId">;
};
db.version(1).stores({ books: "id, updatedAt" });
db.version(2).stores({ sources: "bookId" });
export async function saveImportedBook(
  book: Book,
  source?: SourceFile,
): Promise<Book> {
  return db.transaction("rw", db.books, db.sources, async () => {
    if (await db.books.get(book.id))
      throw Error("A book with this identity already exists.");
    const saved = validateBook({
      ...book,
      revision: 1,
      updatedAt: new Date().toISOString(),
    });
    if (book.importInfo && !source)
      throw Error("The original file is required to save this imported book.");
    if (source) {
      validateSource(saved, source);
      await db.sources.add(source);
    }
    await db.books.add(saved);
    return saved;
  });
}

export async function saveBook(
  book: Book,
  expectedRevision: number,
): Promise<Book> {
  return db.transaction("rw", db.books, async () => {
    const old = await db.books.get(book.id);
    if (old && old.revision !== expectedRevision)
      throw Error(
        "This book changed in another tab. Back up this copy, then reload to continue safely.",
      );
    const saved = validateBook({
      ...book,
      revision: expectedRevision + 1,
      updatedAt: new Date().toISOString(),
    });
    await db.books.put(saved);
    return saved;
  });
}
