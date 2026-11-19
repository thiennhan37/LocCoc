// Called only by verify-moments.mjs with isolated Redis/Python and fake Gemini.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(import.meta.dirname, '..');
assert.ok(process.env.POST_TEST_DB_URL?.endsWith('/moment_test'), 'Use isolated verifier only');
const require = createRequire(resolve(root, 'api-gateway/package.json'));
require('reflect-metadata');
const { Test } = require('@nestjs/testing');
const { ConfigService } = require('@nestjs/config');
const { ServiceProxyController } = await import(pathToFileURL(resolve(root,'api-gateway/dist/service-proxy.controller.js')));
const { configureGateway } = await import(pathToFileURL(resolve(root,'api-gateway/dist/bootstrap.js')));
const config = { AI_SERVICE_URL: process.env.AI_SERVICE_URL, AI_SERVICE_TOKEN: process.env.AI_SERVICE_TOKEN, CORS_ORIGINS: 'https://fixture.test' };
const module = await Test.createTestingModule({ controllers: [ServiceProxyController], providers: [
  { provide: ConfigService, useValue: { get: key=>config[key], getOrThrow: key=>config[key] } },
]}).compile();
const app = module.createNestApplication({ logger: false });
configureGateway(app);
try {
  await app.listen(0,'127.0.0.1');
  const origin = await app.getUrl();
  // Generate a known-good PNG via Python fixture-compatible image data (the image must fully decode).
  const { execFileSync } = await import('node:child_process');
  const python=process.platform==='win32' ? 'ai-service/.venv/Scripts/python.exe' : 'ai-service/.venv/bin/python';
  const input=execFileSync(resolve(root,python),['-c',"from PIL import Image;import io,sys;b=io.BytesIO();Image.new('RGB',(8,8),(10,20,30)).save(b,'PNG');sys.stdout.buffer.write(b.getvalue())"],{cwd:root});
  for (const filter of ['handwritten_diary','subject_sticker']) {
    const body=new FormData();body.set('filterId',filter);body.set('image',new Blob([input],{type:'image/png'}),'photo.png');
    const response=await fetch(origin+'/ai/images/enhance',{method:'POST',body,headers:{'x-service-token':'spoof','x-ai-actor':'spoof'},signal:AbortSignal.timeout(10000)});
    assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
    assert.equal(response.headers.get('cache-control'),'no-store');
    const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes[0],137);
  }
  assert.equal((await fetch(origin+'/ai/internal/search',{method:'POST',body:'{}'})).status,404);
  // Direct Python calls cannot bypass the trusted Gateway/service token boundary.
  assert.equal((await fetch(config.AI_SERVICE_URL+'/ai/images/enhance',{method:'POST',body:'x'})).status,401);
  console.log('PASS: real Gateway multipart -> unified Python -> Redis budget -> fake image provider; internal paths blocked');
} finally { await app.close(); }
