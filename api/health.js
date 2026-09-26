// Tez tekshiruv: https://<domen>/api/health — nimalar ulangani (maxfiy qiymatlarsiz)
import { getContext } from '../lib/context.js';

export default function handler(req, res) {
  const { config, store, llm } = getContext();
  res.status(200).json({
    ok: true,
    store: store.kind,
    llm: llm.available,
    instagram: Boolean(config.meta.accessToken),
    instagram_signature_check: Boolean(config.meta.appSecret),
    telegram: Boolean(config.telegram.token),
    telegram_admins: config.telegram.adminIds.length,
    personas: config.bot.personas,
  });
}
