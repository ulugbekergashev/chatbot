// Barcha qismlarni bir joyda yig'ish. Serverless "iliq" (warm) bo'lsa, qayta yaratilmaydi.
import { createNotifier } from './admin.js';
import { createBot } from './bot.js';
import { createMetaChannel, createMetaClient } from './channels/meta.js';
import { createTelegramChannel, createTelegramClient } from './channels/telegram.js';
import { getConfig } from './config.js';
import { createLLM } from './llm.js';
import { createStore } from './store.js';

let cached;

export function getContext() {
  if (cached) return cached;

  const config = getConfig();
  const log = console;
  const store = createStore(config);
  const llm = createLLM(config, { log });
  const tg = config.telegram.token ? createTelegramClient(config.telegram.token) : null;
  const meta = createMetaClient(config);
  const notifier = createNotifier(config, tg);

  const channels = {
    ig: createMetaChannel(meta, 'ig'),
    fb: createMetaChannel(meta, 'fb'),
  };
  if (tg) {
    channels.tg = createTelegramChannel(tg);
    channels.tgb = createTelegramChannel(tg);
  }

  const bot = createBot({ config, store, llm, notifier, channels, log });
  cached = { config, store, llm, tg, meta, notifier, channels, bot, log };
  return cached;
}
