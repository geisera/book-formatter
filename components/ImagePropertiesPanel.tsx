"use client";
import {useEffect,useRef,useState} from "react";
import {decodeImage,MAX_IMAGE_BYTES,type ImageAlign,type ImageWidth} from "../lib/images";

export type ImageProperties = {
 src:string; alt:string; caption:string; width:ImageWidth; align:ImageAlign;
};
export function ImagePropertiesPanel({image,onSave,onReplace,onRemove,onClose}:{
 image:ImageProperties;
 onSave:(changes:Pick<ImageProperties,"alt"|"caption"|"width"|"align">)=>void;
 onReplace:(file:File)=>Promise<void>;
 onRemove:()=>void;
 onClose:()=>void;
}){
 const [alt,setAlt]=useState(image.alt);
 const [caption,setCaption]=useState(image.caption);
 const [width,setWidth]=useState<ImageWidth>(image.width);
 const [align,setAlign]=useState<ImageAlign>(image.align);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const fileRef=useRef<HTMLInputElement>(null);
 useEffect(()=>{setAlt(image.alt);setCaption(image.caption);setWidth(image.width);setAlign(image.align);setError("");},[image.src,image.alt,image.caption,image.width,image.align]);
 const dirty=alt!==image.alt || caption!==image.caption || width!==image.width || align!==image.align;
 function save(){
  if(!alt.trim()){setError("Alternative text is required.");return;}
  onSave({alt:alt.trim().slice(0,500),caption:caption.slice(0,1000),width,align});
  setError("");
 }
 async function replace(file?:File){
  if(!file)return;
  setBusy(true);setError("");
  try{
   if(!["image/png","image/jpeg"].includes(file.type))throw Error("Choose a PNG or JPEG image.");
   if(file.size>MAX_IMAGE_BYTES)throw Error("Images must be 3 MB or smaller.");
   // onReplace revalidates the binary before updating the manuscript.
   await onReplace(file);
  }catch(e){setError(e instanceof Error?e.message:"Could not replace the image.");}
  finally{setBusy(false);if(fileRef.current)fileRef.current.value="";}
 }
 return <section className="image-properties" aria-label="Image properties">
  <div className="image-properties-heading"><h3>Image properties</h3><button type="button" onClick={onClose} aria-label="Close image properties">Close</button></div>
  <div className="image-properties-layout">
   <div className="image-properties-preview">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={image.src} alt={image.alt} />
    <p>Current illustration</p>
   </div>
   <div className="image-properties-fields">
    <label>Image width
     <select aria-label="Image width" value={width} onChange={e=>setWidth(Number(e.target.value) as ImageWidth)}>
      {[25,50,75,100].map(value=><option key={value} value={value}>{value}%</option>)}
     </select>
    </label>
    <label>Image alignment
     <select aria-label="Image alignment" value={align} onChange={e=>setAlign(e.target.value as ImageAlign)}>
      <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
     </select>
    </label>
    <label className="image-properties-wide">Alternative text
     <input aria-label="Image alternative text" required maxLength={500} value={alt} onChange={e=>setAlt(e.target.value)} />
    </label>
    <label className="image-properties-wide">Caption
     <textarea aria-label="Image caption" maxLength={1000} rows={3} value={caption} onChange={e=>setCaption(e.target.value)} />
    </label>
   </div>
  </div>
  {error?<p className="image-error" role="alert">{error}</p>:null}
  <div className="image-properties-actions">
   <button type="button" onClick={save} disabled={!dirty||busy}>Save properties</button>
   <input ref={fileRef} type="file" accept="image/png,image/jpeg" hidden aria-label="Replacement image file" onChange={e=>void replace(e.target.files?.[0])} />
   <button type="button" disabled={busy} onClick={()=>fileRef.current?.click()}>{busy?"Replacing…":"Replace image"}</button>
   <button type="button" className="image-properties-remove" disabled={busy} onClick={onRemove}>Remove image</button>
  </div>
  <p className="image-properties-hint">Replacing an image keeps its position, alignment, size, alternative text, and caption. Image files remain local.</p>
 </section>;
}
