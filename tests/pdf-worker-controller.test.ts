import {describe,it,expect,vi,afterEach} from "vitest";
import type {Book} from "../lib/model";
import {createBook} from "../lib/model";
import {startPdfBuild} from "../lib/pdf-worker-controller";
const sent:{worker:FakeWorker|null}={worker:null};
class FakeWorker{
 onmessage:((event:{data:unknown})=>void)|null=null;
 onerror:(()=>void)|null=null;
 terminated=false;
 postMessage(_message:unknown){/* Simulate worker later emitting progress, success or failure. */}
 terminate(){this.terminated=true;}
 emit(data:unknown){this.onmessage?.({data});}
}
vi.mock("../lib/offline-assets",()=>({
 localAsset:vi.fn(async()=>({ok:true,arrayBuffer:async()=>new Uint8Array([1,2,3]).buffer})),
 localWorker:vi.fn(async()=>{const worker=new FakeWorker();sent.worker=worker;return {worker,release:()=>{}};})
}));
afterEach(()=>{sent.worker=null;});
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
