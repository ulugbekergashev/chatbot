// Botning "miyasi": kanalga bog'liq bo'lmagan suhbat mantiqi.
//
// Suhbat (conv) = { key: 'ig:123', channel: 'ig', chatId: '123', businessConnectionId? }
// Kanal (channels[conv.channel]) = { label, maxLength, measure, send(conv, text), typing?(conv), fetchProfile?(conv) }
//
// Asosiy g'oyalar:
// - Doimiy xotira: tarix Redis'da, serverless qayta ishga tushsa ham yo'qolmaydi.
// - Debounce: mijoz ketma-ket 3 ta xabar yozsa — 3 ta emas, bitta o'ylangan javob.
// - Human-in-the-loop: egasi chatga o'zi yozsa, bot shu chatda jim turadi va gapni bo'lmaydi.
// - Leadlar: telefon raqam yoki "operator" so'rovi darhol egasiga Telegram orqali yetkaziladi.
import { sleep as defaultSleep } from './http.js';
import { buildSystemPrompt, getPersona } from './personas.js';
import { cleanReply, extractPhones, splitMessage, textHash, wantsHuman } from './text.js';

const DAY = 24 * 60 * 60;

export function createBot({ config, store, llm, notifier, channels, log = console, sleep = defaultSleep, now = Date.now }) {
  const key = (...parts) => config.store.prefix + parts.join(':');
  const personaOf = (conv) => config.bot.personas[conv.channel] || 'sales';
  const channelOf = (conv) => {
    const channel = channels[conv.channel];
    if (!channel) throw new Error(`"${conv.channel}" kanali sozlanmagan`);
    return channel;
  };

  // ---------- Holat: pauza, global o'chirish, profil, tarix ----------

  async function isPaused(conv) {
    return Boolean(await store.get(key('pause', conv.key)));
  }

  // minutes = 0 → qo'lda yoqilmaguncha to'xtab turadi
  async function pause(conv, minutes, by = 'owner') {
    const until = minutes ? now() + minutes * 60 * 1000 : null;
    await store.set(key('pause', conv.key), { by, until }, minutes ? { ttl: minutes * 60 } : {});
  }

  async function resume(conv) {
    await store.del(key('pause', conv.key));
  }

  async function getPause(conv) {
    return store.get(key('pause', conv.key));
  }

  async function isGlobalOff() {
    return Boolean(await store.get(key('global_off')));
  }

  async function setGlobalOff(off) {
    if (off) await store.set(key('global_off'), true);
    else await store.del(key('global_off'));
  }

  async function getProfile(conv) {
    return store.get(key('profile', conv.key));
  }

  async function saveProfile(conv, profile) {
    if (profile) await store.set(key('profile', conv.key), profile, { ttl: 30 * DAY });
  }

  async function addHistory(conv, role, content, extra = {}) {
    if (!content) return;
    await store.push(key('hist', conv.key), { role, content, ts: now(), ...extra }, {
      max: config.bot.historyLimit,
      ttl: 30 * DAY,
    });
  }

  async function getHistory(conv) {
    return store.list(key('hist', conv.key), config.bot.historyLimit);
  }

  async function resetConversation(conv) {
    for (const name of ['hist', 'pend', 'pause', 'profile', 'last']) await store.del(key(name, conv.key));
  }

  async function listLeads(limit = 10) {
    return (await store.list(key('leads'), limit)).reverse();
  }

  // ---------- Echo: bot yuborgan xabarmi yoki egasi o'zi yozganmi ----------

  async function markOutgoing(conv, text) {
    await store.set(key('out', conv.key, textHash(text)), 1, { ttl: 600 });
  }

  async function isBotEcho(conv, { id, text }) {
    if (id && (await store.get(key('sent', id)))) return true;
    return Boolean(text && (await store.get(key('out', conv.key, textHash(text)))));
  }

  // Bir xabarni ikki marta qayta ishlamaslik (Meta va Telegram webhookni qayta yuborishi mumkin)
  async function firstTime(conv, id) {
    if (!id) return true;
    return store.set(key('seen', conv.channel, id), 1, { ttl: DAY, nx: true });
  }

  // ---------- Qulf: bitta suhbatga bir vaqtda faqat bitta javob ----------

  async function acquireLock(conv, waitMs = 25000) {
    const token = `${now()}-${Math.random()}`;
    const deadline = now() + waitMs;
    do {
      if (await store.set(key('lock', conv.key), token, { ttl: 60, nx: true })) return token;
      await sleep(300);
    } while (now() < deadline);
    return null;
  }

  async function releaseLock(conv, token) {
    if ((await store.get(key('lock', conv.key))) === token) await store.del(key('lock', conv.key));
  }

  // ---------- Kiruvchi xabar ----------

  async function handleIncoming(conv, { id, text, profile }) {
    if (!text) return { status: 'empty' };
    if (!(await firstTime(conv, id))) return { status: 'duplicate' };
    if (profile) await saveProfile(conv, profile);

    if ((await isGlobalOff()) || (await isPaused(conv))) {
      await addHistory(conv, 'user', text);
      return { status: 'paused' };
    }

    // Xabarni navbatga qo'yamiz va biroz kutamiz — mijoz yana yozayotgan bo'lishi mumkin
    const marker = id ? String(id) : `${now()}-${Math.random()}`;
    await store.push(key('pend', conv.key), { text, ts: now() }, { ttl: 600 });
    await store.set(key('last', conv.key), marker, { ttl: 600 });
    if (config.bot.debounceMs > 0) await sleep(config.bot.debounceMs);
    if ((await store.get(key('last', conv.key))) !== marker) return { status: 'debounced' };

    const lock = await acquireLock(conv);
    if (!lock) {
      log.error(`⚠️ ${conv.key}: qulf olinmadi, xabar navbatda qoldi`);
      return { status: 'busy' };
    }
    try {
      const pending = await store.drain(key('pend', conv.key));
      if (!pending.length) return { status: 'empty' };
      const userText = pending.map((p) => p.text).join('\n');
      await addHistory(conv, 'user', userText);

      // Kutish paytida egasi suhbatga kirgan bo'lishi mumkin
      if ((await isGlobalOff()) || (await isPaused(conv))) return { status: 'paused' };

      const channel = channelOf(conv);
      channel.typing?.(conv).catch(() => {});
      if (!profile && channel.fetchProfile && !(await getProfile(conv))) {
        await saveProfile(conv, await channel.fetchProfile(conv).catch(() => null));
      }

      const reply = await generateReply(conv);
      if (await isPaused(conv)) return { status: 'paused' };
      try {
        await deliver(conv, reply);
      } catch (err) {
        await alertOnce(`send:${conv.channel}`, 600, `⚠️ ${channel.label}ga javob yuborilmadi: ${err.message}`);
        return { status: 'send_failed', error: err.message };
      }
      await afterReply(conv, userText);
      return { status: 'replied', reply };
    } finally {
      await releaseLock(conv, lock);
    }
  }

  async function generateReply(conv) {
    const persona = personaOf(conv);
    const history = await getHistory(conv);
    const system = buildSystemPrompt(persona, {
      config,
      channelName: channelOf(conv).label,
      profile: await getProfile(conv),
      date: new Date(now()),
      firstReply: !history.some((h) => h.role === 'assistant'),
    });
    const result = llm.available ? await llm.complete([{ role: 'system', content: system }, ...toChatMessages(history)]) : null;
    if (result) {
      log.log(`🤖 ${conv.key}: javob ${result.provider}/${result.model} orqali`);
      return cleanReply(result.text);
    }
    await alertOnce('llm', 600, '⚠️ Bot javob bera olmadi: LLM ishlamayapti (API kalitlari va modellarni tekshiring). Mijozga zaxira javob yuborildi.');
    return getPersona(persona).fallback;
  }

  async function deliver(conv, text) {
    const channel = channelOf(conv);
    for (const chunk of splitMessage(text, channel.maxLength, channel.measure)) {
      await markOutgoing(conv, chunk);
      const ids = await channel.send(conv, chunk);
      for (const id of ids || []) await store.set(key('sent', id), 1, { ttl: DAY });
    }
    await addHistory(conv, 'assistant', text, { by: 'bot' });
  }

  // Lead va "operator" so'rovlarini aniqlab, egasini xabardor qilish
  async function afterReply(conv, userText) {
    if (!getPersona(personaOf(conv)).detectLeads) return;
    const profile = await getProfile(conv);
    const who = describeWho(conv, profile);

    for (const phone of extractPhones(userText)) {
      if (!(await store.set(key('leadmark', conv.key, phone), 1, { ttl: 30 * DAY, nx: true }))) continue;
      const lead = { conv: conv.key, channel: conv.channel, phone, name: profile?.name, username: profile?.username, ts: now() };
      await store.push(key('leads'), lead, { max: 200 });
      await notify(conv, `🔥 Yangi lead!\n${who}\n📞 ${phone}\n\n${await transcript(conv)}`);
    }

    if (wantsHuman(userText) && (await store.set(key('humanreq', conv.key), 1, { ttl: 3600, nx: true }))) {
      await notify(conv, `🙋 Mijoz jonli menejer so'rayapti\n${who}\n\n${await transcript(conv)}`);
    }
  }

  function describeWho(conv, profile) {
    const channel = channels[conv.channel]?.label || conv.channel;
    const name = [profile?.name, profile?.username && `@${profile.username}`].filter(Boolean).join(' ');
    return `📍 ${channel}${name ? ` — ${name}` : ''} (${conv.chatId})`;
  }

  async function transcript(conv, count = 6) {
    const history = (await getHistory(conv)).slice(-count);
    const lines = history.map((h) => `${h.role === 'user' ? '👤' : '🤖'} ${h.content.slice(0, 300)}`);
    return lines.length ? `💬 Oxirgi xabarlar:\n${lines.join('\n')}` : '';
  }

  async function notify(conv, text) {
    if (!notifier?.enabled) {
      log.log(`📣 (xabarnoma sozlanmagan) ${text}`);
      return;
    }
    await notifier.send(text, { conv }).catch((err) => log.error('❌ Xabarnoma yuborilmadi:', err.message));
  }

  async function alertOnce(name, ttl, text) {
    log.error(text);
    if (notifier?.enabled && (await store.set(key('alert', name), 1, { ttl, nx: true }))) {
      await notifier.send(text).catch(() => {});
    }
  }

  // ---------- Egasi o'zi yozgan xabar (Instagram echo / Telegram Business) ----------

  async function handleOwnerMessage(conv, { id, text }) {
    if (await isBotEcho(conv, { id, text })) return { status: 'bot_echo' };
    if (!(await firstTime(conv, id))) return { status: 'duplicate' };

    // Navbatda javobsiz qolgan mijoz xabarlari tarixga — egasi aynan ularga javob beryapti
    const pending = await store.drain(key('pend', conv.key));
    if (pending.length) await addHistory(conv, 'user', pending.map((p) => p.text).join('\n'));
    await addHistory(conv, 'assistant', text || '[media]', { by: 'owner' });

    if (config.bot.takeoverMinutes > 0) await pause(conv, config.bot.takeoverMinutes, 'owner');
    log.log(`👤 ${conv.key}: egasi suhbatga qo'shildi — bot ${config.bot.takeoverMinutes} daqiqa jim turadi`);
    return { status: 'owner_takeover' };
  }

  return {
    handleIncoming,
    handleOwnerMessage,
    pause,
    resume,
    isPaused,
    getPause,
    isGlobalOff,
    setGlobalOff,
    getHistory,
    resetConversation,
    listLeads,
    storeKind: store.kind,
  };
}

// Tarixni model formatiga o'tkazish: ketma-ket bir xil rol birlashtiriladi, boshida assistant bo'lmasligi kerak
export function toChatMessages(history) {
  const messages = [];
  for (const h of history) {
    const role = h.role === 'user' ? 'user' : 'assistant';
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content += `\n${h.content}`;
    else messages.push({ role, content: h.content });
  }
  while (messages.length && messages[0].role !== 'user') messages.shift();
  return messages;
}
