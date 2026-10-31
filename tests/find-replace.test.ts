import {describe,it,expect} from "vitest";
import {createBook,blankChapter,schema} from "../lib/model";
import {findInBook,findInDocument,replaceAcrossBook,replaceInDocument} from "../lib/find-replace";
const options={caseSensitive:false,wholeWord:false};
function fixture(){
 const book=createBook("Find test","Editor");
 book.chapters=[{...blankChapter("One"),content:{type:"doc",content:[
  {type:"paragraph",content:[{type:"text",text:"The "},{type:"text",text:"signal",marks:[{type:"strong"}]},{type:"text",text:" was bright. Signal again."}]},
  {type:"image",attrs:{src:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAMCAIAAADkharWAAAAF0lEQVR4nGM0ckthIAUwkaR6VMMI0gAAFWAA9Kg1bTEAAAAASUVORK5CYII=",alt:"Signal image",width:100,align:"center",caption:"Signal caption"}},
  {type:"paragraph",content:[{type:"text",text:"A SIGNAL. Signals are not the same."}]}]}},
  {...blankChapter("Two"),content:{type:"doc",content:[{type:"paragraph",content:[{type:"text",text:"Signal across chapters."}]}]}}
 ];
 return book;
}
describe("find and replace",()=>{
 it("finds across marks without matching image metadata, with case and word boundaries",()=>{
  const book=fixture();
  expect(findInBook(book,"signal",options)).toHaveLength(5);
  expect(findInBook(book,"signal",{caseSensitive:true,wholeWord:true})).toHaveLength(1);
  expect(findInBook(book,"signal",{caseSensitive:false,wholeWord:true})).toHaveLength(4);
  expect(findInBook(book,"signal",options,book.chapters[0].id)).toHaveLength(4);
  expect(findInBook(book,"",options)).toHaveLength(0);
 });
 it("replaces one and all without losing paragraph styles or images",()=>{
  const book=fixture();
  const before=structuredClone(book);
  const matches=findInBook(book,"signal",{caseSensitive:false,wholeWord:true});
  const replaced=replaceAcrossBook(book,matches,"beacon");
  expect(findInBook(replaced,"signal",{caseSensitive:false,wholeWord:true})).toHaveLength(0);
  expect(findInBook(replaced,"beacon",options)).toHaveLength(4);
  const first=schema.nodeFromJSON(replaced.chapters[0].content);
  expect(first.child(0).child(1).marks.some(mark=>mark.type.name==="strong")).toBe(true);
  expect(first.child(1).type.name).toBe("image");
  expect(first.child(1).attrs.caption).toBe("Signal caption");
  expect(book).toEqual(before);
  const one=replaceAcrossBook(book,[matches[0]],"bell");
  expect(findInBook(one,"bell",options)).toHaveLength(1);
  expect(findInBook(one,"signal",{caseSensitive:false,wholeWord:true})).toHaveLength(3);
 });
 it("supports deletions and restores original manuscript JSON on undo snapshots",()=>{
  const book=fixture();
  const match=findInBook(book,"bright",options)[0];
  const edited=replaceInDocument(book.chapters[0].content,[match],"");
  const doc=schema.nodeFromJSON(edited);
  expect(doc.textContent).not.toContain("bright");
  expect(doc.child(1).type.name).toBe("image");
  expect(schema.nodeFromJSON(book.chapters[0].content).textContent).toContain("bright");
 });
});
