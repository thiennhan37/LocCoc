import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const sharedKeys = ['SEMANTIC_SEARCH_ENABLED', 'AI_SERVICE_TOKEN', 'AI_ACTOR_SECRET', 'EMBEDDING_DIM'];

// Only the internal protocol settings cross service boundaries. Provider keys,
// budgets and storage credentials stay in their owning service.
export function postAiEnvironment(root, environment = process.env) {
  const read = name => {
    const path = resolve(root, name);
    return existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {};
  };
  const ai = read('ai-service/.env');
  const post = {
    ...read('.env'), ...read('post-service/.env'),
    ...read('.env.post-media.local'), ...read('post-service/.env.post-media.local'),
    ...environment,
  };
  const inherited = {};
  for (const key of sharedKeys) {
    if (post[key] === undefined && ai[key] !== undefined) inherited[key] = ai[key];
  }
  const effective = { ...inherited, ...post };
  if (effective.SEMANTIC_SEARCH_ENABLED?.toLowerCase() === 'true') {
    const token = effective.AI_SERVICE_TOKEN ?? '';
    const secret = effective.AI_ACTOR_SECRET ?? '';
    if (token.length < 32 || secret.length < 32 || token === secret) {
      throw new Error('Semantic search requires distinct matching AI_SERVICE_TOKEN and AI_ACTOR_SECRET (at least 32 characters).');
    }
  }
  return { ...inherited, ...environment };
}
