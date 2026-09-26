// Egasi uchun boshqaruv paneli — Telegram bot orqali:
// xabarnomalar (yangi lead, operator so'rovi), buyruqlar va har bir chat uchun "to'xtatish/yoqish" tugmalari
import { formatNow } from './personas.js';

export const isAdmin = (config, userId) => config.telegram.adminIds.includes(String(userId));

export function parseConvKey(convKey) {
  const i = convKey.indexOf(':');
  return { key: convKey, channel: convKey.slice(0, i), chatId: convKey.slice(i + 1) };
}

export function convButtons(convKey) {
  return {
    inline_keyboard: [
      [
        { text: "⏸ Botni to'xtatish", callback_data: `p|${convKey}` },
        { text: '▶️ Botni yoqish', callback_data: `r|${convKey}` },
      ],
    ],
  };
}

export function createNotifier(config, tg) {
  const admins = config.telegram.adminIds;
  return {
    enabled: Boolean(tg && admins.length),
    async send(text, { conv } = {}) {
      const replyMarkup = conv ? convButtons(conv.key) : undefined;
      await Promise.all(admins.map((id) => tg.sendMessage(id, text.slice(0, 4000), { replyMarkup })));
    },
  };
}

const PERSONA_NAMES = { sales: 'sotuv menejeri', assistant: 'shaxsiy yordamchi' };

const HELP = `🤖 Boshqaruv buyruqlari:
/status — bot holati va sozlamalar
/off — botni hamma joyda to'xtatish
/on — botni qayta yoqish
/leads — oxirgi leadlar
/reset — shu chatdagi test suhbatini tozalash
/id — Telegram ID'ingiz

💡 Menga oddiy xabar yozsangiz, bot mijozga qanday javob berishini sinab ko'rasiz.
💡 Telegram Business ulangan bo'lsa, istalgan chatingizdagi bot tugmasi orqali shu chatda botni to'xtatish/yoqish mumkin.
💡 Chatga o'zingiz yozsangiz, bot o'sha chatda avtomatik jim turadi.`;

function describePause(pause, config) {
  if (!pause) return '✅ faol';
  if (!pause.until) return "⏸ to'xtatilgan (qo'lda yoqilguncha)";
  return `⏸ to'xtatilgan (${formatNow(new Date(pause.until), config.timezone)} gacha)`;
}

// true qaytarsa — buyruq bajarildi; false — oddiy xabar sifatida botga uzatiladi
export async function handleAdminCommand(msg, { bot, tg, config, llm }) {
  const [rawCommand, ...args] = msg.text.trim().split(/\s+/);
  const command = rawCommand.split('@')[0].toLowerCase();
  const reply = (text, extra) => tg.sendMessage(msg.chat.id, text, extra);

  switch (command) {
    case '/start': {
      // Business chatdagi "botni boshqarish" tugmasi /start bizChat<ID> yuboradi
      const bizChat = args[0]?.match(/^bizChat(\d+)$/);
      if (!bizChat) {
        await reply(HELP);
        return true;
      }
      const conv = parseConvKey(`tgb:${bizChat[1]}`);
      await reply(`Bu chatda bot: ${describePause(await bot.getPause(conv), config)}`, {
        replyMarkup: convButtons(conv.key),
      });
      return true;
    }
    case '/help':
      await reply(HELP);
      return true;
    case '/id':
      await reply(`Sizning Telegram ID: ${msg.from.id}`);
      return true;
    case '/status': {
      const personas = config.bot.personas;
      await reply(
        [
          '🤖 Bot holati',
          `Umumiy: ${(await bot.isGlobalOff()) ? "⛔️ o'chirilgan" : '✅ yoqilgan'}`,
          `Xotira: ${bot.storeKind === 'redis' ? '✅ Redis' : "⚠️ vaqtinchalik (Redis ulanmagan — suhbatlar yo'qolishi mumkin)"}`,
          `Sun'iy intellekt: ${llm.available ? '✅ ulangan' : '❌ API kalit yo\'q'}`,
          `Instagram: ${config.meta.accessToken ? '✅ token bor' : '❌ token yo\'q'}`,
          '',
          `Instagram → ${PERSONA_NAMES[personas.ig] || personas.ig}`,
          `Telegram bot → ${PERSONA_NAMES[personas.tg] || personas.tg}`,
          `Shaxsiy Telegram (Business) → ${PERSONA_NAMES[personas.tgb] || personas.tgb}`,
          `Siz chatga yozsangiz, bot ${config.bot.takeoverMinutes} daqiqa jim turadi`,
        ].join('\n'),
      );
      return true;
    }
    case '/off':
      await bot.setGlobalOff(true);
      await reply("⛔️ Bot hamma joyda to'xtatildi. Yoqish: /on");
      return true;
    case '/on':
      await bot.setGlobalOff(false);
      await reply('✅ Bot yana ishlayapti.');
      return true;
    case '/leads': {
      const leads = await bot.listLeads(10);
      const lines = leads.map((l) => {
        const who = [l.name, l.username && `@${l.username}`].filter(Boolean).join(' ') || l.conv;
        return `• ${l.phone} — ${who} (${formatNow(new Date(l.ts), config.timezone)})`;
      });
      await reply(lines.length ? `🔥 Oxirgi leadlar:\n${lines.join('\n')}` : "Hozircha leadlar yo'q.");
      return true;
    }
    case '/reset':
      await bot.resetConversation(parseConvKey(`tg:${msg.chat.id}`));
      await reply('🧹 Test suhbati tozalandi.');
      return true;
    default:
      return false;
  }
}

export async function handleAdminCallback(query, { bot, tg, config }) {
  if (!isAdmin(config, query.from.id)) {
    await tg.answerCallbackQuery(query.id, "Ruxsat yo'q");
    return;
  }
  const [action, convKey] = String(query.data || '').split('|');
  if (!convKey) return;
  const conv = parseConvKey(convKey);
  if (action === 'p') {
    await bot.pause(conv, 0, 'admin');
    await tg.answerCallbackQuery(query.id, "⏸ Bot bu chatda to'xtatildi");
  } else if (action === 'r') {
    await bot.resume(conv);
    await tg.answerCallbackQuery(query.id, '▶️ Bot bu chatda yana javob beradi');
  }
}
