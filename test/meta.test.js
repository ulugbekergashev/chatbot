import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { metaEventToText, parseMetaWebhook, verifyMetaSignature } from '../lib/channels/meta.js';

const OWN = '17841400000000000';

test('oddiy xabar va echo ajratiladi', () => {
  const events = parseMetaWebhook({
    object: 'instagram',
    entry: [
      {
        id: OWN,
        messaging: [
          { sender: { id: 'U1' }, recipient: { id: OWN }, message: { mid: 'm1', text: 'Salom' } },
          { sender: { id: OWN }, recipient: { id: 'U1' }, message: { mid: 'm2', text: 'Javob', is_echo: true } },
          { sender: { id: 'U1' }, recipient: { id: OWN }, read: { mid: 'm2' } },
        ],
      },
    ],
  });
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((e) => [e.type, e.channel, e.userId, e.id, e.text]),
    [
      ['message', 'ig', 'U1', 'm1', 'Salom'],
      ['echo', 'ig', 'U1', 'm2', 'Javob'],
    ],
  );
});

test('Dashboard test formati (changes) va Messenger ham tushuniladi', () => {
  const events = parseMetaWebhook({
    object: 'page',
    entry: [{ id: 'P', changes: [{ field: 'messages', value: { sender: { id: 'U2' }, recipient: { id: 'P' }, message: { mid: 'x', text: 'hi' } } }] }],
  });
  assert.equal(events[0].channel, 'fb');
  assert.equal(events[0].userId, 'U2');
  assert.equal(parseMetaWebhook({ object: 'whatsapp_business_account', entry: [] }).length, 0);
});

test('postback tugma matni xabar sifatida olinadi', () => {
  const [event] = parseMetaWebhook({
    object: 'instagram',
    entry: [{ id: OWN, messaging: [{ sender: { id: 'U3' }, recipient: { id: OWN }, timestamp: 1, postback: { title: 'Narxlar', payload: 'PRICES' } }] }],
  });
  assert.equal(event.text, 'Narxlar');
  assert.equal(event.type, 'message');
});

test('ovozli xabar matnga aylantiriladi, rasm izohlanadi', async () => {
  const [event] = parseMetaWebhook({
    object: 'instagram',
    entry: [
      {
        id: OWN,
        messaging: [
          {
            sender: { id: 'U4' },
            recipient: { id: OWN },
            message: {
              mid: 'm4',
              attachments: [
                { type: 'audio', payload: { url: 'https://cdn/a.mp4' } },
                { type: 'image', payload: { url: 'https://cdn/b.jpg' } },
              ],
            },
          },
        ],
      },
    ],
  });
  const text = await metaEventToText(event, { transcribe: async (url) => (url === 'https://cdn/a.mp4' ? 'narxi qancha' : null) });
  assert.equal(text, '[Ovozli xabar]: narxi qancha\n[Rasm yubordi]');
});

test('webhook imzosi tekshiriladi', () => {
  const raw = '{"object":"instagram"}';
  const sig = `sha256=${createHmac('sha256', 's3cret').update(raw).digest('hex')}`;
  assert.ok(verifyMetaSignature(raw, sig, 's3cret'));
  assert.ok(!verifyMetaSignature(raw, sig, 'boshqa'));
  assert.ok(!verifyMetaSignature(raw, undefined, 's3cret'));
  assert.ok(!verifyMetaSignature(raw, 'sha256=abc', 's3cret'));
});
