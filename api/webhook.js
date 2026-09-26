// Instagram / Facebook Messenger webhook: https://<domen>/api/webhook
import { handleMetaWebhook, verifyMetaSignature } from '../lib/channels/meta.js';
import { getContext } from '../lib/context.js';
import { readRawBody, runInBackground } from '../lib/http.js';

export default async function handler(req, res) {
  const ctx = getContext();
  const { config, log } = ctx;

  // 1. WEBHOOKNI TASDIQLASH — Meta serverimiz ishlayotganini GET so'rov bilan tekshiradi
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    if (mode === 'subscribe' && token === config.meta.verifyToken) {
      log.log('✅ WEBHOOK TASDIQLANDI!');
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.status(403).send('Xato token');
  }

  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // 2. XABAR KELDI — avval haqiqatan Meta'dan kelganini tekshiramiz (META_APP_SECRET sozlangan bo'lsa)
  const raw = await readRawBody(req);
  if (config.meta.appSecret) {
    if (raw === null) {
      log.warn("⚠️ So'rov tanasini o'qib bo'lmadi — imzo tekshirilmadi");
    } else if (!verifyMetaSignature(raw, req.headers['x-hub-signature-256'], config.meta.appSecret)) {
      log.error('⛔️ Webhook imzosi noto\'g\'ri — so\'rov rad etildi');
      return res.status(401).send('Invalid signature');
    }
  }

  let body = req.body;
  if (raw !== null) {
    try {
      body = JSON.parse(raw);
    } catch {
      return res.status(400).send('Bad Request');
    }
  }
  if (body?.object !== 'instagram' && body?.object !== 'page') return res.status(404).send('Not Found');

  // 3. Meta'ga darhol 200 qaytaramiz (aks holda u xabarni qayta yuboradi), javobni fonda tayyorlaymiz
  const work = handleMetaWebhook(body, ctx).catch((err) => log.error('❌ Webhook xatosi:', err));
  if (!runInBackground(work)) await work;
  return res.status(200).send('EVENT_RECEIVED');
}
