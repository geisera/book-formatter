import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {performance} from "node:perf_hooks";
import {createBook,blankChapter} from "../lib/model";
import {buildPrintPdf,type PrintFonts} from "../lib/print";
import {getPrintEdition} from "../lib/print-profile";
import {analyzePrintPages} from "../lib/print-quality";

async function main(){
const requested=Number(process.argv[2]??100000);
if(!Number.isInteger(requested)||requested<1000||requested>200000)throw Error("Word count must be 1,000–200,000.");
const words="The traveller crossed the forest beneath the autumn sky while distant bells rang through the valley";
const tokens=words.split(" ");
const perChapter=5000;
const chapters=Math.ceil(requested/perChapter);
const book=createBook("A long-form print benchmark","Benchmark Author");
book.chapters=Array.from({length:chapters},(_,i)=>{
 const count=Math.min(perChapter,requested-i*perChapter);
 const paragraphs=[];
 for(let remaining=count;remaining>0;){
  const take=Math.min(120,remaining);
  const text=Array.from({length:take},(_,k)=>tokens[(i*perChapter+count-remaining+k)%tokens.length]).join(" ")+".";
  paragraphs.push({type:"paragraph",content:[{type:"text",text}]});
  remaining-=take;
 }
 return {...blankChapter("Chapter "+(i+1)),content:{type:"doc",content:paragraphs}};
});
book.editions!.print={...getPrintEdition(book),hyphenate:true};
const fonts=Object.fromEntries([["regular","regular"],["italic","italic"],["bold","bold"],["boldItalic","bold-italic"]].map(([key,file])=>[key,new Uint8Array(readFileSync("public/epub-fonts/"+file+".woff"))])) as PrintFonts;
const heapBefore=process.memoryUsage().heapUsed;
const started=performance.now();
const result=await buildPrintPdf(book,fonts,{id:"benchmark",createdAt:"2026-01-01T00:00:00Z"});
const seconds=(performance.now()-started)/1000;
const proof=result.record.pages;
const audit=analyzePrintPages(proof);
const memoryAfter=process.memoryUsage().heapUsed;
const report={requestedWords:requested,chapters,pages:result.record.pageCount,elapsedSeconds:Number(seconds.toFixed(3)),pagesPerSecond:Number((proof.length/seconds).toFixed(2)),heapBeforeBytes:heapBefore,heapAfterBytes:memoryAfter,heapDeltaBytes:memoryAfter-heapBefore,outputBytes:result.bytes.length,sparseBodyPages:audit.sparseBodyPages,unevenFacingSpreads:audit.unevenFacingSpreads,overflow:result.record.checks.overflow,splitViolations:result.record.checks.splitViolations,renderer:result.record.renderer,sourceIsSynthetic:true};
mkdirSync("artifacts",{recursive:true});
writeFileSync("artifacts/print-performance.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
if(report.overflow||report.splitViolations)process.exitCode=1;

}
void main().catch(e=>{console.error(e);process.exitCode=1;});
