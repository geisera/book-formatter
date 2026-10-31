import { describe, it, expect } from "vitest";
import { createBook, blankChapter, validateBook, showSectionTitle, defaultShowSectionTitle, getSectionLayout } from "../lib/model";
import { changeStructure, orderedSections, sectionGroups } from "../lib/structure";
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

describe("continuous book section numbering", () => {
  it("numbers front matter first, followed continuously by body and back matter", () => {
    let book = createBook("Book", "Author");
    book = changeStructure(book, {kind:"add", title:"Afterword", sectionType:"about-author"}).book;
    book = changeStructure(book, {kind:"add", title:"Copyright", sectionType:"copyright"}).book;
    book = changeStructure(book, {kind:"add", title:"Preface", sectionType:"preface"}).book;
    expect(orderedSections(book).map((c, i) => `${i + 1}. ${c.title}`)).toEqual([
      "1. Copyright", "2. Preface", "3. Chapter One", "4. Afterword",
    ]);
    expect(book.chapters).toEqual(orderedSections(book));
    const id = book.chapters[1].id;
    book = changeStructure(book, {kind:"move", id, to:0}).book;
    expect(book.chapters.map((c, i) => `${i + 1}. ${c.title}`)).toEqual([
      "1. Preface", "2. Copyright", "3. Chapter One", "4. Afterword",
    ]);
  });
  it("moves sections between matter groups when their type changes, then renumbers", () => {
    let book = createBook("Book", "Author");
    book = changeStructure(book, {kind:"add", title:"Acknowledgments", sectionType:"acknowledgments"}).book;
    const id = book.chapters[1].id;
    book = changeStructure(book, {kind:"type", id, sectionType:"dedication"}).book;
    expect(book.chapters.map(c => c.title)).toEqual(["Acknowledgments", "Chapter One"]);
    expect(orderedSections(book).map((c,i) => [i+1,c.id])).toEqual([[1,id],[2,book.chapters[1].id]]);
    expect(() => changeStructure(book, {kind:"move", id, to:1})).toThrow("Change the section type");
    expect(restoreBook(backupBook(book)).chapters.map(c => c.title)).toEqual(["Acknowledgments", "Chapter One"]);
  });
  it("normalizes old mixed-order sections without altering their content or identity", () => {
    const book = createBook("Book","Author");
    const body = book.chapters[0];
    const front = {...blankChapter("Dedication"), sectionType:"dedication" as const};
    const back = {...blankChapter("Author biography"), sectionType:"about-author" as const};
    book.chapters = [body,back,front];
    expect(orderedSections(book).map(c => c.title)).toEqual(["Dedication","Chapter One","Author biography"]);
    const updated = changeStructure(book, {kind:"rename", id: body.id, title:"Opening"}).book;
    expect(updated.chapters.map(c => c.title)).toEqual(["Dedication","Opening","Author biography"]);
    expect(updated.chapters.find(c => c.id === body.id)?.content).toEqual(body.content);
  });
});

describe("per-section title visibility", () => {
  it("defaults by section type while keeping pre-existing chapters visible", () => {
    expect(defaultShowSectionTitle("chapter")).toBe(true);
    expect(defaultShowSectionTitle("acknowledgments")).toBe(true);
    for (const type of ["dedication", "epigraph", "copyright", "title"] as const)
      expect(defaultShowSectionTitle(type)).toBe(false);
    const book = createBook("Book", "Author");
    expect(showSectionTitle(book.chapters[0])).toBe(true);
    const dedication = changeStructure(book, {kind:"add", title:"For readers", sectionType:"dedication"}).book;
    expect(showSectionTitle(dedication.chapters[0])).toBe(false);
  });
  it("stores explicit overrides through reordering and project backup/restore", () => {
    let book = createBook("Book", "Author");
    book.chapters[0].content = {type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"Original text"}]}]};
    const id = book.chapters[0].id;
    book = changeStructure(book,{kind:"visibility",id,showTitle:false}).book;
    expect(showSectionTitle(book.chapters[0])).toBe(false);
    book = changeStructure(book,{kind:"add",title:"Dedication",sectionType:"dedication"}).book;
    const firstId = book.chapters[0].id;
    book = changeStructure(book,{kind:"visibility",id:firstId,showTitle:true}).book;
    expect(book.chapters.map(showSectionTitle)).toEqual([true,false]);
    const restored = restoreBook(backupBook(book));
    expect(restored.chapters.map(showSectionTitle)).toEqual([true,false]);
    expect(restored.chapters[1].content).toEqual(book.chapters[1].content);
    expect(() => validateBook({...book,chapters:[{...book.chapters[0],showTitle:"maybe"}]})).toThrow("Invalid chapter structure");
  });
  it("recomputes defaults on type change until explicitly overridden", () => {
    let book = createBook("Book", "Author");
    const id = book.chapters[0].id;
    book = changeStructure(book,{kind:"type",id,sectionType:"copyright"}).book;
    expect(showSectionTitle(book.chapters[0])).toBe(false);
    book = changeStructure(book,{kind:"visibility",id,showTitle:true}).book;
    book = changeStructure(book,{kind:"type",id,sectionType:"dedication"}).book;
    expect(showSectionTitle(book.chapters[0])).toBe(true);
  });
});

