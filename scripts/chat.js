// Botni Instagram/Telegram'siz, to'g'ridan-to'g'ri terminalda sinash:
//   npm run chat                      — sotuv menejeri
//   npm run chat -- --persona assistant — shaxsiy yordamchi
// Buyruqlar: /owner <matn> — egasi yozgandek (bot jim bo'ladi), /resume, /reset, /history, /exit
import readline from 'node:readline/promises';
import { createBot } from '../lib/bot.js';
import { getConfig } from '../lib/config.js';
import { createLLM } from '../lib/llm.js';
import { createMemoryStore } from '../lib/store.js';

try {
  process.loadEnvFile('.env');
} catch {
  // .env bo'lmasa — tizim o'zgaruvchilari ishlatiladi
}

const personaArg = process.argv.indexOf('--persona');
const persona = personaArg > -1 ? process.argv[personaArg + 1] : 'sales';

const config = getConfig();
config.bot.debounceMs = 0;
config.bot.personas = { cli: persona };

const llm = createLLM(config);
if (!llm.available) {
  console.error('❌ GROQ_API_KEY yoki OPENROUTER_API_KEY topilmadi (.env faylini tekshiring)');
  process.exit(1);
}

const channel = {
  label: 'Instagram',
  maxLength: 1000,
  measure: (s) => Buffer.byteLength(s, 'utf8'),
  async send(conv, text) {
    console.log(`\n🤖 ${text}\n`);
    return [];
  },
};
const notifier = { enabled: true, send: async (text) => console.log(`\n📣 [egasiga xabarnoma]\n${text}\n`) };
const bot = createBot({ config, store: createMemoryStore(), llm, notifier, channels: { cli: channel } });
const conv = { key: 'cli:me', channel: 'cli', chatId: 'me' };

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log(`💬 Persona: ${persona}. Chiqish: /exit\n`);
let n = 0;
for (;;) {
  const line = (await rl.question('👤 ')).trim();
  if (!line) continue;
  if (line === '/exit') break;
  if (line === '/reset') {
    await bot.resetConversation(conv);
    console.log('🧹 Tozalandi\n');
  } else if (line === '/resume') {
    await bot.resume(conv);
    console.log('▶️ Bot yana javob beradi\n');
  } else if (line === '/history') {
    console.log(await bot.getHistory(conv));
  } else if (line.startsWith('/owner ')) {
    await bot.handleOwnerMessage(conv, { id: `o${++n}`, text: line.slice(7) });
    console.log('👤 Egasi yozdi — bot shu chatda jim turadi (/resume)\n');
  } else {
    const result = await bot.handleIncoming(conv, { id: `m${++n}`, text: line });
    if (result.status !== 'replied') console.log(`(${result.status})\n`);
  }
}
rl.close();
