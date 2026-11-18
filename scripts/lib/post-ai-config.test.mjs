import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { postAiEnvironment } from './post-ai-config.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'loccoc-post-ai-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'ai-service'));
  mkdirSync(join(root, 'post-service'));
  writeFileSync(join(root, 'ai-service/.env'), `SEMANTIC_SEARCH_ENABLED=true\nAI_SERVICE_TOKEN=${'t'.repeat(40)}\nAI_ACTOR_SECRET=${'a'.repeat(40)}\nGEMINI_EMBEDDING_API_KEY=private-provider-key\nGEMINI_API_KEY=private-image-key\n`);
  return root;
}

test('local Post inherits existing semantic protocol configuration without provider keys', t => {
  const env = postAiEnvironment(fixture(t), {});
  assert.equal(env.SEMANTIC_SEARCH_ENABLED, 'true');
  assert.equal(env.AI_SERVICE_TOKEN, 't'.repeat(40));
  assert.equal(env.AI_ACTOR_SECRET, 'a'.repeat(40));
  assert.equal(env.GEMINI_EMBEDDING_API_KEY, undefined);
  assert.equal(env.GEMINI_API_KEY, undefined);
});

test('explicit Post flags and credentials override the local fallback', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'post-service/.env'), 'SEMANTIC_SEARCH_ENABLED=false\nAI_SERVICE_TOKEN=explicit-post-value\n');
  const env = postAiEnvironment(root, { POST_WORKER_ENABLED: 'false' });
  assert.equal(env.SEMANTIC_SEARCH_ENABLED, undefined);
  assert.equal(env.AI_SERVICE_TOKEN, undefined);
  assert.equal(env.POST_WORKER_ENABLED, 'false');
});

test('process configuration wins and missing semantic credentials fail without echoing them', t => {
  const root = fixture(t);
  assert.equal(postAiEnvironment(root, { SEMANTIC_SEARCH_ENABLED: 'false' }).SEMANTIC_SEARCH_ENABLED, 'false');
  assert.throws(() => postAiEnvironment(root, { AI_ACTOR_SECRET: 'bad-secret' }), error => {
    assert.ok(!error.message.includes('bad-secret'));
    return true;
  });
});

test('no AI env leaves semantic search disabled by default', t => {
  const root = fixture(t);
  rmSync(join(root, 'ai-service/.env'));
  assert.deepEqual(postAiEnvironment(root, {}), {});
});

test('an explicitly empty Post credential cannot silently use the fallback', t => {
  const root = fixture(t);
  writeFileSync(join(root, 'post-service/.env'), 'AI_SERVICE_TOKEN=\n');
  assert.throws(() => postAiEnvironment(root, {}), /Semantic search requires/);
});
