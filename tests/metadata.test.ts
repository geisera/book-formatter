import {describe,it,expect} from "vitest";
import {strFromU8,unzipSync} from "fflate";
import {createBook,validateBook} from "../lib/model";
import {validIsbn13,validPublicationDate,validatePublicationMetadata} from "../lib/publication-metadata";
import {backupBook,restoreProject} from "../lib/backup";
import {buildEpub} from "../lib/epub";
describe("publication metadata",()=>{
 it("checks ISBN-13 checksum, normalized hyphens and real calendar dates",()=>{
  expect(validIsbn13("978-0-306-40615-7")).toBe(true);
  expect(validIsbn13("978-0-306-40615-8")).toBe(false);
  expect(validIsbn13("1234567890123")).toBe(false);
  expect(validPublicationDate("2028-02-29")).toBe(true);
  expect(validPublicationDate("2027-02-29")).toBe(false);
  expect(validPublicationDate("2026-13-01")).toBe(false);
 });
 it("round-trips metadata in project backup without rewriting chapters",()=>{
  const book=createBook("First title","A. Writer");
  const chapter=structuredClone(book.chapters);
  book.metadata={subtitle:"A & B",seriesName:"Chronicles",seriesNumber:"2.5",publisher:"North & South",isbn:"978-0-306-40615-7",description:"A synopsis <with markup>",publicationDate:"2026-10-31"};
  expect(validateBook(book)).toBe(book);
  const restored=restoreProject(backupBook(book)).book;
  expect(restored.metadata).toEqual(book.metadata);
  expect(restored.chapters.map(c=>c.content)).toEqual(chapter.map(c=>c.content));
  expect(()=>validateBook({...book,metadata:{isbn:"978-0-306-40615-8"}})).toThrow("ISBN");
  expect(()=>validatePublicationMetadata({seriesNumber:"2"})).toThrow("series name");
  expect(()=>validatePublicationMetadata({publicationDate:"2026-02-30"})).toThrow("Publication date");
  expect(()=>validatePublicationMetadata({description:"x".repeat(4001)})).toThrow("description");
 });
 it("writes well-formed escaped EPUB metadata and leaves title page content untouched",()=>{
  const book=createBook("Main book","Author");
  book.chapters[0].content={type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"An opening."}]}]};
  book.editions!.ebook.bodyFont="georgia";
  book.metadata={subtitle:"A & B",seriesName:"Book <series>",seriesNumber:"2",publisher:"East & West",isbn:"978-0-306-40615-7",description:"A story <about> heroes",publicationDate:"2026-10-31"};
  const epub=buildEpub(book,undefined,{id:"metadata-test",createdAt:"2026-10-31T00:00:00Z"});
  const files=unzipSync(epub.bytes);
  const opf=strFromU8(files["EPUB/package.opf"]);
  expect(opf).toContain('<dc:title id="publication-subtitle">A &amp; B</dc:title>');
  expect(opf).toContain('property="title-type">subtitle</meta>');
  expect(opf).toContain("<dc:publisher>East &amp; West</dc:publisher>");
  expect(opf).toContain("<dc:description>A story &lt;about&gt; heroes</dc:description>");
  expect(opf).toContain("<dc:date>2026-10-31</dc:date>");
  expect(opf).toContain("urn:isbn:9780306406157");
  expect(opf).toContain('property="collection-type">series</meta>');
  expect(opf).toContain('property="group-position">2</meta>');
  const title=strFromU8(files["EPUB/title.xhtml"]);
  expect(title).toContain("<h1>Main book</h1>");
  expect(title).not.toContain("A &amp; B");
 });
});
