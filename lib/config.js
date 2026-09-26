// Barcha sozlamalar environment o'zgaruvchilaridan o'qiladi
// (Vercel → Project → Settings → Environment Variables). To'liq ro'yxat: .env.example

// Bir nechta nomdan birinchi to'ldirilganini qaytaradi (eski/xato yozilgan nomlar ham ishlaydi)
function env(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
  }
  return undefined;
}

function list(value, fallback) {
  if (!value) return fallback;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function int(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function getConfig() {
  return {
    owner: {
      name: env('OWNER_NAME') || 'Akkaunt egasi',
      about: env('OWNER_ABOUT') || '',
    },
    timezone: env('TIMEZONE') || 'Asia/Tashkent',

    meta: {
      verifyToken: env('VERIFY_TOKEN') || 'mening_maxfiy_sozim_123',
      // Webhook imzosini tekshirish uchun (Instagram Login bo'lsa — Instagram app secret)
      appSecret: env('META_APP_SECRET', 'INSTAGRAM_APP_SECRET', 'APP_SECRET'),
      accessToken: env('INSTAGRAM_ACCESS_TOKEN', 'INSTAGRAM_ACCES_TOKEN', 'ACCESS_TOKEN', 'ACCES_TOKEN'),
      pageToken: env('MESSENGER_PAGE_ACCESS_TOKEN', 'PAGE_ACCESS_TOKEN'),
      pageId: env('INSTAGRAM_PAGE_ID', 'PAGE_ID'),
      igAccountId: env('INSTAGRAM_ACCOUNT_ID'),
      graphVersion: env('GRAPH_API_VERSION') || 'v24.0',
    },

    telegram: {
      token: env('TELEGRAM_BOT_TOKEN'),
      webhookSecret: env('TELEGRAM_WEBHOOK_SECRET'),
      // Botni boshqaradigan va xabarnomalar oladigan Telegram user ID'lar
      adminIds: list(env('TELEGRAM_ADMIN_IDS', 'TELEGRAM_ADMIN_ID'), []).map(String),
    },

    llm: {
      groqKey: env('GROQ_API_KEY'),
      groqModels: list(env('GROQ_MODELS'), ['openai/gpt-oss-120b', 'openai/gpt-oss-20b']),
      openrouterKey: env('OPENROUTER_API_KEY'),
      openrouterModels: list(env('OPENROUTER_MODELS'), ['nvidia/nemotron-3-super-120b-a12b:free']),
      timeoutMs: int(env('LLM_TIMEOUT_MS'), 20000),
      transcribeModel: env('TRANSCRIBE_MODEL') || 'whisper-large-v3',
      // Bo'sh qoldirilsa, Whisper tilni o'zi aniqlaydi
      transcribeLanguage: process.env.TRANSCRIBE_LANGUAGE ?? 'uz',
    },

    bot: {
      // Qaysi kanalda qaysi "shaxs" (persona) javob beradi: sales | assistant
      personas: {
        ig: env('PERSONA_INSTAGRAM') || 'sales',
        fb: env('PERSONA_MESSENGER') || 'sales',
        tg: env('PERSONA_TELEGRAM_BOT') || 'sales',
        tgb: env('PERSONA_TELEGRAM_BUSINESS') || 'assistant',
      },
      // Mijoz ketma-ket bir nechta xabar yozsa, shuncha kutib, hammasiga bitta javob beramiz
      debounceMs: int(env('DEBOUNCE_MS'), 3000),
      historyLimit: int(env('HISTORY_LIMIT'), 30),
      // Egasi chatga o'zi yozsa, bot shu chatda shuncha daqiqa jim turadi
      takeoverMinutes: int(env('HUMAN_TAKEOVER_MINUTES'), 720),
    },

    store: {
      url: env('KV_REST_API_URL', 'UPSTASH_REDIS_REST_URL'),
      token: env('KV_REST_API_TOKEN', 'UPSTASH_REDIS_REST_TOKEN'),
      prefix: env('STORE_PREFIX') || 'cb:',
    },
  };
}
