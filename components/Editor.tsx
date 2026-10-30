"use client";
import { decodeImage, MAX_IMAGE_BYTES, type ImageAlign, type ImageWidth } from "../lib/images";
import {useEffect,useRef,useState} from "react";
import {EditorState,NodeSelection} from "prosemirror-state";
import {EditorView} from "prosemirror-view";
import {baseKeymap,toggleMark,setBlockType} from "prosemirror-commands";
import {history,undo,redo} from "prosemirror-history";
import {keymap} from "prosemirror-keymap";
import {schema,type TextAlignment} from "../lib/model";
export default function Editor({content,onChange}:{content:Record<string,unknown>;onChange:(content:Record<string,unknown>)=>void}){
 const host=useRef<HTMLDivElement>(null),view=useRef<EditorView|null>(null),file=useRef<HTMLInputElement>(null),callback=useRef(onChange);callback.current=onChange;
 const [imageError,setImageError]=useState("");
 const [selectedImage,setSelectedImage]=useState<{width:ImageWidth;align:ImageAlign;caption:string}|null>(null);
 useEffect(()=>{if(!host.current)return;const editor=new EditorView(host.current,{state:EditorState.create({doc:schema.nodeFromJSON(content),plugins:[history(),keymap({"Mod-z":undo,"Mod-Shift-z":redo,"Mod-y":redo,"Mod-b":toggleMark(schema.marks.strong),"Mod-i":toggleMark(schema.marks.em)}),keymap(baseKeymap)]}),attributes:{role:"textbox","aria-label":"Chapter manuscript","aria-multiline":"true"},dispatchTransaction(tr){editor.updateState(editor.state.apply(tr));setSelectedImage(editor.state.selection instanceof NodeSelection && editor.state.selection.node.type===schema.nodes.image ? {width:editor.state.selection.node.attrs.width,align:editor.state.selection.node.attrs.align,caption:editor.state.selection.node.attrs.caption ?? ""}:null);if(tr.docChanged)callback.current(editor.state.doc.toJSON())}});view.current=editor;return()=>{editor.destroy();view.current=null}},[]); // Parent keys the editor by chapter ID.
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
 function run(command:typeof undo){const v=view.current;if(v){command(v.state,v.dispatch);v.focus()}}
 return <><div className="toolbar" aria-label="Text formatting"><button aria-label="Bold" onClick={()=>run(toggleMark(schema.marks.strong))}><b>B</b></button><button aria-label="Italic" onClick={()=>run(toggleMark(schema.marks.em))}><i>I</i></button><button onClick={()=>run(setBlockType(schema.nodes.heading))}>Heading</button><button onClick={()=>run(setBlockType(schema.nodes.paragraph))}>Paragraph</button><button onClick={()=>{const v=view.current;if(v){v.dispatch(v.state.tr.replaceSelectionWith(schema.nodes.scene_break.create()));v.focus()}}}>Scene break</button><span className="toolbar-alignment" role="group" aria-label="Paragraph alignment"><button type="button" aria-label="Align left" title="Align left" onClick={()=>align("left")}>≡</button><button type="button" aria-label="Align center" title="Align center" onClick={()=>align("center")}>≣</button><button type="button" aria-label="Align right" title="Align right" onClick={()=>align("right")}>☰</button><button type="button" aria-label="Justify text" title="Justify text" onClick={()=>align("justify")}>▤</button></span><input ref={file} type="file" accept="image/png,image/jpeg" aria-label="Choose manuscript image" hidden onChange={e=>void insertImage(e.target.files?.[0])}/><button type="button" onClick={()=>file.current?.click()}>Insert image</button>{selectedImage ? <span className="toolbar-image-controls"><label>Image width <select aria-label="Image width" value={selectedImage.width} onChange={e=>editImage({width:Number(e.target.value) as ImageWidth})}>{[25,50,75,100].map(n=><option value={n} key={n}>{n}%</option>)}</select></label><label>Image alignment <select aria-label="Image alignment" value={selectedImage.align} onChange={e=>editImage({align:e.target.value as ImageAlign})}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><button type="button" onClick={()=>{const v=view.current;if(!v || !(v.state.selection instanceof NodeSelection))return;const alt=window.prompt("Image alt text:",String(v.state.selection.node.attrs.alt));if(alt?.trim())editImage({alt:alt.trim().slice(0,500)});}}>Edit alt text</button><button type="button" onClick={()=>{const caption=window.prompt("Image caption (leave blank for none):",selectedImage.caption);if(caption!==null)editImage({caption:caption.slice(0,1000)});}}>Edit caption</button></span>:null}<span className="toolbar-spacer"/><button onClick={()=>run(undo)}>Undo</button><button onClick={()=>run(redo)}>Redo</button></div>{imageError?<p role="alert" className="image-error">{imageError}</p>:null}<div ref={host}/></>}
