// Telegram kanali: oddiy bot chatlari + Telegram Business (egasining shaxsiy chatlari)
import { handleAdminCallback, handleAdminCommand, isAdmin } from '../admin.js';
import { fetchJson } from '../http.js';

export function createTelegramClient(token) {
  async function api(method, params = {}) {
    const { ok, data } = await fetchJson(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      body: params,
      timeoutMs: 15000,
    });
    if (!ok || !data?.ok) throw new Error(`Telegram ${method}: ${data?.description || 'xato'}`);
    return data.result;
  }

  return {
    api,
    sendMessage: (chatId, text, { businessConnectionId, replyMarkup } = {}) =>
      api('sendMessage', {
        chat_id: chatId,
        text,
        business_connection_id: businessConnectionId,
        reply_markup: replyMarkup,
      }),
    sendChatAction: (chatId, action, businessConnectionId) =>
      api('sendChatAction', { chat_id: chatId, action, business_connection_id: businessConnectionId }),
    getBusinessConnection: (id) => api('getBusinessConnection', { business_connection_id: id }),
    answerCallbackQuery: (id, text) => api('answerCallbackQuery', { callback_query_id: id, text }),
    async fileUrl(fileId) {
      const file = await api('getFile', { file_id: fileId });
      return `https://api.telegram.org/file/bot${token}/${file.file_path}`;
    },
  };
}

// Bitta kanal ikki xil ishlatiladi: "tg" — botning o'z chati, "tgb" — Business orqali egasining chatlari
export function createTelegramChannel(tg) {
  return {
    label: 'Telegram',
    maxLength: 4000,
    measure: (s) => s.length,
    async send(conv, text) {
      const msg = await tg.sendMessage(conv.chatId, text, { businessConnectionId: conv.businessConnectionId });
      return [`${conv.chatId}:${msg.message_id}`];
    },
    typing: (conv) => tg.sendChatAction(conv.chatId, 'typing', conv.businessConnectionId),
  };
}

export function profileFromUser(user) {
  if (!user) return undefined;
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ');
  return { name: name || undefined, username: user.username || undefined };
}

// Telegram xabarini bot tushunadigan matnga aylantirish
export async function telegramMessageToText(msg, { tg, transcribe, transcribeVoice = true }) {
  const parts = [];
  const voice = msg.voice || msg.audio || msg.video_note;
  if (voice) {
    let text = null;
    if (transcribeVoice) {
      const url = await tg.fileUrl(voice.file_id).catch(() => null);
      text = url ? await transcribe(url, msg.video_note ? 'video.mp4' : 'voice.ogg') : null;
    }
    parts.push(text ? `[Ovozli xabar]: ${text}` : '[Ovozli xabar yubordi — matnga aylantirib bo\'lmadi]');
  }
  if (msg.photo) parts.push('[Rasm yubordi]');
  if (msg.video) parts.push('[Video yubordi]');
  if (msg.document) parts.push(`[Fayl yubordi: ${msg.document.file_name || 'hujjat'}]`);
  if (msg.sticker) parts.push(`[Stiker yubordi ${msg.sticker.emoji || ''}]`.replace(' ]', ']'));
  if (msg.contact) parts.push(`[Kontakt yubordi: ${msg.contact.phone_number}]`);
  if (msg.location) parts.push('[Joylashuv yubordi]');
  const text = msg.text || msg.caption;
  if (text) parts.push(text);
  return parts.join('\n').trim();
}

// ---------- Kiruvchi update'larni qayta ishlash ----------

function normalizeConnection(conn) {
  return {
    id: conn.id,
    userId: String(conn.user.id),
    userChatId: conn.user_chat_id,
    canReply: Boolean(conn.rights?.can_reply ?? conn.can_reply),
    isEnabled: Boolean(conn.is_enabled),
  };
}

async function getConnection(id, { tg, store, config }) {
  const cacheKey = `${config.store.prefix}tgconn:${id}`;
  const cached = await store.get(cacheKey);
  if (cached) return cached;
  const conn = normalizeConnection(await tg.getBusinessConnection(id));
  await store.set(cacheKey, conn);
  return conn;
}

