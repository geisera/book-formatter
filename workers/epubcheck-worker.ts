/// <reference lib="webworker" />
import {validate} from "epubcheck-standalone";
import {blob} from "epubcheck-standalone/plugins";
type Request={id:string;bytes:Uint8Array};
self.onmessage=async(event:MessageEvent<Request>)=>{
 const {id,bytes}=event.data;
 try{
  const result=await validate(blob(new Blob([new Uint8Array(bytes)],{type:"application/epub+zip"})));
  self.postMessage({id,ok:true,valid:result.valid,messages:result.messages.map(m=>({
   severity:String(m.severity),code:String(m.id),message:String(m.message),
   location:[m.path,m.line>=0?m.line:undefined,m.column>=0?m.column:undefined].filter(v=>v!==undefined).join(":"),
   suggestion:m.suggestion||undefined
  }))});
 }catch(e){self.postMessage({id,ok:false,error:e instanceof Error?e.message:"EPUBCheck failed to run."});}
};
