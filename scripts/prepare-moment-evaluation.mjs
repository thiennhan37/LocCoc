import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const dir=resolve(import.meta.dirname,'../logs/moment-dimensions');
mkdirSync(resolve(dir,'photos'),{recursive:true});
const sources=[
 ['person_man','1506794778202-cad84cf45f1d'],['person_woman','1534528741775-53994a69daeb'],
 ['person_outdoors','1524504388940-b1c1722653e1'],['cycling','1517649763962-0c623066013b'],
 ['bicycle_road','1571068316344-75bc76f77890'],['bicycle_city','1511994298241-608e28f14fde'],
 ['car_dark','1492144534655-ae79c964c9d7'],['car_sport','1503376780353-7e6692767b70'],
 ['dog_golden','1552053831-71594a27632d'],['dog_small','1537151625747-768eb6cf92b2'],
 ['cat_home','1513360371669-4adf3dd7dff8'],['cat_portrait','1573865526739-10659fec78a5'],
 ['coffee_beans','1447933601403-0c6688de566e'],['coffee_cup','1511081692775-05d0f180a065'],
 ['plants','1497250681960-ef046c08a56e'],['flowers','1520763185298-1b434c919102'],
 ['food_salad','1512621776951-a57141f2eefd'],['food_table','1504674900247-0877df9cc836'],
 ['landscape','1500530855697-b586d89ba3ee'],['mountains','1469474968028-56623f02e42e'],
];
const dates=['2026-11-17T00:00:00+07:00','2026-11-16T23:59:59.999+07:00','2026-11-10T12:00:00+07:00','2026-10-01T00:00:00+07:00','2026-10-31T23:59:59.999+07:00','2026-11-01T00:00:00+07:00','2025-06-12T12:00:00+07:00','2026-11-16T12:00:00+07:00','2026-11-17T12:00:00+07:00','2026-10-15T12:00:00+07:00','2026-11-15T23:59:59.999+07:00','2026-11-09T00:00:00+07:00','2026-11-08T23:59:59.999+07:00','2026-11-16T00:00:00+07:00','2026-10-31T12:00:00+07:00','2026-10-01T12:00:00+07:00','2025-12-31T23:59:59.999+07:00','2026-01-01T00:00:00+07:00','2026-11-17T23:59:59.999+07:00','2026-11-14T12:00:00+07:00'];
const path=resolve(dir,'manifest.json');
const manifest=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{albumId:randomUUID(),license:'https://unsplash.com/license',items:sources.map(([label,id],i)=>({label,source:`https://images.unsplash.com/photo-${id}?w=900&q=85&fm=jpg&fit=max`,file:`photos/${String(i+1).padStart(2,'0')}-${label}.jpg`,capturedAt:dates[i],caption:`Thử nghiệm nội dung ${String(i+1).padStart(2,'0')}`,tags:[]}))};
for(const item of manifest.items){
 const file=resolve(dir,item.file);
 if(!existsSync(file)){
  const r=await fetch(item.source,{signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw Error(`${item.label}: HTTP ${r.status}`);
  const bytes=Buffer.from(await r.arrayBuffer());
  if(bytes.length>3*1024*1024||!r.headers.get('content-type')?.startsWith('image/'))throw Error('Unexpected image');
  writeFileSync(file,bytes);
 }
 item.sha256=createHash('sha256').update(readFileSync(file)).digest('hex');
 writeFileSync(path,JSON.stringify(manifest,null,2)+'\n');
 console.log('Downloaded',item.label);
}
