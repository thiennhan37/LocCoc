import { readdir, lstat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const maxBytes=5*1024*1024;
const filename=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/i;
const signature=Buffer.from('89504e470d0a1a0a','hex');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function migrate({directory,store,apply=false,onResult=()=>{}}) {
 if(!directory) throw new Error('An explicit legacy directory is required');
 const root=resolve(directory); const rootStat=await lstat(root);
 if(rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Source must be a real directory');
 const result={copied:0,identical:0,pending:0,failed:0,ignored:0};
 for(const name of (await readdir(root)).sort()) {
  if(!filename.test(name)) {result.ignored++; onResult({file:name,status:'ignored'}); continue;}
  try {
   const path=join(root,name); const info=await lstat(path);
   if(info.isSymbolicLink() || !info.isFile()) throw new Error('Refusing symlink or non-file');
   if(info.size>maxBytes) throw new Error('Source exceeds 5 MiB');
   const file=await open(path,constants.O_RDONLY | (constants.O_NOFOLLOW??0));
   let bytes;
   try {
    const current=await file.stat();
    if(current.ino!==info.ino || current.dev!==info.dev || current.size!==info.size) throw new Error('Source changed during migration');
    const buffer=Buffer.alloc(maxBytes+1); let size=0;
    while(size<buffer.length) {const r=await file.read(buffer,size,buffer.length-size,size); if(r.bytesRead===0) break; size+=r.bytesRead;}
    bytes=buffer.subarray(0,size);
   } finally {await file.close();}
   if(bytes.length>maxBytes || !bytes.subarray(0,8).equals(signature)) throw new Error('Invalid or oversized PNG');
   const key='posts/'+name.toLowerCase(); const checksum=hash(bytes);
   const remote=await store.read(key);
   if(remote!==null) {
    if(hash(remote)!==checksum) throw new Error('Destination differs; refusing overwrite');
    result.identical++; onResult({file:name,status:'identical',sha256:checksum}); continue;
   }
   if(!apply) {result.pending++; onResult({file:name,status:'pending',sha256:checksum}); continue;}
   await store.create(key,bytes);
   const verified=await store.read(key);
   if(verified===null || hash(verified)!==checksum) throw new Error('Destination verification failed');
   result.copied++; onResult({file:name,status:'copied',sha256:checksum});
  } catch(error) {result.failed++; onResult({file:name,status:'failed',reason:error.message});}
 }
 return result;
}
