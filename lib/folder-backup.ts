/** Optional browser-local folder backup. Handles remain in IndexedDB, never uploaded. */
export type BackupFolder = FileSystemDirectoryHandle;
const DATABASE="book-formatter-backup-folder";
function database():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DATABASE,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains("settings"))req.result.createObjectStore("settings");};
  req.onerror=()=>reject(req.error);
  req.onsuccess=()=>resolve(req.result);
 });
}
async function setting<T>(key:string,value?:T):Promise<T|undefined>{
 const db=await database();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction("settings",value===undefined?"readonly":"readwrite");
  const request=value===undefined?tx.objectStore("settings").get(key):tx.objectStore("settings").put(value,key);
  request.onsuccess=()=>resolve(value===undefined?request.result as T:value);
  request.onerror=()=>reject(request.error);
  tx.oncomplete=()=>db.close();
  tx.onerror=()=>db.close();
 });
}
export function getBackupFolder(){return setting<BackupFolder>("folder");}
export function saveBackupFolder(folder:BackupFolder){return setting("folder",folder);}
export async function clearBackupFolder(){
 const db=await database();
 await new Promise<void>((resolve,reject)=>{
  const tx=db.transaction("settings","readwrite");
  tx.objectStore("settings").delete("folder");
  tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);
 });
 db.close();
}
export async function folderPermission(folder:BackupFolder,request=false){
 const options={mode:"readwrite" as const};
 const handle=folder as BackupFolder & {queryPermission:(o:{mode:"readwrite"})=>Promise<PermissionState>;requestPermission:(o:{mode:"readwrite"})=>Promise<PermissionState>};
 return request?handle.requestPermission(options):handle.queryPermission(options);
}
export async function writeFolderBackup(folder:BackupFolder,name:string,bytes:Uint8Array){
 const file=await folder.getFileHandle(name,{create:true});
 const stream=await file.createWritable();
 try{await stream.write(new Uint8Array(bytes));await stream.close();}
 catch(error){await stream.abort().catch(()=>{});throw error;}
}
