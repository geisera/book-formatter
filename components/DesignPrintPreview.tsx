"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import type {Book} from "../lib/model";
import {snapshotChecksum} from "../lib/epub";
import {startPdfBuild} from "../lib/pdf-worker-controller";
import {getPrintEdition,PRINT_TRIMS} from "../lib/print-profile";
import type {PrintResult} from "../lib/print";
import PdfProofViewer from "./PdfProofViewer";

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
    let stop:(()=>void)|null=null;
    const timeout=setTimeout(async()=>{
      if(cancelled)return;
      setState("building");setError("");setProgress({percent:0,stage:"Preparing manuscript"});
      try{
        const snapshot=await snapshotRef.current();
        if(cancelled)return;
        if(snapshotChecksum(snapshot)!==fingerprint){setState("waiting");return;}
        const build=startPdfBuild({book:snapshot,expectedChecksum:fingerprint,
          onProgress:status=>{if(!cancelled)setProgress(status);}});
        stop=build.cancel;
        const built=await build.promise;
        if(cancelled)return;
        setResult(built);setProgress({percent:100,stage:"Proof ready"});setState("ready");
      }catch(e){
        if(!cancelled){setState("error");setError(e instanceof Error?e.message:"Could not build the print preview.");}
      }
    },900);
    return ()=>{cancelled=true;clearTimeout(timeout);stop?.();};
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
