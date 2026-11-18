// Real disposable PostgreSQL/S3; no email, push-provider or Gemini calls.
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

const root=resolve(import.meta.dirname,'..');
const requireAuth=createRequire(resolve(root,'auth-service/package.json'));
const requireUser=createRequire(resolve(root,'user-service/package.json'));
const {Client}=requireAuth('pg');
const {S3Client,ListBucketsCommand,CreateBucketCommand,PutBucketPolicyCommand}=requireUser('@aws-sdk/client-s3');
const suffix=randomUUID().slice(0,8), names=[];
const pgPassword=randomBytes(24).toString('hex'), storageSecret=randomBytes(24).toString('hex');
const env={...process.env,POSTGRES_PASSWORD:pgPassword,AWS_ACCESS_KEY_ID:'fixture-only',AWS_SECRET_ACCESS_KEY:storageSecret};
const report={runId:suffix,startedAt:new Date().toISOString(),checks:[],geminiCalls:0,passed:false};
const docker=args=>execFileSync('docker',args,{env,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
function container(label,image,port,args=[]){
  const name=`loccoc-full-check-${suffix}-${label}`;
  docker(['run','-d','--name',name,'-p',`127.0.0.1::${port}`,...args,image,...(label==='s3'?['mini','-dir=/data','-s3.port=8333']:[])]);
  names.push(name);return Number(docker(['port',name,`${port}/tcp`]).split(':').at(-1));
}
async function ready(work,label){
  for(let n=0;n<90;n++){try{await work();return;}catch{await new Promise(r=>setTimeout(r,500));}}
  throw new Error(`${label} readiness timeout`);
}
async function suite(service,args,extra){
  const child=spawn(process.execPath,[resolve(root,service,'node_modules/vitest/vitest.mjs'),'run',...args],{cwd:resolve(root,service),env:{...env,...extra},stdio:'inherit',windowsHide:true});
  const code=await new Promise((done,reject)=>{child.once('error',reject);child.once('exit',done);});
  report.checks.push({service,exitCode:code});
  if(code!==0)report.failedSuites=true;
}
let s3;
try{
  const pgPort=container('postgres','postgres:17',5432,['-e','POSTGRES_PASSWORD','-e','POSTGRES_DB=project_test']);
  const s3Port=container('s3','chrislusf/seaweedfs:4.53@sha256:ccad23e18639c8b98cee17e7100b95830a06077b56d8e5b006d6dcf8ec5e94a0',8333,['-e','AWS_ACCESS_KEY_ID','-e','AWS_SECRET_ACCESS_KEY']);
  const dbUrl=`postgres://postgres:${pgPassword}@127.0.0.1:${pgPort}/project_test`;
  await ready(async()=>{const c=new Client({connectionString:dbUrl,connectionTimeoutMillis:1000});try{await c.connect();await c.query('SELECT 1');}finally{await c.end();}},'PostgreSQL');
  const endpoint=`http://127.0.0.1:${s3Port}`;
  s3=new S3Client({endpoint,region:'us-east-1',forcePathStyle:true,maxAttempts:1,credentials:{accessKeyId:'fixture-only',secretAccessKey:storageSecret}});
  await ready(()=>s3.send(new ListBucketsCommand({}),{abortSignal:AbortSignal.timeout(1000)}),'S3');
  await s3.send(new CreateBucketCommand({Bucket:'loccoc-media-test'}));
  await s3.send(new PutBucketPolicyCommand({Bucket:'loccoc-media-test',Policy:JSON.stringify({Version:'2012-10-17',Statement:[{Effect:'Allow',Principal:'*',Action:'s3:GetObject',Resource:'arn:aws:s3:::loccoc-media-test/*'}]})}));
  await suite('auth-service',['--config','vitest.config.e2e.ts'],{SESSION_TEST_DB_URL:dbUrl});
  await suite('notification-service',['test/inbox.postgres.spec.ts','test/auth-push.postgres.spec.ts'],{NOTIFICATION_TEST_DB_URL:dbUrl,NOTIFICATION_TEST_KAFKA_BROKERS:'127.0.0.1:9092'});
  await suite('user-service',['--config','vitest.config.e2e.ts','test/media.postgres.e2e-spec.ts'],{MEDIA_TEST_DB_URL:dbUrl,MEDIA_TEST_S3_ENDPOINT:endpoint,MEDIA_TEST_S3_ACCESS_KEY:'fixture-only',MEDIA_TEST_S3_SECRET_KEY:storageSecret});
  report.passed=!report.failedSuites;
}catch{report.error='Integration runner failed; inspect dependency availability and local test log';}
finally{
  s3?.destroy();report.cleanup=[];
  for(const name of names.reverse()){try{docker(['rm','-f','-v',name]);report.cleanup.push({name,removed:true});}catch{report.cleanup.push({name,removed:false});report.passed=false;}}
  report.completedAt=new Date().toISOString();
  const directory=resolve(root,'logs/full-project');mkdirSync(directory,{recursive:true});
  writeFileSync(resolve(directory,`iam-media-${suffix}.json`),JSON.stringify(report,null,2));
  console.log(`IAM/notification/media integration ${report.passed?'PASS':'FAIL'}; Gemini requests: 0; disposable resources cleaned.`);
  if(!report.passed)process.exitCode=1;
}
