import {readFile,writeFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {resolve,basename} from "node:path";
const [epub,jar,output]=process.argv.slice(2);
if(!epub||!jar){console.error("Usage: node scripts/validate-epub.mjs <book.epub> <epubcheck.jar> [report.json]");process.exit(2);}
const file=resolve(epub), reportPath=resolve(output||epub+".epubcheck.json");
const bytes=await readFile(file);
const sha256=createHash("sha256").update(bytes).digest("hex");
const temp=reportPath+".raw.json";
const result=spawnSync("java",["-jar",resolve(jar),file,"--json",temp],{encoding:"utf8"});
if(result.error){console.error(result.error.message);process.exit(2);}
let raw;
try{raw=JSON.parse(await readFile(temp,"utf8"));}catch(e){console.error("EPUBCheck did not create a valid JSON report.",result.stderr);process.exit(2);}
const checker=raw.checker||{};
const errors=Number(checker.nError||0)+Number(checker.nFatal||0);
const messages=Array.isArray(raw.messages)?raw.messages:[];
const passed=result.status===0&&errors===0;
const envelope={
 format:"book-formatter-epubcheck",version:1,epubFilename:basename(file),sha256,
 checkedAt:new Date().toISOString(),passed,epubCheckVersion:String(checker.version||checker.checkerVersion||"unknown"),
 exitCode:result.status,messages:messages.map(m=>({severity:String(m.severity||m.level||"INFO"),code:String(m.ID||m.id||""),message:String(m.message||""),location:Array.isArray(m.locations)?m.locations.map(l=>[l.path,l.line,l.column].filter(x=>x!==undefined).join(":")).join(", "):"",suggestion:typeof m.suggestion==="string"?m.suggestion:undefined}))
};
await writeFile(reportPath,JSON.stringify(envelope,null,2));
console.log(`EPUBCheck ${passed?"PASSED":"FAILED"}: ${reportPath} (${messages.length} messages)`);
process.exit(passed?0:1);
