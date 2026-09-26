// API endpointlarini (Vercel handler) to'liq sinash: tashqi so'rovlar soxta fetch bilan ushlanadi
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { Readable } from 'node:stream';
import { beforeEach, mock, test } from 'node:test';

Object.assign(process.env, {
  INSTAGRAM_ACCESS_TOKEN: 'IGAAtesttoken',
  META_APP_SECRET: 'app-secret',
  GROQ_API_KEY: 'groq-key',
  DEBOUNCE_MS: '0',
  TELEGRAM_BOT_TOKEN: '123:abc',
  TELEGRAM_WEBHOOK_SECRET: 'tg-secret',
  TELEGRAM_ADMIN_IDS: '42',
  VERIFY_TOKEN: 'verify-me',
});
for (const name of ['KV_REST_API_URL', 'KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) delete process.env[name];

for (const method of ['log', 'warn', 'error']) mock.method(console, method, () => {});

const calls = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  const body = typeof init.body === 'string' ? JSON.parse(init.body) : init.body;
  calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body });
  let data = {};
  if (url.includes('api.groq.com')) data = { choices: [{ message: { content: 'Assalomu alaykum! Klinikangizda nechta shifokor ishlaydi?' } }] };
  else if (url.includes('/messages')) data = { recipient_id: 'U1', message_id: `mid.bot${calls.length}` };
  else if (url.includes('graph.instagram.com')) data = { name: 'Aziz Karimov', username: 'aziz_dent' };
  else if (url.includes('getBusinessConnection')) data = { ok: true, result: { id: 'bc1', user: { id: 42 }, user_chat_id: 42, rights: { can_reply: true }, is_enabled: true } };
  else if (url.includes('api.telegram.org')) data = { ok: true, result: { message_id: calls.length } };
  return new Response(JSON.stringify(data), { status: 200 });
};

const { default: metaHandler } = await import('../api/webhook.js');
const { default: telegramHandler } = await import('../api/telegram.js');

function request({ method = 'POST', query = {}, headers = {}, raw } = {}) {
  const req = Readable.from(raw ? [Buffer.from(raw)] : []);
  return Object.assign(req, { method, query, headers });
}

function response() {
  const res = { statusCode: 0, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.send = (body) => ((res.body = body), res);
  res.json = (body) => ((res.body = body), res);
  return res;
}

const sign = (raw) => `sha256=${createHmac('sha256', 'app-secret').update(raw).digest('hex')}`;

beforeEach(() => {
  calls.length = 0;
});

test('Meta webhook tasdiqlash (GET)', async () => {
  const ok = response();
  await metaHandler(request({ method: 'GET', query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'verify-me', 'hub.challenge': '12345' } }), ok);
  assert.deepEqual([ok.statusCode, ok.body], [200, '12345']);

  const bad = response();
  await metaHandler(request({ method: 'GET', query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'xato' } }), bad);
  assert.equal(bad.statusCode, 403);
});

test("imzosiz yoki soxta so'rov rad etiladi", async () => {
  const raw = JSON.stringify({ object: 'instagram', entry: [] });
  const res = response();
  await metaHandler(request({ raw, headers: { 'x-hub-signature-256': 'sha256=deadbeef' } }), res);
  assert.equal(res.statusCode, 401);
  assert.equal(calls.length, 0);
});

test('Instagram xabari → Groq → graph.instagram.com orqali javob', async () => {
  const raw = JSON.stringify({
    object: 'instagram',
    entry: [{ id: 'ME', messaging: [{ sender: { id: 'U1' }, recipient: { id: 'ME' }, message: { mid: 'in-1', text: 'Narxi qancha?' } }] }],
  });
  const res = response();
  await metaHandler(request({ raw, headers: { 'x-hub-signature-256': sign(raw) } }), res);
  assert.deepEqual([res.statusCode, res.body], [200, 'EVENT_RECEIVED']);

  const llm = calls.find((c) => c.url.includes('api.groq.com'));
  assert.equal(llm.body.model, 'openai/gpt-oss-120b');
  assert.equal(llm.body.reasoning_effort, 'low');
  assert.match(llm.body.messages[0].content, /Aziz Karimov @aziz_dent/);

  const send = calls.find((c) => c.url.endsWith('/v24.0/me/messages') && c.body?.message);
  assert.ok(send, "javob Instagram'ga yuborilmadi");
  assert.equal(send.headers.Authorization, 'Bearer IGAAtesttoken');
  assert.deepEqual(send.body, { recipient: { id: 'U1' }, message: { text: 'Assalomu alaykum! Klinikangizda nechta shifokor ishlaydi?' } });

  // Shu xabar qayta kelsa (Meta retry) — ikkinchi javob yo'q
  calls.length = 0;
  await metaHandler(request({ raw, headers: { 'x-hub-signature-256': sign(raw) } }), response());
  assert.equal(calls.filter((c) => c.url.includes('api.groq.com')).length, 0);
});

test("Telegram: maxfiy kalitsiz so'rov rad etiladi, Business xabariga javob beriladi", async () => {
  const update = {
    update_id: 1,
    business_message: {
      business_connection_id: 'bc1',
      message_id: 10,
      chat: { id: 777, type: 'private' },
      from: { id: 777, first_name: 'Aziz' },
      text: 'Salom, Ulugbek aka bormilar?',
    },
  };
  const denied = response();
  await telegramHandler(Object.assign(request(), { body: update }), denied);
  assert.equal(denied.statusCode, 401);

  const res = response();
  await telegramHandler(Object.assign(request({ headers: { 'x-telegram-bot-api-secret-token': 'tg-secret' } }), { body: update }), res);
  assert.equal(res.statusCode, 200);
  const send = calls.find((c) => c.url.endsWith('/sendMessage'));
  assert.equal(send.url, 'https://api.telegram.org/bot123:abc/sendMessage');
  assert.deepEqual([String(send.body.chat_id), send.body.business_connection_id], ['777', 'bc1']);
});
