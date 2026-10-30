import { describe, it, expect } from "vitest";
import { createBook, blankChapter, validateBook } from "../lib/model";
import { changeStructure, sectionGroups } from "../lib/structure";
import { backupBook, restoreBook } from "../lib/backup";
describe("book structure editor", () => {
  it("reorders and renames by stable identity without changing manuscript text", () => {
    let book = createBook("Title", "Author");
    book.chapters = [blankChapter("One"), blankChapter("Two"), blankChapter("Three")];
    const id = book.chapters[0].id;
    const content = structuredClone(book.chapters[0].content);
    book = changeStructure(book, { kind:"move", id, to:2 }).book;
    expect(book.chapters.map(c => c.title)).toEqual(["Two","Three","One"]);
    book = changeStructure(book, { kind:"rename", id, title:"Finale" }).book;
    expect(book.chapters[2].id).toBe(id);
    expect(book.chapters[2].content).toEqual(content);
  });
  it("inserts typed matter, persists through backup and restores stable relative order", () => {
    let book = createBook("Title", "Author");
    book = changeStructure(book, { kind:"add", title:"Copyright", sectionType:"copyright" }).book;
    book = changeStructure(book, { kind:"add", title:"About Author", sectionType:"about-author" }).book;
    expect(sectionGroups(book).front).toHaveLength(1);
    expect(sectionGroups(book).body).toHaveLength(1);
    expect(sectionGroups(book).back).toHaveLength(1);
    expect(validateBook(book)).toBe(book);
    const restored = restoreBook(backupBook(book));
    expect(restored.chapters.map(c=>[c.title,c.sectionType])).toEqual(book.chapters.map(c=>[c.title,c.sectionType]));
    expect(new Set(restored.chapters.map(c=>c.id)).size).toBe(3);
    expect(restored.chapters[0].id).not.toBe(book.chapters[0].id);
  });
  it("splits between blocks and merges preserving all block content", () => {
    let book = createBook("Title", "Author");
    book.chapters[0].content = { type:"doc", content:[
      {type:"paragraph",content:[{type:"text",text:"Alpha"}]},
      {type:"paragraph",content:[{type:"text",text:"Beta"}]},
      {type:"paragraph",content:[{type:"text",text:"Gamma"}]},
    ]};
    const id = book.chapters[0].id;
    const before = structuredClone(book.chapters[0].content);
    book = changeStructure(book,{kind:"split",id,blockIndex:1,title:"Part 2"}).book;
    expect(book.chapters).toHaveLength(2);
    expect(book.chapters[0].id).toBe(id);
    book = changeStructure(book,{kind:"merge",id}).book;
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0].content).toEqual(before);
  });
  it("rejects invalid operations and preserves a nonempty book", () => {
    const book = createBook("Title","Author");
    const id = book.chapters[0].id;
    expect(() => changeStructure(book,{kind:"delete",id})).toThrow("at least one");
    expect(() => changeStructure(book,{kind:"move",id,to:5})).toThrow("destination");
    expect(() => changeStructure(book,{kind:"split",id,blockIndex:0,title:"Other"})).toThrow("Split");
    expect(() => validateBook({ ...book, chapters:[{...book.chapters[0],sectionType:"invalid"}]})).toThrow("Invalid chapter structure");
  });
});
