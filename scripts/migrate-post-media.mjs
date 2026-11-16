import { parseArgs } from 'node:util';
import { migrate } from './lib/post-media-migration.mjs';
import { loadPostS3Config, sdk, objectStore } from './lib/post-s3-config.mjs';
const {values}=parseArgs({options:{source:{type:'string'},apply:{type:'boolean',default:false},'create-bucket':{type:'boolean',default:false}}});
if(!values.source) throw new Error('Usage: node scripts/migrate-post-media.mjs --source <legacy-directory> [--apply] [--create-bucket]');
if(values['create-bucket']&&!values.apply) throw new Error('--create-bucket requires --apply');
const config=loadPostS3Config(); const client=new sdk.S3Client(config.options);
try {
 try {await client.send(new sdk.HeadBucketCommand({Bucket:config.bucket}),{abortSignal:AbortSignal.timeout(10000)});}
 catch(error) {
  if(error.$metadata?.httpStatusCode!==404 || !values['create-bucket']) throw error;
  await client.send(new sdk.CreateBucketCommand({Bucket:config.bucket,...(config.region==='us-east-1'?{}:{CreateBucketConfiguration:{LocationConstraint:config.region}})}),{abortSignal:AbortSignal.timeout(10000)});
 }
 // Refuse a public bucket rather than silently changing an existing policy.
 try {
  const policy=await client.send(new sdk.GetBucketPolicyCommand({Bucket:config.bucket}),{abortSignal:AbortSignal.timeout(10000)});
  const statements=JSON.parse(policy.Policy).Statement??[];
  if(statements.some(s=>s.Effect==='Allow'&&(s.Principal==='*'||s.Principal?.AWS==='*'||s.Principal?.AWS?.includes?.('*')))) throw new Error('Post bucket must be private; public policy detected');
 } catch(error) {if(error.name!=='NoSuchBucketPolicy') throw error;}
 const acl=await client.send(new sdk.GetBucketAclCommand({Bucket:config.bucket}),{abortSignal:AbortSignal.timeout(10000)});
 if((acl.Grants??[]).some(g=>g.Grantee?.URI?.includes('AllUsers')||g.Grantee?.URI?.includes('AuthenticatedUsers'))) throw new Error('Post bucket must be private; public ACL detected');
 const result=await migrate({directory:values.source,store:objectStore(client,config.bucket),apply:values.apply,onResult:r=>console.log(JSON.stringify(r))});
 console.log(JSON.stringify({mode:values.apply?'apply':'dry-run',bucket:config.bucket,...result}));
 if(result.failed) process.exitCode=1;
} catch(error) {
 console.error('Migration failed:',error.name,error.$metadata?.httpStatusCode??'',error.message);
 process.exitCode=1;
} finally {client.destroy();}