describe("section page layout settings", () => {
  it("uses publishing defaults without changing existing projects", () => {
    const book=createBook("Book","Author");
    expect(getSectionLayout(book.chapters[0])).toMatchObject({start:"recto",vertical:"top",header:"auto",pageNumber:"auto",spaceBefore:0});
    const dedication=changeStructure(book,{kind:"add",title:"Dedication",sectionType:"dedication"}).book.chapters[0];
    expect(getSectionLayout(dedication)).toMatchObject({start:"next",vertical:"center",header:"hide",pageNumber:"hide"});
  });
  it("saves overridden layout through reorder and backup", () => {
    let b=createBook("Book","Author");
    const id=b.chapters[0].id;
    b=changeStructure(b,{kind:"layout",id,changes:{start:"verso",vertical:"bottom",header:"hide",pageNumber:"show",spaceBefore:12,spaceAfter:18}}).book;
    b=changeStructure(b,{kind:"add",title:"End",sectionType:"about-author"}).book;
    b=changeStructure(b,{kind:"move",id,to:0}).book;
    const restored=restoreBook(backupBook(b));
    expect(getSectionLayout(restored.chapters[0])).toEqual(getSectionLayout(b.chapters[0]));
    expect(getSectionLayout(restored.chapters[0]).start).toBe("verso");
    expect(() => validateBook({...b,chapters:[{...b.chapters[0],pageLayout:{start:"unbounded"}}]})).toThrow("Invalid section page layout");
    expect(() => validateBook({...b,chapters:[{...b.chapters[0],pageLayout:{spaceAfter:121}}]})).toThrow("Invalid section page layout");
  });
});

describe("matter-safe organization and layout defaults", () => {
  it("inserts new front and back matter into the correct group", () => {
    let book=createBook("Book","Author");
    book=changeStructure(book,{kind:"add",title:"About",sectionType:"about-author"}).book;
    book=changeStructure(book,{kind:"add",title:"Dedication",sectionType:"dedication"}).book;
    expect(book.chapters.map(c=>c.title)).toEqual(["Dedication","Chapter One","About"]);
    const bodyId=book.chapters[1].id;
    book=changeStructure(book,{kind:"add",title:"Two",sectionType:"chapter",after:bodyId}).book;
    expect(book.chapters.map(c=>c.title)).toEqual(["Dedication","Chapter One","Two","About"]);
  });
  it("rejects a merge across different matter groups without modifying the original", () => {
    let book=createBook("Book","Author");
    book=changeStructure(book,{kind:"add",title:"Back",sectionType:"about-author"}).book;
    const id=book.chapters[0].id;
    expect(()=>changeStructure(book,{kind:"merge",id})).toThrow("Cannot merge");
    expect(book.chapters).toHaveLength(2);
  });
  it("restores default section layout without changing text or title", () => {
    let book=createBook("Book","Author");
    const id=book.chapters[0].id;
    book=changeStructure(book,{kind:"layout",id,changes:{start:"verso",spaceBefore:22}}).book;
    const before=structuredClone(book.chapters[0].content);
    book=changeStructure(book,{kind:"reset-layout",id}).book;
    expect(getSectionLayout(book.chapters[0]).start).toBe("recto");
    expect(getSectionLayout(book.chapters[0]).spaceBefore).toBe(0);
    expect(book.chapters[0].content).toEqual(before);
  });
});
