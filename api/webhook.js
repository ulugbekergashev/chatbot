export default async function handler(req, res) {
  // 1. INSTAGRAM WEBHOOKNI TASDIQLASH (VERIFICATION)
  // Facebook/Meta sizning serveringiz ishlayotganini bilish uchun GET so'rov yuboradi
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // O'zimiz o'ylab topgan maxfiy so'z (buni Facebook portaliga yozamiz)
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "mening_maxfiy_sozim_123";

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ WEBHOOK TASDIQLANDI!');
      return res.status(200).send(challenge);
    } else {
      return res.status(403).send('Xato token');
    }
  }

  // 2. INSTAGRAMDAN XABAR KELGANDA (POST REQUEST)
  if (req.method === 'POST') {
    const body = req.body;

    // Kelgan ma'lumot rostdan ham Instagramdan kelganligini tekshiramiz
    if (body.object === 'instagram') {
      // Barcha yuborilgan ma'lumotlarni aylanib chiqamiz (array bo'lishi mumkin)
      for (const entry of body.entry) {
        
        // Kimdir xabar (DM) yuborganida
        if (entry.messaging) {
          for (const messaging of entry.messaging) {
            if (messaging.message && messaging.message.text) {
              const senderId = messaging.sender.id;
              const text = messaging.message.text;

              console.log(`📩 Yangi xabar: "${text}" | Kimdan: ${senderId}`);

              // 1. OpenRouter (AI) orqali xabarga javob o'ylash
              let aiReplyText = "Kechirasiz, hozir tushunmadim.";
              try {
                const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                  method: "POST",
                  headers: {
                    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    "model": "meta-llama/llama-3-8b-instruct:free", // Tekin model misoli
                    "messages": [
                      {"role": "system", "content": `Siz stomatologik klinikaning xushmuomala Instagram yordamchisisiz. O'zbek tilida qisqa, do'stona va aniq javob bering. O'zingizdan narx o'ylab topmang.

Klinikamiz haqida ma'lumotlar:
- Ish vaqti: Har kuni 09:00 dan 18:00 gacha.
- Xizmatlar va taxminiy narxlar:
  * Tish yulish: 100 000 - 150 000 so'm
  * Tish davolash (plomba): 200 000 - 400 000 so'm
  * Tish tozalash: 200 000 so'm
  * Implant: 2 000 000 so'mdan boshlanadi
- Manzil va Telefon: (Bu yerga klinika manzili va raqamini yozasiz)

Agar mijoz yuqorida keltirilmagan xizmat yoki narxni so'rasa, "Bu haqida batafsil ma'lumot berish uchun adminlarimiz tez orada sizga yozishadi" deb aytib qutuling.`},
                      {"role": "user", "content": text}
                    ]
                  })
                });
                const aiData = await openRouterResponse.json();
                if (aiData.choices && aiData.choices[0]) {
                   aiReplyText = aiData.choices[0].message.content;
                }
              } catch (error) {
                console.error("OpenRouter xatosi:", error);
              }

              // 2. Olingan javobni Instagram orqali mijozga jo'natish
              try {
                const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
                const PAGE_ID = process.env.INSTAGRAM_PAGE_ID; // Bu ko'pincha Facebook page ID bo'ladi

                await fetch(`https://graph.facebook.com/v19.0/${PAGE_ID}/messages?access_token=${ACCESS_TOKEN}`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    recipient: { id: senderId },
                    message: { text: aiReplyText }
                  })
                });
                console.log(`✅ Javob yuborildi: "${aiReplyText}"`);
              } catch (error) {
                console.error("Instagramga jo'natishda xato:", error);
              }            }
          }
        }
      }
      // Instagramga "xabarni muvaffaqiyatli qabul qilib oldim" deb 200 kodini qaytarish shart
      return res.status(200).send('EVENT_RECEIVED');
    } else {
      return res.status(404).send('Not Found');
    }
  }

  // Faqat GET va POST ga ruxsat bor
  return res.status(405).send('Method Not Allowed');
}
