import {schema,type Book,type Chapter} from "./model";
import {EditorState} from "prosemirror-state";
import type {Node as PMNode} from "prosemirror-model";

export type FindOptions={caseSensitive:boolean;wholeWord:boolean};
export type TextMatch={chapterId:string;from:number;to:number;excerpt:string};
const word=(char:string)=>/[\p{L}\p{N}_]/u.test(char);
export function findInDocument(doc:PMNode,chapterId:string,query:string,options:FindOptions):TextMatch[]{
 if(!query)return [];
 const results:TextMatch[]=[];
 const needle=options.caseSensitive?query:query.toLocaleLowerCase();
 doc.descendants((node,pos)=>{
  if(node.type!==schema.nodes.paragraph&&node.type!==schema.nodes.heading)return true;
  const value=node.textContent;
  const haystack=options.caseSensitive?value:value.toLocaleLowerCase();
  let index=0;
  while(index<haystack.length){
   const at=haystack.indexOf(needle,index);
   if(at<0)break;
   const end=at+needle.length;
   const boundary=!options.wholeWord||(
    (at===0||!word(value[at-1]))&&(end===value.length||!word(value[end]))
   );
   if(boundary){
    results.push({chapterId,from:pos+1+at,to:pos+1+end,excerpt:value.slice(Math.max(0,at-30),Math.min(value.length,end+30))});
   }
   index=at+Math.max(needle.length,1);
  }
  return false;
 });
 return results;
}
export function findInBook(book:Book,query:string,options:FindOptions,chapterId?:string):TextMatch[]{
 return book.chapters.filter(c=>!chapterId||c.id===chapterId)
  .flatMap(c=>findInDocument(schema.nodeFromJSON(c.content),c.id,query,options));
}
export function replaceInDocument(content:Chapter["content"],matches:TextMatch[],replacement:string):Chapter["content"]{
 const state=EditorState.create({doc:schema.nodeFromJSON(content)});
 const tr=state.tr;
 for(const match of [...matches].sort((a,b)=>b.from-a.from)){
  const marks=tr.doc.nodeAt(match.from)?.marks ?? tr.doc.resolve(match.from).marks();
  tr.replaceWith(match.from,match.to,replacement?schema.text(replacement,marks):[]);
 }
 return tr.doc.toJSON();
}
export function replaceAcrossBook(book:Book,matches:TextMatch[],replacement:string):Book{
 return {...book,chapters:book.chapters.map(chapter=>{
  const found=matches.filter(m=>m.chapterId===chapter.id);
  return found.length?{...chapter,content:replaceInDocument(chapter.content,found,replacement)}:chapter;
 })};
}
