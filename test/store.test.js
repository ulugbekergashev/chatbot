import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createMemoryStore, createRedisStore } from '../lib/store.js';

test('memory store: set/get, NX va TTL', async () => {
  let t = 0;
  const store = createMemoryStore({ now: () => t });
  assert.equal(await store.set('a', { x: 1 }, { ttl: 10 }), true);
  assert.deepEqual(await store.get('a'), { x: 1 });
  assert.equal(await store.set('a', 2, { nx: true }), false);
  t = 11_000;
  assert.equal(await store.get('a'), null);
  assert.equal(await store.set('a', 2, { nx: true }), true);
});

test('memory store: push/list/drain', async () => {
  const store = createMemoryStore();
  for (let i = 1; i <= 5; i++) await store.push('l', i, { max: 3 });
  assert.deepEqual(await store.list('l', 10), [3, 4, 5]);
  assert.deepEqual(await store.list('l', 2), [4, 5]);
  assert.deepEqual(await store.drain('l'), [3, 4, 5]);
  assert.deepEqual(await store.drain('l'), []);
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("redis store Upstash REST buyruqlarini to'g'ri yuboradi", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body, auth: init.headers.Authorization });
    const result = url.endsWith('/pipeline') ? body.map(() => ({ result: 'OK' })) : { result: body[0] === 'GET' ? '{"a":1}' : 'OK' };
    return new Response(JSON.stringify(result), { status: 200 });
  };
  const store = createRedisStore({ url: 'https://x.upstash.io/', token: 'tok' });
  assert.deepEqual(await store.get('k'), { a: 1 });
  assert.equal(await store.set('k', { b: 2 }, { ttl: 60, nx: true }), true);
  await store.push('l', 'v', { max: 5, ttl: 100 });

  assert.equal(calls[0].url, 'https://x.upstash.io');
  assert.equal(calls[0].auth, 'Bearer tok');
  assert.deepEqual(calls[1].body, ['SET', 'k', '{"b":2}', 'EX', '60', 'NX']);
  assert.equal(calls[2].url, 'https://x.upstash.io/pipeline');
  assert.deepEqual(calls[2].body, [['RPUSH', 'l', '"v"'], ['LTRIM', 'l', '-5', '-1'], ['EXPIRE', 'l', '100']]);
});
