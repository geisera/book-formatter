import {build} from "esbuild";
import {spawnSync} from "node:child_process";
await build({entryPoints:["scripts/benchmark-print.ts"],bundle:true,platform:"node",format:"cjs",target:"es2022",outfile:"artifacts/benchmark-print.cjs"});
const run=spawnSync(process.execPath,["--expose-gc","artifacts/benchmark-print.cjs",...process.argv.slice(2)],{stdio:"inherit"});
process.exit(run.status??1);
