import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toChatMessages } from '../lib/bot.js';
import { igConv, setup } from './helpers.js';

test('xabarga javob beradi, markdown tozalanadi, tarix saqlanadi', async () => {
  const { bot, sent, llmCalls } = setup({ reply: '**Assalomu alaykum!** Nechta shifokor ishlaydi?' });
  const conv = igConv();

  const result = await bot.handleIncoming(conv, { id: 'm1', text: 'Narxi qancha?' });
  assert.equal(result.status, 'replied');
  assert.deepEqual(sent.map((s) => s.text), ['Assalomu alaykum! Nechta shifokor ishlaydi?']);

  const [system, user] = llmCalls[0];
  assert.equal(system.role, 'system');
  assert.match(system.content, /190,000 so'm/);
  assert.match(system.content, /birinchi javobingiz/);
  assert.deepEqual(user, { role: 'user', content: 'Narxi qancha?' });

  await bot.handleIncoming(conv, { id: 'm2', text: '2 ta' });
  const second = llmCalls[1];
  assert.match(second[0].content, /qayta salomlashmang/);
  assert.deepEqual(second.slice(1).map((m) => m.role), ['user', 'assistant', 'user']);
});

test('bir xil xabar ikki marta kelsa, bir marta javob beradi', async () => {
  const { bot, sent } = setup();
  await bot.handleIncoming(igConv(), { id: 'same', text: 'Salom' });
  const again = await bot.handleIncoming(igConv(), { id: 'same', text: 'Salom' });
  assert.equal(again.status, 'duplicate');
  assert.equal(sent.length, 1);
});

test('ketma-ket xabarlarga bitta javob (debounce)', async () => {
  const { bot, sent, llmCalls } = setup({ debounceMs: 80 });
  const conv = igConv();
  const first = bot.handleIncoming(conv, { id: 'a', text: 'Salom' });
  await new Promise((r) => setTimeout(r, 20));
  const second = bot.handleIncoming(conv, { id: 'b', text: 'Narxi qancha?' });
  const results = await Promise.all([first, second]);

  assert.deepEqual(results.map((r) => r.status), ['debounced', 'replied']);
  assert.equal(llmCalls.length, 1);
  assert.equal(llmCalls[0].at(-1).content, 'Salom\nNarxi qancha?');
  assert.equal(sent.length, 1);
});

test('egasi chatga yozsa, bot shu chatda jim turadi va tarix saqlanadi', async () => {
  const { bot, sent, config } = setup();
  const conv = igConv();
  await bot.handleIncoming(conv, { id: 'm1', text: 'Salom' });

  const owner = await bot.handleOwnerMessage(conv, { id: 'o1', text: 'Salom, men Ulugbekman, hozir yordam beraman' });
  assert.equal(owner.status, 'owner_takeover');
  assert.equal((await bot.getPause(conv)).by, 'owner');

  const next = await bot.handleIncoming(conv, { id: 'm2', text: 'Rahmat' });
  assert.equal(next.status, 'paused');
  assert.equal(sent.length, 1);

  const history = await bot.getHistory(conv);
  assert.deepEqual(history.map((h) => [h.role, h.by]), [['user', undefined], ['assistant', 'bot'], ['assistant', 'owner'], ['user', undefined]]);

  // Boshqa chatlar ishlashda davom etadi
  assert.equal((await bot.handleIncoming(igConv('U2'), { id: 'x', text: 'Salom' })).status, 'replied');
  assert.ok(config.bot.takeoverMinutes > 0);
});

test("botning o'z xabari echo bo'lib qaytsa, pauza qilinmaydi", async () => {
  const { bot, sent } = setup();
  const conv = igConv();
  await bot.handleIncoming(conv, { id: 'm1', text: 'Salom' });

  assert.equal((await bot.handleOwnerMessage(conv, { id: 'mid1', text: sent[0].text })).status, 'bot_echo');
  // message_id hali saqlanmagan bo'lsa ham — matn bo'yicha taniladi
  assert.equal((await bot.handleOwnerMessage(conv, { id: 'boshqa-id', text: sent[0].text })).status, 'bot_echo');
  assert.equal(await bot.isPaused(conv), false);
});

test('telefon raqam qoldirilsa — egasiga lead xabari (bir marta)', async () => {
  const { bot, notes } = setup();
  const conv = igConv();
  await bot.handleIncoming(conv, { id: 'm1', text: 'Raqamim 90 123 45 67, qo\'ng\'iroq qiling' });

  const lead = notes.find((n) => n.text.startsWith('🔥'));
  assert.ok(lead);
  assert.match(lead.text, /\+998901234567/);
  assert.equal(lead.conv, 'ig:U1');
  assert.ok(notes.some((n) => n.text.startsWith('🙋')));

  await bot.handleIncoming(conv, { id: 'm2', text: 'yana: +998901234567' });
  assert.equal(notes.filter((n) => n.text.startsWith('🔥')).length, 1);
  assert.equal((await bot.listLeads())[0].phone, '+998901234567');
});

test('LLM ishlamasa — zaxira javob va egasiga ogohlantirish (bir marta)', async () => {
  const { bot, sent, notes } = setup({ llmFails: true });
  await bot.handleIncoming(igConv(), { id: 'm1', text: 'Salom' });
  await bot.handleIncoming(igConv(), { id: 'm2', text: 'Salom?' });
  assert.equal(sent.length, 2);
  assert.match(sent[0].text, /texnik nosozlik/);
  assert.equal(notes.filter((n) => n.text.includes('LLM')).length, 1);
});

test("javob yuborilmasa — egasiga sababi bilan xabar", async () => {
  const { bot, channel, notes } = setup();
  channel.failSend = true;
  const result = await bot.handleIncoming(igConv(), { id: 'm1', text: 'Salom' });
  assert.equal(result.status, 'send_failed');
  assert.ok(notes.some((n) => n.text.includes('token xato')));
});

test("/off — bot hamma joyda to'xtaydi, /on — qayta ishlaydi", async () => {
  const { bot, sent } = setup();
  await bot.setGlobalOff(true);
  assert.equal((await bot.handleIncoming(igConv(), { id: 'm1', text: 'Salom' })).status, 'paused');
  await bot.setGlobalOff(false);
  assert.equal((await bot.handleIncoming(igConv(), { id: 'm2', text: 'Salom' })).status, 'replied');
  assert.equal(sent.length, 1);
});

test('uzun javob kanal limiti bo\'yicha bo\'linadi', async () => {
  const long = Array.from({ length: 60 }, (_, i) => `${i}-jumla DentaCRM haqida.`).join(' ');
  const { bot, sent } = setup({ reply: long });
  await bot.handleIncoming(igConv(), { id: 'm1', text: 'Batafsil' });
  assert.ok(sent.length > 1);
  for (const s of sent) assert.ok(Buffer.byteLength(s.text) <= 1000);
});

test("shaxsiy yordamchi (assistant) leadlarni egasiga yubormaydi", async () => {
  const { bot, notes, llmCalls } = setup();
  const conv = { key: 'tgb:7', channel: 'tgb', chatId: '7', businessConnectionId: 'bc' };
  await bot.handleIncoming(conv, { id: '7:1', text: 'Aka, raqamim 90 123 45 67' });
  assert.match(llmCalls[0][0].content, /Ulug'bekning shaxsiy AI yordamchisisiz/);
  assert.equal(notes.length, 0);
});

test("toChatMessages bir xil rollarni birlashtiradi, boshidagi assistant'ni tashlaydi", () => {
  const messages = toChatMessages([
    { role: 'assistant', content: 'egasi' },
    { role: 'user', content: 'a' },
    { role: 'user', content: 'b' },
    { role: 'assistant', content: 'c' },
  ]);
  assert.deepEqual(messages, [
    { role: 'user', content: 'a\nb' },
    { role: 'assistant', content: 'c' },
  ]);
});
