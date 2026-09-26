import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanReply, extractPhones, splitMessage, textHash, utf8Bytes, wantsHuman } from '../lib/text.js';

test('cleanReply markdown va <think> ni olib tashlaydi', () => {
  const raw = '<think>hmm</think>## Narxlar\n**1 shifokor**: 190,000\n- Kassa\n* Ombor\n[Sayt](https://dentacrm.uz)\n\n\n\nSavol?';
  assert.equal(cleanReply(raw), 'Narxlar\n1 shifokor: 190,000\n• Kassa\n• Ombor\nSayt: https://dentacrm.uz\n\nSavol?');
});

test("cleanReply oddiy matnni o'zgartirmaydi", () => {
  assert.equal(cleanReply("Klinikangizda nechta shifokor ishlaydi? 2*3=6"), "Klinikangizda nechta shifokor ishlaydi? 2*3=6");
});

test('splitMessage limitdan oshmaydi va matnni yo\'qotmaydi', () => {
  const text = Array.from({ length: 40 }, (_, i) => `Bu ${i}-gap, unda oʻzbekcha harflar bor.`).join(' ');
  const parts = splitMessage(text, 200, utf8Bytes);
  assert.ok(parts.length > 1);
  for (const p of parts) assert.ok(utf8Bytes(p) <= 200, p);
  assert.equal(parts.join(' ').replace(/\s+/g, ' '), text);
});

test('splitMessage juda uzun so\'zni ham bo\'ladi', () => {
  const parts = splitMessage('a'.repeat(25), 10);
  assert.deepEqual(parts, ['a'.repeat(10), 'a'.repeat(10), 'a'.repeat(5)]);
});

test('splitMessage qisqa matnni bitta qoldiradi', () => {
  assert.deepEqual(splitMessage('Salom!', 1000), ['Salom!']);
  assert.deepEqual(splitMessage('   ', 1000), []);
});

test('extractPhones turli formatlarni topadi', () => {
  assert.deepEqual(extractPhones('raqamim +998 90 123 45 67'), ['+998901234567']);
  assert.deepEqual(extractPhones('90-123-45-67 ga qo\'ng\'iroq qiling'), ['+998901234567']);
  assert.deepEqual(extractPhones('(93) 555 12 34'), ['+998935551234']);
  assert.deepEqual(extractPhones('998331112233'), ['+998331112233']);
  assert.deepEqual(extractPhones('8 97 123 45 67'), ['+998971234567']);
  assert.deepEqual(extractPhones('+7 916 123 45 67'), ['+79161234567']);
});

test('extractPhones narx va sanalarni raqam deb o\'ylamaydi', () => {
  assert.deepEqual(extractPhones('narxi 190 000 so\'m, 12.05.2024 dan'), []);
  assert.deepEqual(extractPhones('3 ta shifokor, 290,000'), []);
});

test('wantsHuman operator so\'rovini aniqlaydi', () => {
  assert.ok(wantsHuman('Operator bilan gaplashsam bo‘ladimi'));
  assert.ok(wantsHuman('Menga qo‘ng‘iroq qiling'));
  assert.ok(wantsHuman('можно менеджера?'));
  assert.ok(!wantsHuman('Narxi qancha?'));
});

test('textHash bo\'shliq va registrga sezgir emas', () => {
  assert.equal(textHash('Salom  Dunyo '), textHash('salom dunyo'));
  assert.notEqual(textHash('a'), textHash('b'));
});
