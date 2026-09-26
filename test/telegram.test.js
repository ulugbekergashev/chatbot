import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleTelegramUpdate } from '../lib/channels/telegram.js';
import { setup, silentLog } from './helpers.js';

const OWNER = 42;
const CUSTOMER = 777;

function fakeTelegram({ ownerId = OWNER, canReply = true } = {}) {
  const calls = [];
  return {
    calls,
    async sendMessage(chatId, text, opts = {}) {
      calls.push({ method: 'sendMessage', chatId, text, ...opts });
      return { message_id: calls.length };
    },
    sendChatAction: async () => {},
    async getBusinessConnection(id) {
      return { id, user: { id: ownerId }, user_chat_id: ownerId, rights: { can_reply: canReply }, is_enabled: true };
    },
    async answerCallbackQuery(id, text) {
      calls.push({ method: 'answerCallbackQuery', text });
    },
    fileUrl: async () => null,
  };
}

function context(options) {
  const env = setup();
  const tg = fakeTelegram(options);
  return { ...env, tg, ctx: { ...env, tg, log: silentLog } };
}

const businessMessage = (from, text, extra = {}) => ({
  update_id: Math.floor(Math.random() * 1e9),
  business_message: {
    business_connection_id: 'bc1',
    message_id: Math.floor(Math.random() * 1e9),
    chat: { id: CUSTOMER, type: 'private' },
    from: { id: from, first_name: from === OWNER ? 'Owner' : 'Aziz' },
    text,
    ...extra,
  },
});

test("mijoz egasining shaxsiy chatiga yozsa — bot Business orqali javob beradi", async () => {
  const { ctx, sent, llmCalls } = context();
  await handleTelegramUpdate(businessMessage(CUSTOMER, 'Salom, Ulugbek aka bormilar?'), ctx);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].conv, `tgb:${CUSTOMER}`);
  assert.equal(sent[0].businessConnectionId, 'bc1');
  assert.match(llmCalls[0][0].content, /shaxsiy AI yordamchisisiz/);
  assert.match(llmCalls[0][0].content, /Aziz/);
});

test('egasi o\'zi yozsa — bot shu chatda jim turadi', async () => {
  const { ctx, bot, sent } = context();
  await handleTelegramUpdate(businessMessage(OWNER, 'Salom, hozir gaplashamiz'), ctx);
  assert.equal(await bot.isPaused({ key: `tgb:${CUSTOMER}` }), true);
  await handleTelegramUpdate(businessMessage(CUSTOMER, 'Yaxshi'), ctx);
  assert.equal(sent.length, 0);
});

test("botning o'zi yuborgan xabar (sender_business_bot) pauza qilmaydi", async () => {
  const { ctx, bot } = context();
  await handleTelegramUpdate(businessMessage(OWNER, 'bot javobi', { sender_business_bot: { id: 1, is_bot: true } }), ctx);
  assert.equal(await bot.isPaused({ key: `tgb:${CUSTOMER}` }), false);
});

test("begona odam botni o'z Business akkauntiga ulasa — javob bermaydi", async () => {
  const { ctx, sent } = context({ ownerId: 999 });
  await handleTelegramUpdate(businessMessage(CUSTOMER, 'Salom'), ctx);
  assert.equal(sent.length, 0);
});

test('javob yozishga ruxsat bo\'lmasa — jim', async () => {
  const { ctx, sent } = context({ canReply: false });
  await handleTelegramUpdate(businessMessage(CUSTOMER, 'Salom'), ctx);
  assert.equal(sent.length, 0);
});

test('egasi: /status, /off va chat tugmalari ishlaydi', async () => {
  const { ctx, tg, bot } = context();
  const cmd = (text) => ({ message: { message_id: 1, chat: { id: OWNER, type: 'private' }, from: { id: OWNER }, text } });

  await handleTelegramUpdate(cmd('/status'), ctx);
  assert.match(tg.calls.at(-1).text, /Bot holati/);

  await handleTelegramUpdate(cmd('/off'), ctx);
  assert.equal(await bot.isGlobalOff(), true);
  await handleTelegramUpdate(cmd('/on'), ctx);
  assert.equal(await bot.isGlobalOff(), false);

  await handleTelegramUpdate(cmd(`/start bizChat${CUSTOMER}`), ctx);
  assert.match(tg.calls.at(-1).text, /Bu chatda bot: ✅ faol/);
  assert.equal(tg.calls.at(-1).replyMarkup.inline_keyboard[0][0].callback_data, `p|tgb:${CUSTOMER}`);

  const press = (data, from = OWNER) => ({ callback_query: { id: 'q', from: { id: from }, data } });
  await handleTelegramUpdate(press(`p|tgb:${CUSTOMER}`), ctx);
  assert.equal(await bot.isPaused({ key: `tgb:${CUSTOMER}` }), true);
  await handleTelegramUpdate(press(`r|tgb:${CUSTOMER}`, 12345), ctx);
  assert.equal(await bot.isPaused({ key: `tgb:${CUSTOMER}` }), true, 'begona odam tugmani bosa olmaydi');
  await handleTelegramUpdate(press(`r|tgb:${CUSTOMER}`), ctx);
  assert.equal(await bot.isPaused({ key: `tgb:${CUSTOMER}` }), false);
});

test('oddiy foydalanuvchi botga /start yozsa — sotuv suhbati boshlanadi', async () => {
  const { ctx, sent, llmCalls } = context();
  await handleTelegramUpdate({ message: { message_id: 5, chat: { id: 555, type: 'private' }, from: { id: 555, first_name: 'Dilnoza' }, text: '/start' } }, ctx);
  assert.equal(sent.length, 1);
  assert.equal(llmCalls[0].at(-1).content, 'Assalomu alaykum');
  assert.match(llmCalls[0][0].content, /sotuv menejerisiz/);
});
