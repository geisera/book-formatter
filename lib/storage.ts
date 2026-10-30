import Dexie, { type EntityTable } from "dexie";
import { type Book, validateBook } from "./model";
export const db = new Dexie("book-formatter") as Dexie & {books:EntityTable<Book,"id">};
db.version(1).stores({books:"id, updatedAt"});
export async function saveBook(book:Book,expectedRevision:number):Promise<Book>{return db.transaction("rw",db.books,async()=>{const old=await db.books.get(book.id);if(old&&old.revision!==expectedRevision)throw Error("This book changed in another tab. Back up this copy, then reload to continue safely.");const saved=validateBook({...book,revision:expectedRevision+1,updatedAt:new Date().toISOString()});await db.books.put(saved);return saved})}
