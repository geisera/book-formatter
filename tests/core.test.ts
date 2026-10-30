import "fake-indexeddb/auto";
import {describe,it,expect,afterEach} from "vitest";
import {createBook,validateBook} from "../lib/model";
import {db,saveBook} from "../lib/storage";
import {backupBook,restoreBook} from "../lib/backup";
afterEach(()=>db.books.clear());
describe("local project integrity",()=>{
 it("round trips a backup into an independent book",()=>{const b=createBook("A book","Tony");b.chapters[0].content={type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"A bold opening",marks:[{type:"strong"}]}]}]};const restored=restoreBook(backupBook(b));expect(restored.id).not.toBe(b.id);expect(restored.chapters[0].content).toEqual(b.chapters[0].content)});
 it("rejects invalid chapter content",()=>{const b=createBook("Bad","");b.chapters[0].content={type:"unknown"};expect(()=>validateBook(b)).toThrow()});
 it("preserves committed work on a conflicting save",async()=>{const b=createBook("Novel","");const saved=await saveBook(b,0);await saveBook({...saved,title:"Other tab"},1);await expect(saveBook({...saved,title:"Stale"},1)).rejects.toThrow("another tab");expect((await db.books.get(b.id))?.title).toBe("Other tab")});
});
