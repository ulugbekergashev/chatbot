# DentaCRM AI chatbot

Instagram Direct va Telegram'dagi xabarlarga sun'iy intellekt orqali javob beradigan bot. Ikkita vazifasi bor:

1. **Sotuv menejeri** — Instagram (va Telegram bot) orqali yozgan klinikalar bilan gaplashadi, ehtiyojini aniqlaydi, DentaCRM'ni taklif qiladi va telefon raqamini oladi.
2. **Shaxsiy yordamchi** — siz band bo'lganingizda **sizning shaxsiy Telegram chatlaringizga** (Telegram Business orqali) javob beradi.

## Konsepsiya

Oddiy "savolga javob" boti emas, balki **sotuv voronkasi + inson nazorati** (human-in-the-loop):

```
 Mijoz yozadi ──► Bot tushunadi ──► Ehtiyojni aniqlaydi ──► Qiymat ──► Narx ──► Demo / sinov / raqam
                                                                                        │
     Siz (Telegram) ◄──── 🔥 "Yangi lead: +998..." [⏸ To'xtatish] [▶️ Yoqish] ◄───────────┘
         │
         └── chatga o'zingiz yozsangiz, bot o'sha chatda jim bo'ladi — gapingizni bo'lmaydi
```

| Muammo (eski versiya) | Yechim |
|---|---|
| Suhbat tarixi xotirada — Vercel har safar "unutardi" | Upstash Redis'da doimiy tarix |
| Siz javob bersangiz ham bot aralashardi | Siz yozgan zahoti bot o'sha chatda jim turadi (standart: 12 soat) |
| "Salom", "narxi?", "?" — 3 ta xabarga 3 ta javob | 3 soniya kutib, hammasiga bitta o'ylangan javob |
| Mijoz raqam qoldirsa, hech kim bilmasdi | Darhol Telegram'ingizga xabar + suhbat parchasi |
| Ovozli xabarlarni tushunmasdi | Groq Whisper orqali matnga aylantiradi |
| Meta xabarni qayta yuborsa — ikki marta javob | Har xabar bir marta qayta ishlanadi |
| Webhook'ga istalgan odam so'rov yubora olardi | Meta imzosi va Telegram maxfiy kaliti tekshiriladi |
| `llama-3.3-70b` Groq'da endi faqat Enterprise tarifda | `openai/gpt-oss-120b` → `gpt-oss-20b` → OpenRouter zaxirasi |
| Instagram token turiga qarab endpoint chalkashligi | Token (`IG...` / `EAA...`) turi avtomatik aniqlanadi |
| Narx/ma'lumot kod ichida | `lib/knowledge.js` — faqat shu faylni tahrirlaysiz |

## Tuzilishi

```
api/webhook.js         Instagram / Messenger webhook (manzil o'zgarmagan: /api/webhook)
api/telegram.js        Telegram webhook + bir martalik sozlash
api/health.js          nimalar ulanganini tekshirish
lib/bot.js             suhbat "miyasi": debounce, qulf, pauza, leadlar
lib/personas.js        sotuv menejeri va shaxsiy yordamchi ko'rsatmalari (prompt)
lib/knowledge.js       DentaCRM: funksiyalar, narxlar, e'tirozlar  ← shu yerni tahrirlang
lib/llm.js             Groq / OpenRouter + Whisper
lib/store.js           Upstash Redis (yoki vaqtinchalik xotira)
lib/admin.js           Telegram'dagi boshqaruv paneli
lib/channels/          meta.js (Instagram, Messenger), telegram.js
scripts/chat.js        terminalda sinash
```

## O'rnatish

### 1. Vercel va xotira
1. Loyiha Vercel'ga ulangan (har `git push`da o'zi yangilanadi).
2. **Vercel → Storage (Marketplace) → Upstash for Redis** — bepul bazani yarating va loyihaga ulang. `KV_REST_API_URL` va `KV_REST_API_TOKEN` o'zi qo'shiladi.
3. **Settings → Environment Variables**'ga `.env.example`dagi qiymatlarni kiriting. Eng kamida: `GROQ_API_KEY`, `INSTAGRAM_ACCESS_TOKEN`.

