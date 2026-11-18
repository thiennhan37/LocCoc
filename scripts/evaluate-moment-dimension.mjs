import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createSign} from 'node:crypto';
const root=resolve(import.meta.dirname,'..'),dir=resolve(root,'logs/moment-dimensions');
const dimension=Number(process.argv[2]);if(![1536,3072].includes(dimension))throw Error('Choose 1536 or 3072');
const manifestPath=resolve(dir,'manifest.json'),manifest=JSON.parse(readFileSync(manifestPath));
const owner=process.env.MOMENT_EVAL_OWNER??manifest.owner;
const sessionId=process.env.MOMENT_EVAL_SESSION_ID??manifest.sessionId;
if(!owner||!sessionId)throw Error('Set MOMENT_EVAL_OWNER and MOMENT_EVAL_SESSION_ID or the ignored local manifest fields');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function token(){
 const enc=v=>Buffer.from(JSON.stringify(v)).toString('base64url'),now=Math.floor(Date.now()/1000);
 const unsigned=enc({alg:'RS256',typ:'JWT',kid:'loccoc-2026-01'})+'.'+enc({sub:owner,role:'user',sid:sessionId,iat:now,exp:now+300,iss:'loccoc-auth',aud:'loccoc-api'});
 const signer=createSign('RSA-SHA256');signer.update(unsigned);signer.end();return unsigned+'.'+signer.sign(readFileSync(resolve(root,'secrets/jwt-private.pem'))).toString('base64url');
}
async function api(method,path,body,binary=false){
 const r=await fetch('http://127.0.0.1:8080/moments'+path,{method,headers:{Authorization:`Bearer ${token()}`,...(body?{'Content-Type':binary?'image/jpeg':'application/json'}:{})},body:body?(binary?body:JSON.stringify(body)):undefined,signal:AbortSignal.timeout(20000)});
 const data=await r.json();if(!r.ok)throw Error(`API ${method} ${path} HTTP ${r.status}: ${JSON.stringify(data).slice(0,150)}`);return data;
}
const report={dimension,startedAt:new Date().toISOString(),albumId:manifest.albumId,indexed:[],queries:[],dates:[]};
const output=resolve(dir,`api-${dimension}.json`),save=()=>writeFileSync(output,JSON.stringify(report,null,2)+'\n');
if(existsSync(output)) Object.assign(report,JSON.parse(readFileSync(output)));
let running=false;
for(let attempt=0;attempt<60;attempt++) {
 try {await api('GET','?limit=1');running=true;break;}catch{await sleep(1000);}
}
if(!running)throw Error('Post Service not ready after 60 seconds');
for(const item of manifest.items){
 if(report.indexed.includes(item.label))continue;
 const started=Date.now();
 if(item.id){
  const check=await fetch(`http://127.0.0.1:6333/collections/moments_gemini2_d${dimension}_v1/points/scroll`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({filter:{must:[{key:'ownerId',match:{value:owner}},{key:'assetId',match:{value:item.id}},{key:'albumId',match:{value:manifest.albumId}}]},limit:1,with_vectors:false,with_payload:false})});
  const points=await check.json();const current=await api('GET',`/${item.id}`);
  if(check.ok&&points.result?.points?.length===1&&current.indexStatus==='ready'){report.indexed.push(item.label);save();console.log(`${dimension}: recovered completed ${item.label}`);continue;}
 }
 if(!item.id){const p=await api('POST','',{caption:item.caption,tags:[],capturedAt:item.capturedAt,albumId:manifest.albumId,place:'Bộ kiểm thử'});item.id=p.id;writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');await api('PUT',`/${item.id}/image`,readFileSync(resolve(dir,item.file)),true);}
 else await api('POST',`/${item.id}/retry-index`,{});
 let ready=false;
 for(let i=0;i<60;i++){await sleep(1000);const p=await api('GET',`/${item.id}`);if(p.indexStatus==='ready'){ready=true;break;}if(p.indexStatus==='failed')throw Error(`Index failed: ${item.label}`);}
 if(!ready)throw Error(`Index timed out: ${item.label}`);
 report.indexed.push(item.label);save();console.log(`${dimension}: indexed ${report.indexed.length}/20 ${item.label}`);
 await sleep(Math.max(0,13000-(Date.now()-started)));
}
const labels=new Map(manifest.items.map(x=>[x.id,x.label]));
// The same phrases are reused by temporal tests, avoiding extra paid embeddings.
const queries=['người','xe','xe đạp','chó','mèo','cà phê','hoa','tàu vũ trụ','phương tiện giao thông','con người'];
if(dimension===3072)queries.push('a photo of a person','bông hoa');
for(const query of queries){
 if(report.queries.some(x=>x.query===query))continue;
 const begin=Date.now();const result=await api('POST','/search',{query,albumId:manifest.albumId,limit:50,requireSemantic:true});
 report.queries.push({query,mode:result.mode,latencyMs:Date.now()-begin,ranking:result.items.map(x=>labels.get(x.id))});save();console.log(dimension,query,report.queries.at(-1).ranking.slice(0,3));await sleep(13000);
}
const temporal=[
 ['hôm nay','2026-11-17','2026-11-18'],['hôm qua','2026-11-16','2026-11-17'],
 ['tuần trước','2026-11-09','2026-11-16'],['tháng trước','2026-10-01','2026-11-01'],
 ['tháng 10/2026','2026-10-01','2026-11-01'],['ngày 15/10/2026','2026-10-15','2026-10-16'],
 ['từ ngày 01/10/2026 đến ngày 31/10/2026','2026-10-01','2026-11-01'],['năm ngoái','2025-01-01','2026-01-01']
];
for(const [phrase,from,to] of temporal){
 if(report.dates.some(x=>x.query==='xe đạp '+phrase))continue;
 const query='xe đạp '+phrase,result=await api('POST','/search',{query,albumId:manifest.albumId,limit:50,requireSemantic:true});
 const expected=manifest.items.filter(x=>Date.parse(x.capturedAt)>=Date.parse(from+'T00:00:00+07:00')&&Date.parse(x.capturedAt)<Date.parse(to+'T00:00:00+07:00')).map(x=>x.label).sort();
 const actual=result.items.map(x=>labels.get(x.id)).sort();const filters=result.appliedFilters;
 const passed=JSON.stringify(actual)===JSON.stringify(expected)&&Date.parse(filters.dateFrom)===Date.parse(from+'T00:00:00+07:00')&&Date.parse(filters.dateTo)===Date.parse(to+'T00:00:00+07:00')-1;
 report.dates.push({query,expected,actual,filters,passed});save();console.log('date',query,passed);if(!passed)process.exitCode=1;
}
report.completedAt=new Date().toISOString();save();
