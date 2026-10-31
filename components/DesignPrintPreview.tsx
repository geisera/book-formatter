"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import type {Book} from "../lib/model";
import {newId} from "../lib/model";
import {snapshotChecksum} from "../lib/epub";
import {localAsset,localWorker} from "../lib/offline-assets";
import {getPrintEdition,PRINT_TRIMS} from "../lib/print-profile";
import type {PrintFonts,PrintResult,PrintRecord} from "../lib/print";
import PdfProofViewer from "./PdfProofViewer";

/** A disposable PDF proof; never persists a build or mutates the manuscript. */
export default function DesignPrintPreview({book,getSnapshot}:{book:Book;getSnapshot:()=>Promise<Book>}) {
  const snapshotRef=useRef(getSnapshot);
  snapshotRef.current=getSnapshot;
  const fingerprint=useMemo(()=>snapshotChecksum(book),[book]);
  const [result,setResult]=useState<PrintResult|null>(null);
  const [state,setState]=useState<"waiting"|"building"|"ready"|"error">("waiting");
  const [error,setError]=useState("");
  useEffect(()=>{
    let cancelled=false;
    let worker:Worker|null=null;
    let release:(()=>void)|null=null;
    const controller=new AbortController();
    const timeout=setTimeout(async()=>{
      if(cancelled)return;
      setState("building");setError("");
      try {
        const snapshot=await snapshotRef.current();
        if(cancelled)return;
        // Never label an outdated asynchronous build current.
        if(snapshotChecksum(snapshot)!==fingerprint) {setState("waiting");return;}
        const fonts=await Promise.all(["regular","italic","bold","bold-italic"].map(async face=>{
          const response=await localAsset("/epub-fonts/"+face+".woff",controller.signal);
          if(!response.ok)throw Error("Print fonts are not available offline. Open the application online once.");
          return new Uint8Array(await response.arrayBuffer());
        }));
        if(cancelled)return;
        const prepared=await localWorker("/print-worker.js?renderer=print-proof-1.5.0");
        worker=prepared.worker;release=prepared.release;
        if(cancelled){worker.terminate();release();return;}
        worker.onerror=()=>{if(!cancelled){setState("error");setError("The PDF preview worker could not start. Try reloading online.");}};
        worker.onmessage=(event:MessageEvent<{ok:boolean;error?:string;bytes?:Uint8Array;record?:PrintRecord}>)=>{
          if(cancelled)return;
          const payload=event.data;
          if(!payload.ok||!payload.bytes||!payload.record){
            setError(payload.error??"Could not generate print preview.");setState("error");return;
          }
          if(payload.record.inputChecksum!==fingerprint){
            setState("waiting");return;
          }
          setResult({bytes:payload.bytes,record:payload.record});
          setState("ready");
          worker?.terminate();release?.();worker=null;release=null;
        };
        worker.postMessage({book:snapshot,fonts:{regular:fonts[0],italic:fonts[1],bold:fonts[2],boldItalic:fonts[3]} satisfies PrintFonts,id:newId(),createdAt:new Date().toISOString()});
      }catch(e){
        if(!cancelled){setState("error");setError(e instanceof Error?e.message:"Could not build the print preview.");}
      }
    },900);
    return ()=>{cancelled=true;clearTimeout(timeout);controller.abort();worker?.terminate();release?.();};
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
    {state==="error"?<div className="alert" role="alert">{error} Your manuscript remains saved; you can still use the Print workspace.</div>:null}
    {current&&result?<PdfProofViewer bytes={result.bytes} record={result.record}/>:<div className="print-empty"><h3>Preparing pages</h3><p>Print layout refreshes after your changes are saved. Large books may take longer to paginate.</p></div>}
    <p className="control-note">Adjust section starts, headers, folios, and placement in Structure. Change print trim and justification in Print. Book design templates affect both formats; ebook-only typography controls do not modify the print edition.</p>
  </section>;
}
