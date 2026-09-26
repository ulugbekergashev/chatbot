// Telegram webhook: https://<domen>/api/telegram
// Bir martalik sozlash: brauzerda https://<domen>/api/telegram?setup=<TELEGRAM_WEBHOOK_SECRET> ni oching
import { getContext } from '../lib/context.js';
import { TELEGRAM_UPDATES, handleTelegramUpdate } from '../lib/channels/telegram.js';
import { runInBackground } from '../lib/http.js';

export default async function handler(req, res) {
  const ctx = getContext();
  const { config, tg, log } = ctx;
  if (!tg) return res.status(503).send('TELEGRAM_BOT_TOKEN sozlanmagan');

  if (req.method === 'GET') {
    const secret = config.telegram.webhookSecret;
    if (!secret || req.query.setup !== secret) return res.status(403).send('Xato kalit');

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const url = `https://${host}/api/telegram`;
    try {
      await tg.api('setWebhook', { url, secret_token: secret, allowed_updates: TELEGRAM_UPDATES, drop_pending_updates: true });
      const me = await tg.api('getMe');
      return res.status(200).json({
        ok: true,
        webhook: url,
        bot: `@${me.username}`,
        business_mode: Boolean(me.can_connect_to_business),
        next: `Telegram'da @${me.username} ga /start yozing`,
      });
    } catch (err) {
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // So'rov haqiqatan Telegram'dan kelganini tekshirish
  if (config.telegram.webhookSecret && req.headers['x-telegram-bot-api-secret-token'] !== config.telegram.webhookSecret) {
    return res.status(401).send('Unauthorized');
  }

  const update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const work = handleTelegramUpdate(update || {}, ctx).catch((err) => log.error('❌ Telegram xatosi:', err));
  if (!runInBackground(work)) await work;
  return res.status(200).send('OK');
}
