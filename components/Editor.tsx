"use client";
import { decodeImage, MAX_IMAGE_BYTES } from "../lib/images";
import {useEffect,useRef,useState} from "react";
import {EditorState,NodeSelection,TextSelection} from "prosemirror-state";
import {EditorView,Decoration,DecorationSet} from "prosemirror-view";
import {Plugin} from "prosemirror-state";
import {findInDocument,type FindOptions} from "../lib/find-replace";
import {baseKeymap,toggleMark,setBlockType} from "prosemirror-commands";
import {history,undo,redo} from "prosemirror-history";
import {keymap} from "prosemirror-keymap";
import {schema,type TextAlignment} from "../lib/model";
import {ImagePropertiesPanel,type ImageProperties} from "./ImagePropertiesPanel";
export default function Editor({content,onChange,search,focusMatch}:{content:Record<string,unknown>;onChange:(content:Record<string,unknown>)=>void;search?:{query:string;options:FindOptions};focusMatch?:{from:number;to:number;nonce:number}}){
 const host=useRef<HTMLDivElement>(null),view=useRef<EditorView|null>(null),file=useRef<HTMLInputElement>(null),callback=useRef(onChange);callback.current=onChange;
 const searchRef=useRef(search);searchRef.current=search;
 const [imageError,setImageError]=useState("");
 const [selectedImage,setSelectedImage]=useState<ImageProperties|null>(null);
 useEffect(()=>{if(!host.current)return;const editor=new EditorView(host.current,{state:EditorState.create({doc:schema.nodeFromJSON(content),plugins:[history(),new Plugin({props:{decorations(state){const cfg=searchRef.current;if(!cfg?.query)return null;const matches=findInDocument(state.doc,"chapter",cfg.query,cfg.options);return DecorationSet.create(state.doc,matches.map(m=>Decoration.inline(m.from,m.to,{class:"find-match"})));}}}),keymap({"Mod-z":undo,"Mod-Shift-z":redo,"Mod-y":redo,"Mod-b":toggleMark(schema.marks.strong),"Mod-i":toggleMark(schema.marks.em)}),keymap(baseKeymap)]}),attributes:{role:"textbox","aria-label":"Chapter manuscript","aria-multiline":"true"},handleClickOn(editor,pos,node,nodePos){if(node.type!==schema.nodes.image)return false;editor.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc,nodePos)));return true;},dispatchTransaction(tr){editor.updateState(editor.state.apply(tr));setSelectedImage(editor.state.selection instanceof NodeSelection && editor.state.selection.node.type===schema.nodes.image ? {src:editor.state.selection.node.attrs.src,alt:editor.state.selection.node.attrs.alt,width:editor.state.selection.node.attrs.width,align:editor.state.selection.node.attrs.align,caption:editor.state.selection.node.attrs.caption ?? ""}:null);if(tr.docChanged)callback.current(editor.state.doc.toJSON())}});view.current=editor;return()=>{editor.destroy();view.current=null}},[]); // Parent keys the editor by chapter ID.
 useEffect(()=>{const v=view.current;if(v)v.updateState(v.state);},[search?.query,search?.options.caseSensitive,search?.options.wholeWord]);
 useEffect(()=>{const v=view.current;if(!v||!focusMatch)return;const {from,to}=focusMatch;if(to<=v.state.doc.content.size){v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc,from,to)).scrollIntoView());}},[focusMatch?.nonce]);
 function align(value:TextAlignment) {
  const v=view.current;if(!v)return;
  const {$from,$to}=v.state.selection;
  if(!$from.depth || !$to.depth)return;
  const from=$from.before(1),to=$to.after(1);
  const tr=v.state.tr;
  tr.doc.nodesBetween(from,to,(node,pos)=>{
   if(node.type===schema.nodes.paragraph || node.type===schema.nodes.heading)
    tr.setNodeMarkup(pos,undefined,{...node.attrs,align:value},node.marks);
  });
  if(tr.docChanged)v.dispatch(tr);
  v.focus();
 }
 async function insertImage(picked:File|undefined) {
  if(!picked)return;
  try {
    if(!["image/png","image/jpeg"].includes(picked.type))throw Error("Choose a PNG or JPEG image.");
    if(picked.size>MAX_IMAGE_BYTES)throw Error("Images must be 3 MB or smaller.");
    const src=await new Promise<string>((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=()=>reject(Error("Could not read image."));
      reader.onload=()=>resolve(String(reader.result));reader.readAsDataURL(picked);
    });
    decodeImage(src);
    const alt=window.prompt("Describe this image for accessibility (alt text):");
    if(!alt?.trim())throw Error("Image insertion canceled: descriptive alt text is required.");
    const v=view.current;if(!v)return;
    const node=schema.nodes.image.create({src,alt:alt.trim().slice(0,500),width:100,align:"center",caption:""});
    const tr=v.state.tr.replaceSelectionWith(node);
    const previous=tr.selection.$from.nodeBefore;
    if(previous?.type===schema.nodes.image) tr.setSelection(NodeSelection.create(tr.doc,tr.selection.from-previous.nodeSize));
    v.dispatch(tr);
    v.focus();setImageError("");
  }catch(e){setImageError(e instanceof Error?e.message:"Could not insert image.");}
  finally {if(file.current)file.current.value="";}
 }
 function editImage(changes:Record<string,unknown>) {
  const v=view.current;if(!v || !(v.state.selection instanceof NodeSelection) || v.state.selection.node.type!==schema.nodes.image)return;
  const {from,node}=v.state.selection;
  v.dispatch(v.state.tr.setNodeMarkup(from,undefined,{...node.attrs,...changes}));
  v.focus();
 }
 async function replacementImage(picked:File) {
  if(!["image/png","image/jpeg"].includes(picked.type))throw Error("Choose a PNG or JPEG image.");
  if(picked.size>MAX_IMAGE_BYTES)throw Error("Images must be 3 MB or smaller.");
  const src=await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(Error("Could not read the replacement image."));
    reader.onload=()=>resolve(String(reader.result));
    reader.readAsDataURL(picked);
  });
  decodeImage(src);
  const v=view.current;
  if(!v || !(v.state.selection instanceof NodeSelection) || v.state.selection.node.type!==schema.nodes.image)
    throw Error("Select the illustration again before replacing it.");
  const {node,from}=v.state.selection;
  // Preserve the node and all its metadata; update only the raster source.
  v.dispatch(v.state.tr.setNodeMarkup(from,undefined,{...node.attrs,src}));
  setImageError("");
 }
 function removeImage(){
  const v=view.current;
  if(!v || !(v.state.selection instanceof NodeSelection) || v.state.selection.node.type!==schema.nodes.image)return;
  const {from,to}=v.state.selection;
  v.dispatch(v.state.tr.delete(from,to));
  setSelectedImage(null);v.focus();
 }
 function closeImagePanel(){
  const v=view.current;
  if(v && v.state.selection instanceof NodeSelection){
    const next=TextSelection.near(v.state.doc.resolve(v.state.selection.to));
    v.dispatch(v.state.tr.setSelection(next));
  }
  setSelectedImage(null);v?.focus();
 }
 function run(command:typeof undo){const v=view.current;if(v){command(v.state,v.dispatch);v.focus()}}
 return <><div className="toolbar" aria-label="Text formatting"><button aria-label="Bold" onClick={()=>run(toggleMark(schema.marks.strong))}><b>B</b></button><button aria-label="Italic" onClick={()=>run(toggleMark(schema.marks.em))}><i>I</i></button><button onClick={()=>run(setBlockType(schema.nodes.heading))}>Heading</button><button onClick={()=>run(setBlockType(schema.nodes.paragraph))}>Paragraph</button><button onClick={()=>{const v=view.current;if(v){v.dispatch(v.state.tr.replaceSelectionWith(schema.nodes.scene_break.create()));v.focus()}}}>Scene break</button><span className="toolbar-alignment" role="group" aria-label="Paragraph alignment"><button type="button" aria-label="Align left" title="Align left" onClick={()=>align("left")}>≡</button><button type="button" aria-label="Align center" title="Align center" onClick={()=>align("center")}>≣</button><button type="button" aria-label="Align right" title="Align right" onClick={()=>align("right")}>☰</button><button type="button" aria-label="Justify text" title="Justify text" onClick={()=>align("justify")}>▤</button></span><input ref={file} type="file" accept="image/png,image/jpeg" aria-label="Choose manuscript image" hidden onChange={e=>void insertImage(e.target.files?.[0])}/><button type="button" onClick={()=>file.current?.click()}>Insert image</button><span className="toolbar-spacer"/><button onClick={()=>run(undo)}>Undo</button><button onClick={()=>run(redo)}>Redo</button></div>{imageError?<p role="alert" className="image-error">{imageError}</p>:null}<div ref={host}/>{selectedImage ? <ImagePropertiesPanel image={selectedImage} onSave={changes=>editImage(changes)} onReplace={replacementImage} onRemove={removeImage} onClose={closeImagePanel}/> : null}</>}
