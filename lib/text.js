// Matn bilan ishlash: model javobini tozalash, bo'lib yuborish, telefon raqam va niyatlarni aniqlash
import { createHash } from 'node:crypto';

// Instagram va Telegram (parse_mode'siz) markdown'ni ko'rsatmaydi — "**" va "#" belgilarini olib tashlaymiz
export function cleanReply(text) {
  return String(text || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[\s(])\*(\S[^*\n]*?)\*(?=[\s).,!?:;]|$)/g, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1: $2')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Uzun javobni limitga sig'adigan bo'laklarga ajratish: avval xatboshi, keyin gap, keyin so'z bo'yicha
export function splitMessage(text, limit, measure = (s) => s.length) {
  const levels = [/\n{2,}/, /(?<=[.!?])\s+/, /\s+/];
  const joiners = ['\n\n', ' ', ' '];

  function split(chunk, level) {
    if (measure(chunk) <= limit) return [chunk];
    if (level >= levels.length) {
      const out = [];
      let cur = '';
      for (const ch of chunk) {
        if (cur && measure(cur + ch) > limit) {
          out.push(cur);
          cur = '';
        }
        cur += ch;
      }
      if (cur) out.push(cur);
      return out;
    }
    const units = chunk.split(levels[level]).filter(Boolean).flatMap((u) => split(u, level + 1));
    const out = [];
    let cur = '';
    for (const unit of units) {
      const candidate = cur ? cur + joiners[level] + unit : unit;
      if (measure(candidate) <= limit) {
        cur = candidate;
      } else {
        if (cur) out.push(cur);
        cur = unit;
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  const trimmed = String(text || '').trim();
  return trimmed ? split(trimmed, 0) : [];
}

export const utf8Bytes = (s) => Buffer.byteLength(s, 'utf8');

// Echo'larni solishtirish uchun matn "barmoq izi"
export function textHash(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  return createHash('sha1').update(normalized).digest('hex').slice(0, 16);
}

// O'zbek apostroflarining barcha ko'rinishlarini bittaga keltirish (o‘, oʻ, o’ → o')
export const normalizeApostrophes = (s) => String(s || '').replace(/[ʻʼ‘’`´]/g, "'");

// O'zbekiston mobil va shahar kodlari
const UZ_CODES = /^(20|33|50|55|61|62|65|66|67|69|70|71|72|73|74|75|76|77|78|79|88|90|91|93|94|95|97|98|99)/;

// Matndan telefon raqamlarni topib, +998XXXXXXXXX ko'rinishiga keltirish
export function extractPhones(text) {
  const found = new Set();
  for (const match of String(text || '').matchAll(/\+?\d[\d\s\-().]{6,18}\d/g)) {
    const raw = match[0];
    const digits = raw.replace(/\D/g, '');
    let phone = null;
    if (digits.length === 12 && digits.startsWith('998')) phone = `+${digits}`;
    else if (digits.length === 9 && UZ_CODES.test(digits)) phone = `+998${digits}`;
    else if (digits.length === 10 && digits.startsWith('8') && UZ_CODES.test(digits.slice(1))) phone = `+998${digits.slice(1)}`;
    else if (raw.startsWith('+') && digits.length >= 10 && digits.length <= 15) phone = `+${digits}`;
    if (phone) found.add(phone);
  }
  return [...found];
}

// Mijoz jonli odam (operator/menejer) bilan gaplashmoqchimi?
const HUMAN_PATTERNS = [
  /\boperator/i,
  /оператор/i,
  /\bmenejer/i,
  /менеджер/i,
  /\bodam bilan/i,
  /\bjonli\b/i,
  /живой|живым|человек/i,
  /mutaxassis bilan/i,
  /qo'ng'iroq qiling|telefon qiling|aloqaga chiqing|bog'laning/i,
  /позвоните|перезвоните|свяжитесь/i,
];

export function wantsHuman(text) {
  const t = normalizeApostrophes(text);
  return HUMAN_PATTERNS.some((re) => re.test(t));
}
