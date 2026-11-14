// Node >= 20; disposable Neo4j with Query API enabled and auth disabled.
// Run: node --test Database/tests/neo4j-block.test.mjs
// Default endpoint belongs to the temporary test container, not project Compose.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';

const source = await readFile(new URL('../neo4j.cyp', import.meta.url), 'utf8');
const queries = Object.fromEntries([...source.matchAll(/\/\/ name: (\w+)\r?\n([\s\S]*?)(?=\/\/ name:|$)/g)]
  .map(([, name, statement]) => [name, statement.trim()]));
const base = `${process.env.NEO4J_TEST_URL ?? 'http://127.0.0.1:17474'}/db/neo4j/query/v2`;
const prefix = `loccoc-block-test-${randomUUID()}-`;
const id = name => `${prefix}${name}`;
const pair = { from: id('a'), to: id('b') };
const reverse = { from: pair.to, to: pair.from };

async function request(path, statement, parameters = {}, method = 'POST') {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify(statement ? { statement, parameters } : {}) } : {}),
    signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json();
  assert.ok(response.ok, JSON.stringify(result));
  assert.equal(result.errors?.length ?? 0, 0, JSON.stringify(result.errors));
  return result;
}
const cypher = (statement, parameters) => request('', statement, parameters);
const run = (name, parameters = pair) => cypher(queries[name], parameters);
const values = result => result.data?.values ?? [];

async function clean() {
  await cypher('MATCH (u:User) WHERE u.id STARTS WITH $prefix DETACH DELETE u', { prefix });
}
async function fixture() {
  await clean();
  await cypher('UNWIND $ids AS id CREATE (:User {id: id})', { ids: ['a', 'b', 'c', 'd'].map(id) });
}
async function count(type, parameters = pair) {
  return values(await cypher(`MATCH (:User {id:$from})-[r:${type}]-(:User {id:$to}) RETURN count(r)`, parameters))[0][0];
}

await test('Neo4j block protection using the actual neo4j.cyp queries', async t => {
  try {
    const version = await cypher('CALL dbms.components() YIELD versions RETURN versions[0]');
    console.log(`Neo4j ${values(version)[0][0]}`);
    await run('constraint');

    await t.test('unblocked request and accept still create one friendship', async () => {
      await fixture();
      await run('request');
      await run('request');
      assert.equal(await count('REQUESTED'), 1);
      await run('accept');
      await run('accept');
      assert.equal(await count('FRIEND'), 1);
      assert.equal(await count('REQUESTED'), 0);
    });

    await t.test('block removes friendships and pending requests in both directions; repeat is idempotent', async () => {
      await fixture();
      await cypher(`MATCH (a:User {id:$from}), (b:User {id:$to})
        CREATE (a)-[:REQUESTED]->(b), (b)-[:REQUESTED]->(a), (a)-[:FRIEND]->(b), (b)-[:FRIEND]->(a)`, pair);
      const first = values(await run('block'))[0][0].properties.at;
      const repeated = values(await run('block'))[0][0].properties.at;
      assert.equal(first, repeated);
      assert.equal(await count('BLOCKED'), 1);
      assert.equal(await count('REQUESTED'), 0);
      assert.equal(await count('FRIEND'), 0);
    });

    for (const direction of [pair, reverse]) {
      await t.test(`block from ${direction.from === pair.from ? 'sender' : 'recipient'} rejects requests and stale accepts`, async () => {
        await fixture();
        await run('block', direction);
        assert.equal(values(await run('request')).length, 0);
        assert.equal(values(await run('request', reverse)).length, 0);
        // Simulate legacy data whose pending request was not cleaned up.
        await cypher('MATCH (a:User {id:$from}), (b:User {id:$to}) CREATE (a)-[:REQUESTED]->(b)', pair);
        await run('accept');
        assert.equal(await count('FRIEND'), 0);
      });
    }

    await t.test('unblock only removes outgoing block and never restores friendship or pending requests', async () => {
      await fixture();
      await run('block');
      await run('block', reverse);
      await run('unblock');
      await run('unblock');
      assert.equal(await count('BLOCKED'), 1);
      assert.equal(values(await run('request')).length, 0);
      await run('unblock', reverse);
      assert.equal(await count('BLOCKED'), 0);
      assert.equal(await count('FRIEND'), 0);
      assert.equal(await count('REQUESTED'), 0);
      assert.equal(values(await run('request')).length, 1);
    });

    await t.test('read queries exclude blocked legacy friendships and blocked mutual paths', async () => {
      await fixture();
      await cypher(`MATCH (a:User {id:$a}), (b:User {id:$b}), (c:User {id:$c})
        CREATE (a)-[:FRIEND]->(b), (a)-[:FRIEND]->(c), (c)-[:FRIEND]->(b), (b)-[:BLOCKED]->(a)`,
      { a: id('a'), b: id('b'), c: id('c') });
      assert.deepEqual(values(await run('friends', { me: id('a') })), [[id('c')]]);
      assert.deepEqual(values(await run('mutual', { me: id('a'), other: id('b') })), []);
      // Blocked candidate connected via a common friend must not be suggested.
      await cypher('MATCH (a:User {id:$from})-[r:FRIEND]-(b:User {id:$to}) DELETE r', pair);
      assert.deepEqual(values(await run('suggestions', { me: id('a') })), []);
      await run('unblock', reverse);
      assert.deepEqual(values(await run('suggestions', { me: id('a') })), [[id('b'), 1]]);
      await run('block', { from: id('a'), to: id('c') });
      // Even if a stale friendship is reintroduced, it cannot serve as a path.
      await cypher('MATCH (a:User {id:$from}), (b:User {id:$to}) CREATE (a)-[:FRIEND]->(b)', { from: id('a'), to: id('c') });
      assert.deepEqual(values(await run('suggestions', { me: id('a') })), []);
    });

    for (const [first, second] of [['block', 'accept'], ['accept', 'block'], ['block', 'request'], ['request', 'block']]) {
      await t.test(`concurrent ${first} then ${second} leaves block without friendship/request`, async () => {
        await fixture();
        if (first === 'accept' || second === 'accept') await run('request');
        const firstParams = first === 'block' ? reverse : pair;
        const secondParams = second === 'block' ? reverse : pair;
        const opened = await request('/tx', queries[first], firstParams);
        const transaction = `/tx/${opened.transaction.id}`;
        let committed = false;
        const pending = run(second, secondParams);
        // Register rejection handling before waiting for the lock holder to commit.
        const observed = pending.then(result => ({ result }), error => ({ error }));
        try {
          assert.equal(await Promise.race([observed.then(() => 'finished'), delay(150, 'waiting')]), 'waiting');
          await request(`${transaction}/commit`);
          committed = true;
          const result = await observed;
          if (result.error) throw result.error;
          assert.equal(await count('BLOCKED'), 1);
          assert.equal(await count('FRIEND'), 0);
          assert.equal(await count('REQUESTED'), 0);
        } finally {
          if (!committed) await request(transaction, undefined, {}, 'DELETE');
          await observed;
        }
      });
    }

    await t.test('temporary lock property is not persisted', async () => {
      const result = await cypher(`MATCH (u:User) WHERE u.id STARTS WITH $prefix
        AND u._loccoc_pair_lock IS NOT NULL RETURN count(u)`, { prefix });
      assert.equal(values(result)[0][0], 0);
    });
  } finally {
    await clean();
  }
});
