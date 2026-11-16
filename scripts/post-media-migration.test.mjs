import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, mkdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrate } from './lib/post-media-migration.mjs';
const id='11111111-1111-4111-8111-111111111111';
const png=Buffer.from('89504e470d0a1a0a00000000','hex');
async function fixture(t) {
 const directory=await mkdtemp(join(tmpdir(),'post-migration-'));
 t.after(()=>rm(directory,{recursive:true,force:true}));
 await writeFile(join(directory,id+'.png'),png);
 const objects=new Map(); let writes=0;
 const store={async read(key){return objects.get(key)??null;},async create(key,bytes){ writes++; if(objects.has(key)) throw new Error('collision'); objects.set(key,bytes); }};
 return {directory,objects,store,writes:()=>writes};
}
test('dry run writes nothing and leaves source intact',async t=>{
 const f=await fixture(t); const r=await migrate({...f,apply:false});
 assert.equal(r.failed,0); assert.equal(f.writes(),0); assert.equal(r.pending,1);
 assert.deepEqual(await readFile(join(f.directory,id+'.png')),png);
});
test('apply verifies bytes and repeat skips identical object without overwriting',async t=>{
 const f=await fixture(t); const r=await migrate({...f,apply:true});
 assert.equal(r.copied,1); assert.equal(r.failed,0);
 assert.equal((await migrate({...f,apply:true})).identical,1); assert.equal(f.writes(),1);
 assert.deepEqual(await readFile(join(f.directory,id+'.png')),png);
});
test('different destination bytes fail and preserve both copies',async t=>{
 const f=await fixture(t); f.objects.set('posts/'+id+'.png',Buffer.from('other'));
 const r=await migrate({...f,apply:true}); assert.equal(r.failed,1); assert.equal(f.writes(),0);
 assert.deepEqual(await readFile(join(f.directory,id+'.png')),png);
});
test('verification failure is reported without deleting original',async t=>{
 const f=await fixture(t); let reads=0;
 f.store.read=async()=>++reads===1?null:Buffer.from('corrupt');
 assert.equal((await migrate({...f,apply:true})).failed,1);
 assert.deepEqual(await readFile(join(f.directory,id+'.png')),png);
});
test('missing directory refuses to claim successful migration',async()=>{
 await assert.rejects(migrate({directory:join(tmpdir(),'does-not-exist-'+Date.now()),store:{},apply:true}));
});
test('non UUID filenames and invalid PNG are reported, not uploaded',async t=>{
 const f=await fixture(t); await writeFile(join(f.directory,'notes.txt'),'notes');
 await writeFile(join(f.directory,id+'.png'),'not PNG');
 const r=await migrate({...f,apply:true}); assert.equal(r.failed,1); assert.equal(r.ignored,1); assert.equal(f.writes(),0);
});

test('UUID-named symlink is rejected without following it',async t=>{
 const f=await fixture(t);
 const target=join(f.directory,'external'); await mkdir(target);
 await writeFile(join(target,'untouched'),'keep');
 await rm(join(f.directory,id+'.png'));
 try {await symlink(target,join(f.directory,id+'.png'),process.platform==='win32'?'junction':'dir');}
 catch(error) {if(error.code==='EPERM'){t.skip('Host does not allow symlinks');return;}throw error;}
 const r=await migrate({...f,apply:true}); assert.equal(r.failed,1); assert.equal(f.writes(),0);
 assert.equal(await readFile(join(target,'untouched'),'utf8'),'keep');
});
