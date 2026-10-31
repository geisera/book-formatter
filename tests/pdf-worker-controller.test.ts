import {describe,it,expect,vi,afterEach} from "vitest";
import type {Book} from "../lib/model";
import {createBook} from "../lib/model";
import {startPdfBuild} from "../lib/pdf-worker-controller";
const sent:{worker:FakeWorker|null;workers:FakeWorker[]}={worker:null,workers:[]};
class FakeWorker{
 onmessage:((event:{data:unknown})=>void)|null=null;
 onerror:(()=>void)|null=null;
 onmessageerror:(()=>void)|null=null;
 terminated=false;
 postMessage(_message:unknown){/* Simulate worker later emitting progress, success or failure. */}
 terminate(){this.terminated=true;}
 emit(data:unknown){this.onmessage?.({data});}
}
vi.mock("../lib/offline-assets",()=>({
 localAsset:vi.fn(async()=>({ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer})),
 localWorker:vi.fn(async()=>{const worker=new FakeWorker();sent.worker=worker;sent.workers.push(worker);return {worker,release:()=>{}};})
}));
afterEach(()=>{sent.worker=null;sent.workers=[];});
const book=createBook("Worker protocol tests","Test Author") as Book;
async function untilWorker(){
 for(let i=0;i<40&&!sent.worker;i++)await new Promise(resolve=>setTimeout(resolve,0));
 if(!sent.worker)throw Error("Worker not started");
 return sent.worker;
}
describe("shared PDF worker controller",()=>{
 it("accepts progress messages without treating them as PDF failure",async()=>{
  const received:number[]=[];
  const task=startPdfBuild({book,onProgress:p=>received.push(p.percent)});
  const worker=await untilWorker();
  worker.emit({type:"progress",percent:35,stage:"Laying out section"});
  worker.emit({ok:true,bytes:new Uint8Array([37,80,68,70]),record:{inputChecksum:"x",pages:[{kind:"chapter"}]}});
  const result=await task.promise;
  expect(result.bytes[0]).toBe(37);
  expect(received).toContain(35);
  expect(worker.terminated).toBe(true);
 });
 it("cancels the worker and rejects without accepting late success",async()=>{
  const task=startPdfBuild({book});
  const worker=await untilWorker();
  task.cancel();
  await expect(task.promise).rejects.toMatchObject({name:"AbortError"});
  expect(worker.terminated).toBe(true);
 });
 it("reports actual worker failures instead of generic errors",async()=>{
  const task=startPdfBuild({book});
  (await untilWorker()).emit({ok:false,error:"Proof formatting failed"});
  await expect(task.promise).rejects.toThrow("Proof formatting failed");
 });
 it("rejects a mismatched manuscript snapshot",async()=>{
  const task=startPdfBuild({book,expectedChecksum:"expected"});
  (await untilWorker()).emit({ok:true,bytes:new Uint8Array([1]),record:{inputChecksum:"different"}});
  await expect(task.promise).rejects.toThrow("Manuscript changed");
 });
});

describe("worker retries and recovery",()=>{
 it("retries one worker crash then completes without resetting reported progress",async()=>{
  const values:number[]=[];
  const task=startPdfBuild({book,onProgress:p=>values.push(p.percent)});
  const first=await untilWorker();
  first.emit({type:"progress",percent:42,stage:"Paginating"});
  first.onerror?.();
  for(let i=0;i<40&&sent.workers.length<2;i++)await new Promise(r=>setTimeout(r,0));
  expect(sent.workers).toHaveLength(2);
  expect(first.terminated).toBe(true);
  for(let i=0;i<40&&!sent.workers[1].onmessage;i++)await new Promise(r=>setTimeout(r,0));
  expect(sent.workers[1].onmessage).not.toBeNull();
  sent.workers[1].emit({ok:true,bytes:new Uint8Array([37]),record:{inputChecksum:"x"}});
  await expect(task.promise).resolves.toHaveProperty("bytes");
  expect(values.every((value,i)=>i===0||value>=values[i-1])).toBe(true);
 });
 it("does not automatically retry a manuscript/worker validation error",async()=>{
  const task=startPdfBuild({book});
  (await untilWorker()).emit({ok:false,error:"Missing required metadata"});
  await expect(task.promise).rejects.toThrow("Missing required metadata");
  expect(sent.workers).toHaveLength(1);
 });
 it("cancels an initial build before starting a new successful build",async()=>{
  const old=startPdfBuild({book});
  const first=await untilWorker();
  old.cancel();
  await expect(old.promise).rejects.toMatchObject({name:"AbortError"});
  sent.worker=null;
  const next=startPdfBuild({book});
  const second=await untilWorker();
  first.emit({ok:true,bytes:new Uint8Array([0]),record:{inputChecksum:"old"}});
  second.emit({ok:true,bytes:new Uint8Array([37]),record:{inputChecksum:"new"}});
  expect((await next.promise).bytes[0]).toBe(37);
  expect(first.terminated).toBe(true);
 });
 it("releases each worker over repeated successful builds",async()=>{
  for(let i=0;i<5;i++){
   sent.worker=null;
   const task=startPdfBuild({book});
   const worker=await untilWorker();
   worker.emit({ok:true,bytes:new Uint8Array([37]),record:{inputChecksum:"ok"}});
   await task.promise;
   expect(worker.terminated).toBe(true);
  }
  expect(sent.workers).toHaveLength(5);
 });
});
