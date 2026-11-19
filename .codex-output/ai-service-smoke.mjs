// One-shot diagnostic: synthetic image only; never retries paid generation.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
const require = createRequire(new URL('../ai-service/package.json', import.meta.url));
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { ConfigService } = require('@nestjs/config');
const { ApiExceptionFilter, requestIdMiddleware } = require('@loccoc/common');
const sharp = require('sharp');
process.chdir(fileURLToPath(new URL('../ai-service/', import.meta.url)));
const { AppModule } = await import('../ai-service/dist/app.module.js');
const { IMAGE_PROVIDER } = await import('../ai-service/dist/images/image-provider.js');
const app = await NestFactory.create(AppModule, { logger: false });
app.use(requestIdMiddleware);
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
app.useGlobalFilters(new ApiExceptionFilter());
const config = app.get(ConfigService);
const provider = app.get(IMAGE_PROVIDER);
const original = provider.enhance.bind(provider);
let calls = 0;
provider.enhance = async (image, prompt, signal) => {
  if (++calls > 1) throw new Error('Only one paid call allowed');
  writeFileSync(new URL('./ai-service-live-attempt.used', import.meta.url), new Date().toISOString(), { flag: 'wx' });
  try { return await original(image, prompt, signal); }
  catch (error) {
    const cause = error.cause;
    let message = String(cause?.message ?? error.safeMessage ?? 'Unknown').slice(0, 4000);
    for (const secret of [config.get('GEMINI_API_KEY'), image.bytes.toString('base64'), prompt.prompt]) {
      if (secret) message = message.split(secret).join('[redacted]');
    }
    message = message.replace(/AIza[\w-]+/g, '[redacted]').replace(/[A-Za-z0-9+/=_-]{100,}/g, '[redacted]');
    console.log(JSON.stringify({stage:'provider',code:error.code,status:cause?.status ?? cause?.statusCode,
      errorType:cause?.name,model:config.get('GEMINI_IMAGE_MODEL'),message}));
    throw error;
  }
};
try {
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  const health = await fetch(`${url}/health`);
  console.log(JSON.stringify({stage:'health',status:health.status,body:await health.json()}));
  const svg = '<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" fill="#ddeeff"/><ellipse cx="256" cy="410" rx="150" ry="25" fill="#aabbcc"/><path d="M340 210h35a55 55 0 0 1 0 110h-35" fill="none" stroke="#ff8800" stroke-width="24"/><path d="M140 180h210v180q0 55-105 55t-105-55z" fill="#ff8800"/><ellipse cx="245" cy="180" rx="105" ry="25" fill="#663311"/></svg>';
  const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
  const form = new FormData();
  form.append('filterId', 'subject_sticker');
  form.append('image', new Blob([bytes], {type:'image/png'}), 'synthetic-cup.png');
  const response = await fetch(`${url}/ai/images/enhance`, {method:'POST',body:form,signal:AbortSignal.timeout(70000)});
  if (response.ok) {
    const result = Buffer.from(await response.arrayBuffer());
    writeFileSync(new URL('./ai-service-smoke-result.png',import.meta.url),result);
    console.log(JSON.stringify({stage:'enhance',status:response.status,mime:response.headers.get('content-type'),bytes:result.length,calls}));
  } else {
    console.log(JSON.stringify({stage:'enhance',status:response.status,body:await response.json(),calls}));
  }
} finally { await app.close(); }