// Egasi botni Telegram Business'ga ulaganda / uzganda / ruxsatlarni o'zgartirganda
async function onBusinessConnection(raw, { tg, store, config, log }) {
  const conn = normalizeConnection(raw);
  await store.set(`${config.store.prefix}tgconn:${conn.id}`, conn);

  // Begona odam botni o'z akkauntiga ulab, sizning LLM hisobingizdan foydalanmasligi uchun
  if (!isAdmin(config, conn.userId)) {
    log.warn(`⚠️ Begona Business ulanish: ${conn.userId}`);
    await tg
      .sendMessage(conn.userChatId, `⚠️ Bu bot faqat egasining akkauntida ishlaydi. Agar egasi siz bo'lsangiz, TELEGRAM_ADMIN_IDS ga ${conn.userId} ni qo'shing.`)
      .catch(() => {});
    return;
  }

  let text = "⛔️ Bot Telegram Business'dan uzildi.";
  if (conn.isEnabled) {
    text = conn.canReply
      ? "✅ Bot Telegram Business'ga ulandi — endi chatlaringizga javob beradi.\nChatga o'zingiz yozsangiz, bot o'sha chatda jim turadi. Batafsil: /help"
      : "⚠️ Bot ulandi, lekin xabar yozishga ruxsat berilmagan. Telegram → Sozlamalar → Telegram Business → Chatbotlar bo'limida ruxsat bering.";
  }
  await tg.sendMessage(conn.userChatId, text).catch(() => {});
}

// Egasining shaxsiy chatiga kelgan (yoki egasi o'zi yozgan) xabar
async function onBusinessMessage(msg, ctx) {
  const { bot, tg, config, llm } = ctx;
  if (msg.chat?.type !== 'private' || msg.from?.is_bot) return;
  const conn = await getConnection(msg.business_connection_id, ctx);
  if (!conn.isEnabled || !isAdmin(config, conn.userId)) return;

  const conv = { key: `tgb:${msg.chat.id}`, channel: 'tgb', chatId: String(msg.chat.id), businessConnectionId: conn.id };
  const id = `${msg.chat.id}:${msg.message_id}`;

  if (String(msg.from?.id) === conn.userId) {
    if (msg.sender_business_bot) return; // bu xabarni botning o'zi yuborgan
    const text = await telegramMessageToText(msg, { tg, transcribe: llm.transcribeUrl, transcribeVoice: false });
    await bot.handleOwnerMessage(conv, { id, text });
    return;
  }
  if (!conn.canReply) return;

  const text = await telegramMessageToText(msg, { tg, transcribe: llm.transcribeUrl });
  const result = await bot.handleIncoming(conv, { id, text, profile: profileFromUser(msg.from) });
  ctx.log.log(`↪️ ${conv.key}: ${result.status}`);
}

// Botning o'ziga yozilgan xabar: egasi uchun — boshqaruv, boshqalar uchun — sotuv suhbati
async function onBotMessage(msg, ctx) {
  const { bot, tg, config, llm } = ctx;
  if (msg.chat?.type !== 'private' || msg.from?.is_bot) return;
  const raw = msg.text || '';

  if (raw.startsWith('/')) {
    if (isAdmin(config, msg.from.id) && (await handleAdminCommand(msg, ctx))) return;
    const noAdmins = config.telegram.adminIds.length === 0;
    if (/^\/id\b/.test(raw) || (noAdmins && /^\/start\b/.test(raw))) {
      await tg.sendMessage(
        msg.chat.id,
        `Sizning Telegram ID: ${msg.from.id}${noAdmins ? "\n\nBotni boshqarish uchun shu ID'ni Vercel'da TELEGRAM_ADMIN_IDS ga yozing." : ''}`,
      );
      return;
    }
  }

  const conv = { key: `tg:${msg.chat.id}`, channel: 'tg', chatId: String(msg.chat.id) };
  const text = /^\/start\b/.test(raw) ? 'Assalomu alaykum' : await telegramMessageToText(msg, { tg, transcribe: llm.transcribeUrl });
  const result = await bot.handleIncoming(conv, { id: `${msg.chat.id}:${msg.message_id}`, text, profile: profileFromUser(msg.from) });
  ctx.log.log(`↪️ ${conv.key}: ${result.status}`);
}

export async function handleTelegramUpdate(update, ctx) {
  try {
    if (update.business_connection) await onBusinessConnection(update.business_connection, ctx);
    else if (update.business_message) await onBusinessMessage(update.business_message, ctx);
    else if (update.callback_query) await handleAdminCallback(update.callback_query, ctx);
    else if (update.message) await onBotMessage(update.message, ctx);
  } catch (err) {
    ctx.log.error('❌ Telegram update xatosi:', err);
  }
}

export const TELEGRAM_UPDATES = ['message', 'callback_query', 'business_connection', 'business_message'];
