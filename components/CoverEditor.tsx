"use client";
import {useRef,useState} from "react";
import {decodeImage,MAX_IMAGE_BYTES} from "../lib/images";
import type {Book} from "../lib/model";
export default function CoverEditor({cover,onChange}:{cover:Book["cover"];onChange:(cover:Book["cover"])=>void}){
 const input=useRef<HTMLInputElement>(null);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 async function choose(file?:File){
  if(!file)return;
  setBusy(true);setError("");
  try{
   if(!["image/png","image/jpeg"].includes(file.type))throw Error("Choose a PNG or JPEG cover.");
   if(file.size>MAX_IMAGE_BYTES)throw Error("Cover images must be 3 MB or smaller.");
   const src=await new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result));
    reader.onerror=()=>reject(Error("Could not read cover artwork."));
    reader.readAsDataURL(file);
   });
   decodeImage(src);
   onChange({src,alt:cover?.alt?.trim()||"Cover artwork"});
  }catch(e){setError(e instanceof Error?e.message:"Could not load cover.");}
  finally{setBusy(false);if(input.current)input.current.value="";}
 }
 return <section className="cover-editor" aria-label="EPUB cover settings">
  <h3>EPUB cover</h3>
  <p className="control-note">Add dedicated cover artwork for EPUB. This does not insert an illustration into your manuscript.</p>
  {cover?<div className="cover-editor-preview">
   {/* eslint-disable-next-line @next/next/no-img-element */}
   <img src={cover.src} alt={cover.alt}/>
   <span>Current book cover</span>
  </div>:<p className="control-note">No cover assigned. Existing books can still be exported without cover artwork.</p>}
  <label className="cover-alt-label">Cover alternative text
   <input aria-label="Cover alternative text" maxLength={500} value={cover?.alt??""}
    disabled={!cover} onChange={e=>cover&&onChange({...cover,alt:e.target.value})}/>
  </label>
  <input ref={input} type="file" accept="image/png,image/jpeg" hidden aria-label="Choose EPUB cover image" onChange={e=>void choose(e.target.files?.[0])}/>
  <div className="cover-editor-actions">
   <button type="button" disabled={busy} onClick={()=>input.current?.click()}>{cover?"Replace cover":"Upload cover"}</button>
   {cover?<button type="button" disabled={busy} onClick={()=>{onChange(undefined);setError("");}}>Remove cover</button>:null}
  </div>
  {error?<p role="alert" className="image-error">{error}</p>:null}
  <p className="control-note">PNG or JPEG, maximum 3 MB. Use a portrait-oriented cover for best results. Covers are included in project backups.</p>
 </section>;
}
