import { createSign } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const tempDir = resolve(root, 'temp_seed_photos');
if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });

const adb = 'D:\\MySystemApplication\\My_Android_std\\SDK\\platform-tools\\adb.exe';

const items = [
  {
    name: 'cat.jpg',
    url: 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?w=800&auto=format&fit=crop&q=80',
    caption: 'Cục cưng làm tim mình tan chảy mỗi khi về nhà ❤️',
    place: 'Ở nhà',
    hoursAgo: 2,
  },
  {
    name: 'coffee.jpg',
    url: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800&auto=format&fit=crop&q=80',
    caption: 'Một buổi sáng thật bình yên và thư thái',
    place: 'Góc quen',
    hoursAgo: 5,
  },
  {
    name: 'beach_sunset.jpg',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80',
    caption: 'Nhìn chân trời bao la mà lòng thấy nhẹ nhõm hẳn',
    place: 'Bãi biển',
    hoursAgo: 24,
  },
  {
    name: 'dog.jpg',
    url: 'https://images.unsplash.com/photo-1543466835-00a7907e9de1?w=800&auto=format&fit=crop&q=80',
    caption: 'Bạn đồng hành trung thành và đáng yêu nhất trần đời 🐶',
    place: 'Công viên',
    hoursAgo: 48,
  },
  {
    name: 'pizza.jpg',
    url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800&auto=format&fit=crop&q=80',
    caption: 'Hôm nay vui hết nấc, tự thưởng cho bản thân một bữa thật ngon',
    place: 'Quán quen',
    hoursAgo: 72,
  },
  {
    name: 'mountain.jpg',
    url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&auto=format&fit=crop&q=80',
    caption: 'Cảm giác chinh phục được đỉnh cao thật sự tự hào và phấn khích!',
    place: 'Đỉnh núi',
    hoursAgo: 96,
  },
  {
    name: 'flowers.jpg',
    url: 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?w=800&auto=format&fit=crop&q=80',
    caption: 'Bất ngờ nhận được món quà ngọt ngào, cảm thấy được yêu thương',
    place: 'Vườn hoa',
    hoursAgo: 120,
  },
  {
    name: 'bicycle.jpg',
    url: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?w=800&auto=format&fit=crop&q=80',
    caption: 'Thoát khỏi mọi bộn bề lo toan, cảm nhận sự tự do tự tại',
    place: 'Ngoại ô',
    hoursAgo: 144,
  },
  {
    name: 'rain.jpg',
    url: 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?w=800&auto=format&fit=crop&q=80',
    caption: 'Có những ngày tâm trạng bỗng chùng xuống lạ kỳ...',
    place: 'Phố vắng',
    hoursAgo: 168,
  },
  {
    name: 'guitar.jpg',
    url: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=800&auto=format&fit=crop&q=80',
    caption: 'Giai điệu dịu êm xoa dịu đi tất cả muộn phiền',
    place: 'Phòng trà',
    hoursAgo: 192,
  },
  {
    name: 'books.jpg',
    url: 'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=800&auto=format&fit=crop&q=80',
    caption: 'Đắm chìm vào thế giới riêng, tìm lại sự an yên trong tâm trí',
    place: 'Thư viện',
    hoursAgo: 216,
  },
  {
    name: 'soccer.jpg',
    url: 'https://images.unsplash.com/photo-1579952363873-27f3bade9f55?w=800&auto=format&fit=crop&q=80',
    caption: 'Cháy hết mình vì đam mê cùng những người anh em tuyệt vời!',
    place: 'Sân vận động',
    hoursAgo: 240,
  },
];

// Generate JWT token for ngoclinh_hn
const privateKey = readFileSync(resolve(root, 'secrets/jwt-private.pem'), 'utf8');
const now = Math.floor(Date.now() / 1000);
const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'loccoc-2026-01' })).toString('base64url');
const payload = Buffer.from(JSON.stringify({
  sub: 'cfd428d1-a06a-4346-96ee-3514a5a77217',
  role: 'user',
  sid: 'e7d964c1-2176-49d0-a168-2f5aa90d7146',
  iat: now,
  exp: now + 86400,
  iss: 'loccoc-auth',
  aud: 'loccoc-api',
})).toString('base64url');
const signer = createSign('RSA-SHA256');
signer.update(`${header}.${payload}`);
signer.end();
const token = `${header}.${payload}.${signer.sign(privateKey).toString('base64url')}`;

console.log('JWT Token created successfully.');

// Download each image, push to emulator and upload via API
for (const item of items) {
  const filePath = resolve(tempDir, item.name);
  console.log(`Downloading ${item.name}...`);
  try {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    writeFileSync(filePath, buffer);
    console.log(`  Downloaded ${buffer.length} bytes.`);

    // Push to Android emulator
    try {
      execFileSync(adb, ['push', filePath, `/sdcard/Pictures/${item.name}`], { stdio: 'ignore' });
      execFileSync(adb, ['shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', `file:///sdcard/Pictures/${item.name}`], { stdio: 'ignore' });
      console.log(`  Pushed to emulator: /sdcard/Pictures/${item.name}`);
    } catch (e) {
      console.warn(`  Warning: Could not push to emulator: ${e.message}`);
    }

    // Call POST /moments
    const capturedAt = new Date(Date.now() - item.hoursAgo * 3600 * 1000).toISOString();
    const createRes = await fetch('http://127.0.0.1:8089/moments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        caption: item.caption,
        place: item.place,
        capturedAt,
      }),
    });
    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error(`  Create failed (${createRes.status}): ${errText}`);
      continue;
    }
    const created = await createRes.json();
    const momentId = created.id;
    console.log(`  Created moment: ${momentId}`);

    // Call PUT /moments/:id/image
    const uploadRes = await fetch(`http://127.0.0.1:8089/moments/${momentId}/image`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'image/jpeg',
      },
      body: buffer,
    });
    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error(`  Upload image failed (${uploadRes.status}): ${errText}`);
      continue;
    }
    console.log(`  Image uploaded successfully for moment ${momentId}.`);
  } catch (err) {
    console.error(`  Error processing ${item.name}: ${err.message}`);
  }
}

console.log('Done seeding moments.');
