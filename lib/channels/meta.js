// Instagram Direct va Facebook Messenger (Meta) kanali
import { createHmac, timingSafeEqual } from 'node:crypto';
import { fetchJson } from '../http.js';
import { utf8Bytes } from '../text.js';

// Webhook haqiqatan Meta'dan kelganini tekshirish (X-Hub-Signature-256)
export function verifyMetaSignature(rawBody, header, secret) {
  if (!header || !header.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Meta ikki xil API beradi:
//  - "Instagram Login" — token "IG..." bilan boshlanadi, graph.instagram.com
//  - "Facebook Login" (Page token) — token "EAA..." bilan boshlanadi, graph.facebook.com/{PAGE_ID}
// Qaysi biri ekanini tokenning o'zidan aniqlaymiz.
export function createMetaClient(config) {
  const { accessToken, pageToken, pageId, igAccountId, graphVersion } = config.meta;

  function target(channel) {
    const token = channel === 'fb' ? pageToken || accessToken : accessToken;
    if (!token) throw new Error('Meta access token topilmadi (INSTAGRAM_ACCESS_TOKEN)');
    if (token.startsWith('IG')) {
      return { base: `https://graph.instagram.com/${graphVersion}`, node: igAccountId || 'me', token, bearer: true };
    }
    return { base: `https://graph.facebook.com/${graphVersion}`, node: pageId || 'me', token, bearer: false };
  }

  async function call(channel, path, { method = 'GET', body, query = {} } = {}) {
    const t = target(channel);
    const url = new URL(`${t.base}/${path.replace('{node}', t.node)}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const headers = {};
    if (t.bearer) headers.Authorization = `Bearer ${t.token}`;
    else url.searchParams.set('access_token', t.token);
    return fetchJson(url, { method, headers, body });
  }

  return {
    async sendText(channel, recipientId, text) {
      const { ok, status, data } = await call(channel, '{node}/messages', {
        method: 'POST',
        body: { recipient: { id: recipientId }, message: { text } },
      });
      if (!ok) throw new Error(`Meta API ${status}: ${data?.error?.message || JSON.stringify(data)}`);
      return data?.message_id ? [data.message_id] : [];
    },

    async senderAction(channel, recipientId, action) {
      await call(channel, '{node}/messages', {
        method: 'POST',
        body: { recipient: { id: recipientId }, sender_action: action },
      });
    },

    async fetchProfile(channel, userId) {
      const fields = channel === 'fb' ? 'first_name,last_name' : 'name,username';
      const { ok, data } = await call(channel, userId, { query: { fields } });
      if (!ok || !data) return null;
      const name = data.name || [data.first_name, data.last_name].filter(Boolean).join(' ');
      return { name: name || undefined, username: data.username || undefined };
    },
  };
}

export function createMetaChannel(meta, channel) {
  return {
    label: channel === 'ig' ? 'Instagram' : 'Facebook Messenger',
    maxLength: 1000, // Meta limiti: 1000 bayt (UTF-8)
    measure: utf8Bytes,
    send: (conv, text) => meta.sendText(channel, conv.chatId, text),
    typing: (conv) => meta.senderAction(channel, conv.chatId, 'typing_on'),
    fetchProfile: (conv) => meta.fetchProfile(channel, conv.chatId),
  };
}

// Webhook tanasidan bizga kerakli hodisalarni ajratib olish.
// Qaytaradi: [{ type: 'message' | 'echo', channel, userId, id, text, attachments, storyReply }]
export function parseMetaWebhook(body) {
  const channel = body?.object === 'instagram' ? 'ig' : body?.object === 'page' ? 'fb' : null;
  if (!channel) return [];

  const events = [];
  for (const entry of body.entry || []) {
    // Odatiy format — entry.messaging; Dashboard'dagi "Test" tugmasi — entry.changes
    const items = [
      ...(entry.messaging || []),
      ...(entry.changes || []).filter((c) => c.field === 'messages' && c.value).map((c) => c.value),
    ];
    for (const item of items) {
      const event = parseMessagingItem(item, entry.id, channel);
      if (event) events.push(event);
    }
  }
  return events;
}

function parseMessagingItem(item, ownId, channel) {
  const senderId = item.sender?.id;
  if (item.postback) {
    // Tugma bosilganda — tugma matnini mijoz xabari sifatida qabul qilamiz
    return {
      type: 'message',
      channel,
      userId: senderId,
      id: item.postback.mid || `pb:${senderId}:${item.timestamp}`,
      text: item.postback.title || item.postback.payload || '',
      attachments: [],
    };
  }

  const msg = item.message;
  if (!msg || msg.is_deleted || msg.is_unsupported) return null; // o'qildi, reaksiya va h.k. — e'tiborsiz

  const isEcho = Boolean(msg.is_echo) || (ownId && senderId === ownId);
  const userId = isEcho ? item.recipient?.id : senderId;
  if (!userId) return null;

  return {
    type: isEcho ? 'echo' : 'message',
    channel,
    userId,
    id: msg.mid,
    text: msg.text || '',
    attachments: (msg.attachments || []).map((a) => ({ type: a.type, url: a.payload?.url })),
    storyReply: Boolean(msg.reply_to?.story),
  };
}

const ATTACHMENT_NOTES = {
  image: '[Rasm yubordi]',
  video: '[Video yubordi]',
  file: '[Fayl yubordi]',
  share: '[Post ulashdi]',
  ig_reel: '[Reels ulashdi]',
  reel: '[Reels ulashdi]',
  story_mention: "[O'z hikoyasida (story) sizni belgiladi]",
  animated_image: '[GIF yubordi]',
  like_heart: '[❤️ yubordi]',
};

// Hodisani bot tushunadigan matnga aylantirish (ovozli xabarlar — Whisper orqali)
export async function metaEventToText(event, { transcribe }) {
  const parts = [];
  if (event.storyReply) parts.push('[Hikoyangizga (story) javob yozdi]');
  for (const a of event.attachments || []) {
    if (a.type === 'audio') {
      const text = event.type === 'message' ? await transcribe(a.url, 'audio.mp4') : null;
      parts.push(text ? `[Ovozli xabar]: ${text}` : '[Ovozli xabar yubordi — matnga aylantirib bo\'lmadi]');
    } else {
      parts.push(ATTACHMENT_NOTES[a.type] || '[Fayl yubordi]');
    }
  }
  if (event.text) parts.push(event.text);
  return parts.join('\n').trim();
}

// Webhook'dagi barcha hodisalarni qayta ishlash
export async function handleMetaWebhook(body, { bot, llm, log = console }) {
  const events = parseMetaWebhook(body);
  await Promise.all(
    events.map(async (event) => {
      const conv = { key: `${event.channel}:${event.userId}`, channel: event.channel, chatId: event.userId };
      try {
        const text = await metaEventToText(event, { transcribe: llm.transcribeUrl });
        if (event.type === 'echo') {
          await bot.handleOwnerMessage(conv, { id: event.id, text });
        } else {
          log.log(`📩 ${conv.key}: "${text.slice(0, 200)}"`);
          const result = await bot.handleIncoming(conv, { id: event.id, text });
          log.log(`↪️ ${conv.key}: ${result.status}`);
        }
      } catch (err) {
        log.error(`❌ ${conv.key} xabarini qayta ishlashda xato:`, err);
      }
    }),
  );
}
