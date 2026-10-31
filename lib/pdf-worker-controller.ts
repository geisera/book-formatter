import type {Book} from "./model";
import type {PrintFonts,PrintResult,PrintRecord} from "./print";
import {newId} from "./model";
import {localAsset,localWorker} from "./offline-assets";

export type PdfProgress={percent:number;stage:string};
type WorkerMessage={type?:"progress";ok?:boolean;percent?:number;stage?:string;error?:string;bytes?:Uint8Array;record?:PrintRecord};
const files=["regular","italic","bold","bold-italic"] as const;
let cachedFonts:Promise<PrintFonts>|null=null;
async function loadFonts(signal:AbortSignal):Promise<PrintFonts>{
 if(!cachedFonts)cachedFonts=Promise.all(files.map(async name=>{
  const response=await localAsset("/epub-fonts/"+name+".woff",signal);
  if(!response.ok)throw Error("Print fonts are unavailable offline. Open the app online once and retry.");
  return new Uint8Array(await response.arrayBuffer());
 })).then(([regular,italic,bold,boldItalic])=>({regular,italic,bold,boldItalic})).catch(e=>{cachedFonts=null;throw e;});
 return cachedFonts;
}
export type PdfBuildRequest={book:Book;includeFrontCover?:boolean;expectedChecksum?:string;onProgress?:(event:PdfProgress)=>void;timeoutMs?:number};
/** One build, one worker, one terminal outcome. Calling cancel prevents later callbacks. */
export function startPdfBuild(request:PdfBuildRequest):{promise:Promise<PrintResult>;cancel:()=>void}{
 const controller=new AbortController();
 let worker:Worker|null=null;
 let release:(()=>void)|null=null;
 let timer:ReturnType<typeof setTimeout>|null=null;
 let settled=false;
 let attempts=0;
 let highestProgress=0;
 let rejectPromise:(reason:Error)=>void=()=>{};
 const cleanup=()=>{if(timer){clearTimeout(timer);timer=null;}worker?.terminate();worker=null;release?.();release=null;controller.abort();};
 const cancel=()=>{if(settled)return;settled=true;cleanup();rejectPromise(new DOMException("PDF build cancelled","AbortError"));};
 const promise=new Promise<PrintResult>((resolve,reject)=>{
  rejectPromise=reject;
  const fail=(reason:unknown)=>{
   if(settled)return;
   settled=true;cleanup();reject(reason instanceof Error?reason:new Error(String(reason)));
  };
  const progress=(percent:number,stage:string)=>{
   if(!settled){highestProgress=Math.max(highestProgress,Math.max(0,Math.min(99,percent)));request.onProgress?.({percent:highestProgress,stage});}
  };
  void (async()=>{
   try{
    timer=setTimeout(()=>fail(new Error("The PDF build timed out. Retry the proof.")),request.timeoutMs??120000);
    progress(0,"Loading print assets");
    const fonts=await loadFonts(controller.signal);
    if(settled)return;
    progress(3,"Starting PDF worker");
    const startAttempt=async():Promise<void>=>{
    attempts++;
    let prepared:{worker:Worker;release:()=>void};
    try{prepared=await localWorker("/print-worker.js?renderer=print-proof-1.5.0");}
    catch(error){if(attempts<2&&!settled){progress(highestProgress,"Retrying PDF worker startup");void startAttempt();}else fail(error);return;}
    if(settled){prepared.worker.terminate();prepared.release();return;}
    worker=prepared.worker;release=prepared.release;
    const failedWorker=()=>{
      if(settled)return;
      worker?.terminate();worker=null;release?.();release=null;
      if(attempts<2){progress(highestProgress,"Restarting PDF worker after a crash");void startAttempt();}
      else fail(new Error("The PDF worker failed twice. Reload online to refresh its offline files, then retry."));
    };
    worker.onerror=failedWorker;
    worker.onmessageerror=failedWorker;
    worker.onmessage=(event:MessageEvent<WorkerMessage>)=>{
     if(settled)return;
     const data=event.data;
     if(data.type==="progress"){progress(data.percent??0,data.stage??"Building PDF");return;}
     if(!data.ok||!data.bytes||!data.record){fail(new Error(data.error??"The PDF could not be generated."));return;}
     if(request.expectedChecksum&&data.record.inputChecksum!==request.expectedChecksum){
      fail(new Error("Manuscript changed during PDF generation. Rebuild the proof."));return;
     }
     if(request.includeFrontCover&&(data.record.includeFrontCover!==true||data.record.pages?.[0]?.kind!=="cover")){
      fail(new Error("An outdated PDF worker omitted the cover. Reload online and retry."));return;
     }
     settled=true;
     const result={bytes:data.bytes,record:data.record};
     cleanup();
     resolve(result);
    };
    try{worker.postMessage({book:request.book,fonts,id:newId(),createdAt:new Date().toISOString(),includeFrontCover:request.includeFrontCover});}
    catch(error){fail(error);}
    };
    await startAttempt();
   }catch(error){fail(error);}
  })();
 });
 return {promise,cancel};
}
