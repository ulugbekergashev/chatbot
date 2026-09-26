// Testlar uchun soxta (fake) LLM, kanal va xabarnoma
import { createBot } from '../lib/bot.js';
import { getConfig } from '../lib/config.js';
import { createMemoryStore } from '../lib/store.js';
import { utf8Bytes } from '../lib/text.js';

export const silentLog = { log() {}, warn() {}, error() {} };

export function setup({ reply = 'Rahmat! Klinikangizda nechta shifokor ishlaydi?', llmFails = false, debounceMs = 0, adminIds = ['42'] } = {}) {
  const config = getConfig();
  config.bot.debounceMs = debounceMs;
  config.telegram.adminIds = adminIds;
  config.owner = { name: "Ulug'bek", about: '' };

  const store = createMemoryStore();
  const sent = [];
  const notes = [];
  const llmCalls = [];

  const llm = {
    available: true,
    async complete(messages) {
      llmCalls.push(messages);
      return llmFails ? null : { text: typeof reply === 'function' ? reply(messages) : reply, provider: 'fake', model: 'fake' };
    },
    transcribeUrl: async () => null,
  };

  const channel = {
    label: 'Instagram',
    maxLength: 1000,
    measure: utf8Bytes,
    failSend: false,
    async send(conv, text) {
      if (channel.failSend) throw new Error('Meta API 400: token xato');
      sent.push({ conv: conv.key, text, businessConnectionId: conv.businessConnectionId });
      return [`mid${sent.length}`];
    },
    typing: async () => {},
  };

  const notifier = { enabled: true, send: async (text, opts = {}) => notes.push({ text, conv: opts.conv?.key }) };
  const channels = { ig: channel, tg: channel, tgb: channel };
  const bot = createBot({ config, store, llm, notifier, channels, log: silentLog });
  return { config, store, llm, channel, notifier, bot, sent, notes, llmCalls };
}

export const igConv = (id = 'U1') => ({ key: `ig:${id}`, channel: 'ig', chatId: id });
