#!/usr/bin/env node

/**
 * Script Đăng Ký / Cập Nhật Webhook URL trên PayOS
 * Chạy lệnh:
 *   node scripts/register-webhook.js <webhook_url>
 * Hoặc:
 *   npm run webhook:register <webhook_url>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '../.env');

// Đọc file .env nếu có
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...rest] = trimmed.split('=');
      process.env[key.trim()] = rest.join('=').trim();
    }
  }
}

const clientId = process.env.PAYOS_CLIENT_ID;
const apiKey = process.env.PAYOS_API_KEY;
let webhookUrl = process.argv[2];

if (!clientId || !apiKey || clientId === 'your-payos-client-id') {
  console.error('\x1b[31m[LỖI] Chưa cấu hình PAYOS_CLIENT_ID hoặc PAYOS_API_KEY trong file .env!\x1b[0m');
  process.exit(1);
}

if (!webhookUrl) {
  console.error('\x1b[33m[SỬ DỤNG] node scripts/register-webhook.js <webhook_url>\x1b[0m');
  console.error('Ví dụ: node scripts/register-webhook.js https://xxxx.ngrok-free.app/payments/webhook/payos');
  process.exit(1);
}

async function registerWebhook() {
  console.log('\x1b[36mĐang gửi yêu cầu đăng ký Webhook URL tới PayOS...\x1b[0m');
  console.log(`URL: ${webhookUrl}`);
  console.log(`Client ID: ${clientId}`);

  try {
    const res = await fetch('https://api-merchant.payos.vn/confirm-webhook', {
      method: 'POST',
      headers: {
        'x-client-id': clientId,
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ webhookUrl }),
    });

    const data = await res.json();
    if (res.ok && data.code === '00') {
      console.log('\x1b[32m[THÀNH CÔNG] Đã xác nhận Webhook URL với PayOS!\x1b[0m');
      console.log(data);
    } else {
      console.error('\x1b[31m[THẤT BẠI] PayOS phản hồi lỗi:\x1b[0m', data);
      console.log('\n\x1b[33mLƯU Ý: PayOS sẽ gửi 1 request test (POST) tới Webhook URL để xác minh. Hãy đảm bảo API Gateway / Payment Service đang chạy và có thể truy cập từ internet.\x1b[0m');
    }
  } catch (err) {
    console.error('\x1b[31m[LỖI KẾT NỐI]\x1b[0m', err.message);
  }
}

registerWebhook();
