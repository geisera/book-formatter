"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import type {Book} from "../lib/model";
import {newId} from "../lib/model";
import {snapshotChecksum} from "../lib/epub";
import {localAsset,localWorker} from "../lib/offline-assets";
import {getPrintEdition,PRINT_TRIMS} from "../lib/print-profile";
import type {PrintFonts,PrintResult,PrintRecord} from "../lib/print";
import PdfProofViewer from "./PdfProofViewer";

// Reuse local font buffers across consecutive preview regenerations. A failed
// load is retried next time, including after restoring offline assets.
let cachedPrintFonts:Promise<PrintFonts>|null=null;
function previewFonts():Promise<PrintFonts>{
  if(!cachedPrintFonts)cachedPrintFonts=Promise.all(["regular","italic","bold","bold-italic"].map(async face=>{
    const response=await localAsset("/epub-fonts/"+face+".woff");
    if(!response.ok)throw Error("Print fonts are not available offline. Open the application online once.");
    return new Uint8Array(await response.arrayBuffer());
  })).then(([regular,italic,bold,boldItalic])=>({regular,italic,bold,boldItalic})).catch(e=>{
    cachedPrintFonts=null;
    throw e;
  });
  return cachedPrintFonts;
}
/** A disposable PDF proof; never persists a build or mutates the manuscript. */
export default function DesignPrintPreview({book,getSnapshot,selectedSectionId}:{book:Book;getSnapshot:()=>Promise<Book>;selectedSectionId?:string}) {
  const snapshotRef=useRef(getSnapshot);
  snapshotRef.current=getSnapshot;
  const fingerprint=useMemo(()=>snapshotChecksum(book),[book]);
  const [result,setResult]=useState<PrintResult|null>(null);
  const [state,setState]=useState<"waiting"|"building"|"ready"|"error">("waiting");
  const [error,setError]=useState("");
  const [progress,setProgress]=useState({percent:0,stage:"Preparing proof"});
  useEffect(()=>{
    let cancelled=false;
    let worker:Worker|null=null;
    let release:(()=>void)|null=null;
    const timeout=setTimeout(async()=>{
      if(cancelled)return;
      setState("building");setError("");setProgress({percent:0,stage:"Preparing manuscript"});
      try {
        const snapshot=await snapshotRef.current();
        if(!cancelled)setProgress({percent:3,stage:"Loading assets"});
        if(cancelled)return;
        // Never label an outdated asynchronous build current.
        if(snapshotChecksum(snapshot)!==fingerprint) {setState("waiting");return;}
        const fonts=await previewFonts();
        if(cancelled)return;
        const prepared=await localWorker("/print-worker.js?renderer=print-proof-1.5.0");
        worker=prepared.worker;release=prepared.release;
        if(cancelled){worker.terminate();release();return;}
        worker.onerror=()=>{if(!cancelled){setState("error");setError("The PDF preview worker could not start. Try reloading online.");}};
        worker.onmessage=(event:MessageEvent<{type?:"progress";percent?:number;stage?:string;ok?:boolean;error?:string;bytes?:Uint8Array;record?:PrintRecord}>)=>{
          if(cancelled)return;
          const payload=event.data;
          if(payload.type==="progress"){
            setProgress(p=>({percent:Math.max(p.percent,Math.min(99,Math.max(0,payload.percent??0))),stage:payload.stage??p.stage}));
            return;
          }
          if(!payload.ok||!payload.bytes||!payload.record){
            setError(payload.error??"Could not generate print preview.");setState("error");return;
          }
          if(payload.record.inputChecksum!==fingerprint){
            setState("waiting");return;
          }
          setResult({bytes:payload.bytes,record:payload.record});
          setProgress({percent:100,stage:"Proof ready"});
          setState("ready");
          worker?.terminate();release?.();worker=null;release=null;
        };
        worker.postMessage({book:snapshot,fonts:fonts satisfies PrintFonts,id:newId(),createdAt:new Date().toISOString()});
      }catch(e){
        if(!cancelled){setState("error");setError(e instanceof Error?e.message:"Could not build the print preview.");}
      }
    },900);
    return ()=>{cancelled=true;clearTimeout(timeout);worker?.terminate();release?.();};
  },[fingerprint]);
  const current=result?.record.inputChecksum===fingerprint&&state==="ready";
  const trim=getPrintEdition(book).trim;
  return <section className="design-print-preview" aria-label="Paperback design preview" style={{minWidth:0,flex:"1 1 500px"}}>
    <div className="publish-intro"><div><div className="eyebrow">PRINT DESIGN · PROOF MODE</div>
      <h2>Paperback preview</h2><p>Uses the final PDF renderer, not an approximate page layout.</p></div>
      <span className="format-stamp">{PRINT_TRIMS[trim].label} in</span></div>
    <p className="publish-notice" role="status" aria-live="polite">
      {state==="error"?"Preview unavailable":current?"Proof is up to date":state==="building"?"Updating print pagination locally…":"Preparing an updated print proof…"}
      {!current&&result?" Previous pages are outdated and hidden until rebuilding finishes.":""}
    </p>
    {state==="building"?<div className="print-progress" role="group" aria-label="PDF proof build progress">
      <label htmlFor="print-proof-progress">{progress.stage} · {progress.percent}%</label>
      <progress id="print-proof-progress" aria-label="PDF proof build progress" value={progress.percent} max={100} style={{width:"100%",height:12}} />
    </div>:null}
    {state==="error"?<div className="alert" role="alert">{error} Your manuscript remains saved; you can still use the Print workspace.</div>:null}
    {current&&result?<PdfProofViewer bytes={result.bytes} record={result.record} selectedSectionId={selectedSectionId}/>:<div className="print-empty"><h3>Preparing pages</h3><p>Print layout refreshes after your changes are saved. Large books may take longer to paginate.</p></div>}
    <p className="control-note">Select a section and adjust its print formatting in the left panel. The proof opens at that section when it is ready. Final PDF export remains in Print.</p>
  </section>;
}
