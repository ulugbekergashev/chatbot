// Tashqi API'larga so'rov yuborish uchun yordamchi funksiyalar

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// JSON so'rov: har doim { ok, status, data } qaytaradi, timeout bilan
export async function fetchJson(url, { method = 'GET', headers = {}, body, timeoutMs = 15000 } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const init = { method, headers: { ...headers }, signal: AbortSignal.timeout(timeoutMs) };
  if (body !== undefined) {
    if (isForm || typeof body === 'string') {
      init.body = body;
    } else {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
  }
  const res = await fetch(url, init);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: res.ok, status: res.status, data };
}

// So'rovning xom (raw) matnini o'qish — Meta imzosini tekshirish uchun kerak.
// O'qib bo'lmasa null qaytaradi (u holda req.body ishlatiladi).
export async function readRawBody(req) {
  if (typeof req.rawBody === 'string') return req.rawBody;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');
  if (typeof req[Symbol.asyncIterator] !== 'function' || req.readableEnded) return null;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return chunks.length ? Buffer.concat(chunks).toString('utf8') : null;
  } catch {
    return null;
  }
}

// Vercel'da javobni darhol qaytarib, ishni fonda davom ettirish (@vercel/functions'dagi waitUntil
// aynan shu mexanizmdan foydalanadi). Mavjud bo'lmasa false qaytaradi — u holda chaqiruvchi kutadi.
export function runInBackground(promise) {
  const ctx = globalThis[Symbol.for('@vercel/request-context')]?.get?.();
  if (typeof ctx?.waitUntil !== 'function') return false;
  ctx.waitUntil(promise);
  return true;
}