### 2. Instagram
- Webhook URL: `https://<domen>/api/webhook`, Verify token: `VERIFY_TOKEN` qiymati.
- Obuna: `messages` (xohlasangiz `messaging_postbacks` ham). Facebook Messenger uchun `message_echoes` ham kerak — shunda siz o'zingiz yozganingizni bot biladi.
- `INSTAGRAM_ACCESS_TOKEN`: "Instagram Login" tokeni (`IG...`) yoki Facebook Page tokeni (`EAA...` — bu holda `INSTAGRAM_PAGE_ID` ham kerak).
- Xavfsizlik uchun `META_APP_SECRET`ni qo'shing (Instagram Login'da — Instagram app secret).

### 3. Telegram — boshqaruv paneli va shaxsiy chatlaringiz
1. [@BotFather](https://t.me/BotFather) → yangi bot → tokenni `TELEGRAM_BOT_TOKEN`ga yozing.
2. @BotFather → Bot Settings → **Business Mode → ON** (shaxsiy chatlarga javob berishi uchun).
3. `TELEGRAM_WEBHOOK_SECRET`ga istalgan tasodifiy so'z yozing, deploy qiling.
4. Brauzerda bir marta oching: `https://<domen>/api/telegram?setup=<TELEGRAM_WEBHOOK_SECRET>`.
5. Botga `/id` yozing → chiqqan raqamni `TELEGRAM_ADMIN_IDS`ga yozing → qayta deploy.
6. Telegram → Sozlamalar → **Telegram Business → Chatbotlar** → botingizni tanlang, qaysi chatlarga javob berishini belgilang va "javob yozish" ruxsatini bering. (Telegram Premium kerak.)

## Boshqarish (Telegram botda)

| Buyruq | Vazifasi |
|---|---|
| `/status` | holat va sozlamalar |
| `/off` / `/on` | botni hamma joyda to'xtatish / yoqish |
| `/leads` | oxirgi leadlar (telefon raqamlar) |
| `/reset` | botdagi test suhbatingizni tozalash |
| oddiy xabar | bot mijozga qanday javob berishini sinab ko'rasiz |

- Lead yoki "operator" so'rovi kelganda xabarnomadagi **⏸ / ▶️** tugmalari bilan aynan o'sha chatda botni to'xtatasiz/yoqasiz.
- Telegram Business chatida bot tugmasini bossangiz (`/start bizChat...`), o'sha chat uchun ham shu tugmalar chiqadi.
- Chatga o'zingiz yozsangiz, bot `HUMAN_TAKEOVER_MINUTES` (standart 720 = 12 soat) davomida jim turadi.

## Sozlash

- **Narx, funksiya, aksiya** → `lib/knowledge.js`.
- **Ohang, qoidalar, sotuv bosqichlari** → `lib/personas.js`.
- **Qaysi kanalda kim javob beradi** → `PERSONA_INSTAGRAM`, `PERSONA_TELEGRAM_BOT`, `PERSONA_TELEGRAM_BUSINESS` (`sales` yoki `assistant`).
- **Model** → `GROQ_MODELS`, `OPENROUTER_MODELS` (vergul bilan, navbat bo'yicha sinaladi).

## Lokal sinash

```bash
cp .env.example .env         # GROQ_API_KEY ni yozing
npm run chat                 # sotuv menejeri bilan terminalda suhbat
npm run chat -- --persona assistant
npm test                     # avtomatik testlar (tashqi API kerak emas)
```

Terminalda `/owner <matn>` — siz yozgandek (bot jim bo'ladi), `/resume`, `/history`, `/reset`.

## Keyingi qadamlar (g'oyalar)

- Leadlarni to'g'ridan-to'g'ri DentaCRM bazasiga yozish (hozir Telegram + `/leads`).
- Javob bermay qolgan mijozga 24 soat ichida bitta eslatma xabari (Instagram 24 soatlik oyna qoidasi doirasida).
- Suhbatlar statistikasi: nechta lead, qaysi bosqichda "yo'qoladi".
- Instagram post izohlariga avtomatik javob va Direct'ga taklif (private reply).
