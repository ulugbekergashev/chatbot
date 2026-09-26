// Til modeli (LLM) va ovozli xabarlarni matnga aylantirish.
// Groq va OpenRouter — ikkalasi ham OpenAI formatidagi API; ro'yxatdagi modellar navbat bilan sinaladi.
import { fetchJson } from './http.js';

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// Reasoning modellar ba'zan fikrlash qismini matn ichida qaytaradi — uni olib tashlaymiz
const stripThinking = (text) => String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

export function createLLM(config, { log = console } = {}) {
  const { llm } = config;
  const providers = [];
  if (llm.groqKey) {
    providers.push({ name: 'groq', base: GROQ_BASE, key: llm.groqKey, models: llm.groqModels });
  }
  if (llm.openrouterKey) {
    providers.push({
      name: 'openrouter',
      base: OPENROUTER_BASE,
      key: llm.openrouterKey,
      models: llm.openrouterModels,
      headers: { 'X-Title': 'DentaCRM chatbot' },
    });
  }

  async function complete(messages, { maxTokens = 1200, temperature = 0.6 } = {}) {
    for (const provider of providers) {
      for (const model of provider.models) {
        const body = { model, messages, temperature, max_tokens: maxTokens };
        // gpt-oss — reasoning model: "low" tez va chat uchun yetarli
        if (provider.name === 'groq' && model.includes('gpt-oss')) body.reasoning_effort = 'low';
        try {
          const { ok, status, data } = await fetchJson(`${provider.base}/chat/completions`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${provider.key}`, ...provider.headers },
            body,
            timeoutMs: llm.timeoutMs,
          });
          const text = stripThinking(data?.choices?.[0]?.message?.content);
          if (ok && text) return { text, provider: provider.name, model };
          log.error(`❌ LLM ${provider.name}/${model} (${status}):`, JSON.stringify(data).slice(0, 400));
        } catch (err) {
          log.error(`❌ LLM ${provider.name}/${model} ulanish xatosi:`, err.message);
        }
      }
    }
    return null;
  }

  // Ovozli xabarni URL'dan yuklab, Groq Whisper orqali matnga aylantirish
  async function transcribeUrl(url, filename = 'audio.mp4') {
    if (!llm.groqKey || !url) return null;
    try {
      const audio = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!audio.ok) throw new Error(`audio yuklanmadi (${audio.status})`);
      const blob = await audio.blob();
      if (blob.size > 25 * 1024 * 1024) throw new Error('audio juda katta');

      const form = new FormData();
      form.append('file', blob, filename);
      form.append('model', llm.transcribeModel);
      form.append('response_format', 'json');
      form.append('temperature', '0');
      if (llm.transcribeLanguage) form.append('language', llm.transcribeLanguage);

      const { ok, data } = await fetchJson(`${GROQ_BASE}/audio/transcriptions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${llm.groqKey}` },
        body: form,
        timeoutMs: 30000,
      });
      if (!ok) throw new Error(JSON.stringify(data).slice(0, 300));
      return data?.text?.trim() || null;
    } catch (err) {
      log.error('❌ Ovozni matnga aylantirib bo\'lmadi:', err.message);
      return null;
    }
  }

  return { available: providers.length > 0, complete, transcribeUrl };
}
