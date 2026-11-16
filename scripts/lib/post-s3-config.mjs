import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
const require=createRequire(new URL('../../user-service/package.json',import.meta.url));
export const sdk=require('@aws-sdk/client-s3');
export function loadPostS3Config() {
 const read=url=>existsSync(url)?parseEnv(readFileSync(url,'utf8')):{};
 const config={...read(new URL('../../.env',import.meta.url)),...read(new URL('../../post-service/.env',import.meta.url)),...read(new URL('../../.env.post-media.local',import.meta.url)),...process.env};
 const endpoint=config.POST_S3_ENDPOINT??'http://127.0.0.1:9000';
 const accessKeyId=config.POST_S3_ACCESS_KEY||config.MEDIA_S3_ACCESS_KEY;
 const secretAccessKey=config.POST_S3_SECRET_KEY||config.MEDIA_S3_SECRET_KEY;
 if(Boolean(accessKeyId)!==Boolean(secretAccessKey)) throw new Error('Configure both S3 credentials');
 if(endpoint) {const url=new URL(endpoint); if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash) throw new Error('Invalid S3 endpoint');}
 return {bucket:config.POST_S3_BUCKET||'loccoc-posts',region:config.POST_S3_REGION||'us-east-1',options:{
  ...(endpoint?{endpoint}:{}),region:config.POST_S3_REGION||'us-east-1',forcePathStyle:(config.POST_S3_PATH_STYLE??'true')==='true',
  ...(accessKeyId?{credentials:{accessKeyId,secretAccessKey}}:{}),maxAttempts:1,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',
 }};
}
export function objectStore(client,bucket) {
 return {
  async read(key) {
   try {
    const response=await client.send(new sdk.GetObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(15000)});
    const chunks=[]; let size=0;
    for await(const chunk of response.Body) {size+=chunk.length; if(size>5*1024*1024){response.Body.destroy();throw new Error('Remote object exceeds 5 MiB');} chunks.push(chunk);}
    return Buffer.concat(chunks);
   } catch(error) {if(error.name==='NoSuchKey')return null; throw error;}
  },
  async create(key,bytes) {
   await client.send(new sdk.PutObjectCommand({Bucket:bucket,Key:key,Body:bytes,ContentType:'image/png',CacheControl:'private, no-store',IfNoneMatch:'*'}),{abortSignal:AbortSignal.timeout(15000)});
  }
 };
}
