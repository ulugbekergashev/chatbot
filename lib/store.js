// Doimiy xotira: suhbat tarixi, pauzalar, leadlar va h.k.
// Upstash Redis (Vercel Marketplace → Upstash, bepul tarif yetadi) ulangan bo'lsa — Redis,
// aks holda xotira ichida (serverless'da har "sovuq start"da tozalanib ketadi — faqat test uchun).
import { fetchJson } from './http.js';

const encode = (value) => JSON.stringify(value);
function decode(raw) {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function createRedisStore({ url, token }) {
  const base = url.replace(/\/+$/, '');
  const headers = { Authorization: `Bearer ${token}` };

  async function command(...args) {
    const { ok, data } = await fetchJson(base, { method: 'POST', headers, body: args.map(String), timeoutMs: 8000 });
    if (!ok || data?.error) throw new Error(`Redis ${args[0]} xatosi: ${data?.error || 'HTTP xato'}`);
    return data.result;
  }

  async function pipeline(commands) {
    const { ok, data } = await fetchJson(`${base}/pipeline`, {
      method: 'POST',
      headers,
      body: commands.map((c) => c.map(String)),
      timeoutMs: 8000,
    });
    if (!ok || !Array.isArray(data)) throw new Error(`Redis pipeline xatosi: ${JSON.stringify(data)}`);
    return data.map((r) => r.result);
  }

  return {
    kind: 'redis',
    async get(key) {
      return decode(await command('GET', key));
    },
    async set(key, value, { ttl, nx } = {}) {
      const args = ['SET', key, encode(value)];
      if (ttl) args.push('EX', ttl);
      if (nx) args.push('NX');
      return (await command(...args)) === 'OK';
    },
    async del(key) {
      await command('DEL', key);
    },
    // Ro'yxat oxiriga qo'shish; faqat oxirgi `max` tasini saqlaydi
    async push(key, value, { max, ttl } = {}) {
      const cmds = [['RPUSH', key, encode(value)]];
      if (max) cmds.push(['LTRIM', key, -max, -1]);
      if (ttl) cmds.push(['EXPIRE', key, ttl]);
      await pipeline(cmds);
    },
    // Oxirgi `limit` ta element (eskidan yangiga)
    async list(key, limit = 100) {
      const items = await command('LRANGE', key, -limit, -1);
      return (items || []).map(decode);
    },
    // Barcha elementlarni atomar tarzda olib, ro'yxatni bo'shatadi
    async drain(key) {
      const items = await command('LPOP', key, 1000);
      return (items || []).map(decode);
    },
  };
}

export function createMemoryStore({ now = Date.now } = {}) {
  const data = new Map();

  function alive(key) {
    const entry = data.get(key);
    if (!entry) return undefined;
    if (entry.exp && entry.exp <= now()) {
      data.delete(key);
      return undefined;
    }
    return entry;
  }

  const expiry = (ttl, fallback = 0) => (ttl ? now() + ttl * 1000 : fallback);

  return {
    kind: 'memory',
    async get(key) {
      const entry = alive(key);
      return entry ? structuredClone(entry.value) : null;
    },
    async set(key, value, { ttl, nx } = {}) {
      if (nx && alive(key)) return false;
      data.set(key, { value: structuredClone(value), exp: expiry(ttl) });
      return true;
    },
    async del(key) {
      data.delete(key);
    },
    async push(key, value, { max, ttl } = {}) {
      const entry = alive(key);
      const items = Array.isArray(entry?.value) ? entry.value : [];
      items.push(structuredClone(value));
      if (max && items.length > max) items.splice(0, items.length - max);
      data.set(key, { value: items, exp: expiry(ttl, entry?.exp || 0) });
    },
    async list(key, limit = 100) {
      const items = alive(key)?.value;
      return Array.isArray(items) ? structuredClone(items.slice(-limit)) : [];
    },
    async drain(key) {
      const items = alive(key)?.value;
      data.delete(key);
      return Array.isArray(items) ? items : [];
    },
  };
}

export function createStore(config) {
  if (config.store.url && config.store.token) return createRedisStore(config.store);
  console.warn('⚠️ Redis ulanmagan — xotira vaqtinchalik (serverless\'da suhbatlar yo\'qolib ketadi).');
  return createMemoryStore();
}
