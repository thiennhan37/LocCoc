// Local development fixtures for phatran17; safe to rerun without duplicating rows.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
const { Client } = createRequire(path.join(root, 'user-service/package.json'))('pg');
const viewer = '11111111-1111-4111-8111-111111111111';
const friends = [
  { id: 'ad108a00-1450-4000-8000-000000000001', username: 'seed_minh_an', name: 'Minh An', image: 'p1_sunset.png', captions: ['Hoàng hôn hôm nay thật đẹp.', 'Gửi bạn một chút bình yên.'] },
  { id: 'ad108a00-1450-4000-8000-000000000002', username: 'seed_thao_vy', name: 'Thảo Vy', image: 'p2_cat.png', captions: ['Một chiếc mèo đang nghỉ trưa.', 'Hôm nay bạn có gì vui không?'] },
  { id: 'ad108a00-1450-4000-8000-000000000003', username: 'seed_hoang_nam', name: 'Hoàng Nam', image: 'p3_coffee.png', captions: ['Cà phê sáng cùng một ngày mới.', 'Nghỉ một chút rồi tiếp tục nhé.'] },
];
async function main() {
  const info = JSON.parse(execFileSync('docker', ['inspect', 'loccoc-postgres'], { encoding: 'utf8' }))[0];
  const password = info.Config.Env.find(value => value.startsWith('POSTGRES_PASSWORD=')).slice('POSTGRES_PASSWORD='.length);
  const clients = ['accounts', 'users', 'posts'].map(database => new Client({host:'127.0.0.1',port:5433,user:'postgres',password,database}));
  const [auth, users, posts] = clients;
  const destination = path.join(os.homedir(), 'Downloads', 'LocCoc', 'posts');
  const copied = [];
  try {
    for (const db of clients) { await db.connect(); await db.query('BEGIN'); }
    const owner = (await users.query('SELECT username,email FROM users WHERE id=$1 AND account_status=$2 AND deleted_at IS NULL', [viewer,'active'])).rows[0];
    if (!owner || owner.username !== 'phatran17' || owner.email !== 'demo@example.test') throw new Error('Target account changed; inspect before seeding.');
    fs.mkdirSync(destination, {recursive:true});
    for (const [index, friend] of friends.entries()) {
      const email = `${friend.username}@example.test`;
      // These fixture profiles have no password or social login credentials.
      await auth.query(`INSERT INTO accounts(id,email,role,status,email_verified_at) VALUES($1,$2,'user','active',now()) ON CONFLICT(id) DO NOTHING`, [friend.id,email]);
      const account = (await auth.query('SELECT email,status,account_version FROM accounts WHERE id=$1',[friend.id])).rows[0];
      if (account.email !== email || account.status !== 'active') throw new Error('Fixture ID conflicts with another account.');
      await users.query(`INSERT INTO users(id,email,username,display_name,account_status,account_version) VALUES($1,$2,$3,$4,'active',$5) ON CONFLICT(id) DO NOTHING`,[friend.id,email,friend.username,friend.name,account.account_version]);
      const profile = (await users.query('SELECT username FROM users WHERE id=$1',[friend.id])).rows[0];
      if (profile.username !== friend.username) throw new Error('Fixture username mismatch.');
      const blocks = await users.query('SELECT 1 FROM user_blocks WHERE (blocker_id=$1 AND blocked_id=$2) OR (blocker_id=$2 AND blocked_id=$1)',[viewer,friend.id]);
      if (blocks.rowCount) throw new Error('A fixture is blocked; preserving that block instead of overriding it.');
      await users.query(`INSERT INTO friend_requests(sender_id,receiver_id,status,resolved_at)
        SELECT $1::uuid,$2::uuid,'ACCEPTED',now() WHERE NOT EXISTS
        (SELECT 1 FROM friend_requests WHERE LEAST(sender_id,receiver_id)=LEAST($1::uuid,$2::uuid) AND GREATEST(sender_id,receiver_id)=GREATEST($1::uuid,$2::uuid))`,[viewer,friend.id]);
      await users.query(`INSERT INTO friendships(user_low_id,user_high_id) VALUES(LEAST($1::uuid,$2::uuid),GREATEST($1::uuid,$2::uuid)) ON CONFLICT(user_low_id,user_high_id) DO NOTHING`,[viewer,friend.id]);
      const source = path.join(root,'MobileApp','assets','images',friend.image);
      const bytes = fs.readFileSync(source);
      if (bytes.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Fixture must be PNG.');
      const width=bytes.readUInt32BE(16),height=bytes.readUInt32BE(20);
      for (const [number,caption] of friend.captions.entries()) {
        const sequence=index*2+number+1;
        const id=`ad108b00-1450-4000-8000-${String(sequence).padStart(12,'0')}`;
        const file=path.join(destination,`${id}.png`);
        if (!fs.existsSync(file)) { fs.copyFileSync(source,file,fs.constants.COPYFILE_EXCL); copied.push(file); }
        else if(!fs.readFileSync(file).equals(bytes)) throw new Error('Existing fixture file differs; not overwriting.');
        await posts.query(`INSERT INTO moments(id,owner_id,media_key,media_type,caption,width,height,created_at)
          VALUES($1,$2,$3,0,$4,$5,$6,now()-($7::integer * interval '30 minutes')) ON CONFLICT(id) DO NOTHING`,[id,friend.id,`/posts/media/${id}`,caption,width,height,sequence]);
        const row=(await posts.query('SELECT owner_id,media_key FROM moments WHERE id=$1',[id])).rows[0];
        if(row.owner_id!==friend.id || row.media_key!==`/posts/media/${id}`) throw new Error('Fixture post ID collision.');
      }
    }
    // Separate databases retain their own service ownership. All statements have been validated before commits.
    for (const db of clients) await db.query('COMMIT');
    console.log(JSON.stringify({viewer:owner.username,friends:friends.map(f=>({username:f.username,name:f.name,posts:2})),mediaDirectory:destination},null,2));
  } catch (error) {
    for (const db of clients) await db.query('ROLLBACK').catch(()=>{});
    // Keep any files on an uncertain partial commit; rerunning is idempotent.
    console.error(error.message);
    process.exitCode=1;
  } finally { for (const db of clients) await db.end().catch(()=>{}); }
}
main();
