"use client";
import {useEffect,useRef} from "react";
import type {Book} from "../lib/model";
import {findInBook,replaceAcrossBook,type FindOptions,type TextMatch} from "../lib/find-replace";
export type SearchConfig={query:string;replacement:string;scope:"chapter"|"book";caseSensitive:boolean;wholeWord:boolean};
export default function FindReplacePanel({book,chapterId,config,onConfig,onClose,onNavigate,onReplace,onUndo,onRedo,canUndo,canRedo}:{
 book:Book;chapterId:string;config:SearchConfig;
 onConfig:(value:SearchConfig)=>void;onClose:()=>void;
 onNavigate:(match:TextMatch)=>void;
 onReplace:(matches:TextMatch[],replacement:string)=>void;
 onUndo:()=>void;onRedo:()=>void;canUndo:boolean;canRedo:boolean;
}){
 const input=useRef<HTMLInputElement>(null);
 useEffect(()=>{input.current?.focus();},[]);
 const options:FindOptions={caseSensitive:config.caseSensitive,wholeWord:config.wholeWord};
 const matches=findInBook(book,config.query,options,config.scope==="chapter"?chapterId:undefined);
 function navigate(index:number){
  if(!matches.length)return;
  const selected=matches[(index+matches.length)%matches.length];
  onNavigate(selected);
 }
 return <section className="find-panel" aria-label="Find and replace">
  <div className="find-panel-heading"><strong>Find and replace</strong><button type="button" onClick={onClose} aria-label="Close find and replace">×</button></div>
  <div className="find-panel-fields">
   <label>Find<input ref={input} aria-label="Find text" value={config.query} onChange={e=>onConfig({...config,query:e.target.value})}/></label>
   <label>Replace with<input aria-label="Replace with" value={config.replacement} onChange={e=>onConfig({...config,replacement:e.target.value})}/></label>
  </div>
  <div className="find-panel-options">
   <label>Search in <select aria-label="Search scope" value={config.scope} onChange={e=>onConfig({...config,scope:e.target.value as SearchConfig["scope"]})}><option value="chapter">Current chapter</option><option value="book">Entire book</option></select></label>
   <label><input type="checkbox" checked={config.caseSensitive} onChange={e=>onConfig({...config,caseSensitive:e.target.checked})}/> Match case</label>
   <label><input type="checkbox" checked={config.wholeWord} onChange={e=>onConfig({...config,wholeWord:e.target.checked})}/> Whole words</label>
  </div>
  <div className="find-panel-actions">
   <span role="status">{matches.length} match{matches.length===1?"":"es"}</span>
   <button type="button" disabled={!matches.length} onClick={()=>navigate(matches.length-1)}>Previous</button>
   <button type="button" disabled={!matches.length} onClick={()=>navigate(0)}>Next</button>
   <button type="button" disabled={!matches.length} onClick={()=>onReplace([matches[0]],config.replacement)}>Replace</button>
   <button type="button" disabled={!matches.length} onClick={()=>onReplace(matches,config.replacement)}>Replace all</button>
   <button type="button" disabled={!canUndo} onClick={onUndo}>Undo replace</button>
   <button type="button" disabled={!canRedo} onClick={onRedo}>Redo replace</button>
  </div>
  {config.scope==="book"&&matches.length?<ol className="find-results">{book.chapters.map(ch=>{const count=matches.filter(m=>m.chapterId===ch.id).length;return count?<li key={ch.id}><button type="button" onClick={()=>onNavigate(matches.find(m=>m.chapterId===ch.id)!)}>{ch.title} ({count})</button></li>:null;})}</ol>:null}
 </section>;
}
