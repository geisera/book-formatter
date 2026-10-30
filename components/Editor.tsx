"use client";
import {useEffect,useRef} from "react";
import {EditorState} from "prosemirror-state";
import {EditorView} from "prosemirror-view";
import {baseKeymap,toggleMark,setBlockType} from "prosemirror-commands";
import {history,undo,redo} from "prosemirror-history";
import {keymap} from "prosemirror-keymap";
import {schema} from "../lib/model";
export default function Editor({content,onChange}:{content:Record<string,unknown>;onChange:(content:Record<string,unknown>)=>void}){
 const host=useRef<HTMLDivElement>(null),view=useRef<EditorView|null>(null),callback=useRef(onChange);callback.current=onChange;
 useEffect(()=>{if(!host.current)return;const editor=new EditorView(host.current,{state:EditorState.create({doc:schema.nodeFromJSON(content),plugins:[history(),keymap({"Mod-z":undo,"Mod-Shift-z":redo,"Mod-y":redo,"Mod-b":toggleMark(schema.marks.strong),"Mod-i":toggleMark(schema.marks.em)}),keymap(baseKeymap)]}),attributes:{role:"textbox","aria-label":"Chapter manuscript","aria-multiline":"true"},dispatchTransaction(tr){editor.updateState(editor.state.apply(tr));if(tr.docChanged)callback.current(editor.state.doc.toJSON())}});view.current=editor;return()=>{editor.destroy();view.current=null}},[]); // Parent keys the editor by chapter ID.
 function run(command:typeof undo){const v=view.current;if(v){command(v.state,v.dispatch);v.focus()}}
 return <><div className="toolbar" aria-label="Text formatting"><button aria-label="Bold" onClick={()=>run(toggleMark(schema.marks.strong))}><b>B</b></button><button aria-label="Italic" onClick={()=>run(toggleMark(schema.marks.em))}><i>I</i></button><button onClick={()=>run(setBlockType(schema.nodes.heading))}>Heading</button><button onClick={()=>run(setBlockType(schema.nodes.paragraph))}>Paragraph</button><button onClick={()=>{const v=view.current;if(v){v.dispatch(v.state.tr.replaceSelectionWith(schema.nodes.scene_break.create()));v.focus()}}}>Scene break</button><span className="toolbar-spacer"/><button onClick={()=>run(undo)}>Undo</button><button onClick={()=>run(redo)}>Redo</button></div><div ref={host}/></>}
