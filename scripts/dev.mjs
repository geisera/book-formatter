import {spawn} from 'node:child_process';
const args=process.argv.slice(2);
// The managed preview launcher supplies Vite-style flags. Serve the verified
// static build there, so service-worker behavior matches deployment.
const preview=args.includes('--strictPort');
const port=args.includes('--port')?args[args.indexOf('--port')+1]:'3000';
const child=preview?spawn('python3',['-m','http.server',port,'--bind','0.0.0.0','--directory','out'],{stdio:'inherit'}):spawn('node',['node_modules/next/dist/bin/next','dev',...args],{stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
