/** Read cached offline assets directly when browser network emulation blocks fetch. */
export async function localAsset(path:string, signal?:AbortSignal):Promise<Response>{
  // Prefer Cache Storage when disconnected. The service worker precaches these files.
  if (typeof navigator !== "undefined" && !navigator.onLine && "caches" in window) {
    const cached=await caches.match(path,{ignoreSearch:true});
    if(cached)return cached;
  }
  try {
    const response=await fetch(path,{signal});
    if(response.ok)return response;
    throw Error("Asset unavailable: "+path);
  } catch(error) {
    if("caches" in window){
      const cached=await caches.match(path,{ignoreSearch:true});
      if(cached)return cached;
    }
    throw error;
  }
}
/** Offline workers can run from the precached, self-contained JavaScript bundle. */
export async function localWorker(path:string):Promise<{worker:Worker;release:()=>void}>{
  if(navigator.onLine)return {worker:new Worker(path),release:()=>{}};
  const response=await localAsset(path);
  const url=URL.createObjectURL(new Blob([await response.text()],{type:"text/javascript"}));
  try {return {worker:new Worker(url),release:()=>URL.revokeObjectURL(url)};}
  catch(error){URL.revokeObjectURL(url);throw error;}
}
