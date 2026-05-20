// Har bir foydalanuvchi uchun suhbat tarixini saqlash (xotira ichida)
const conversationHistory = {};

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
    
    // Nima kelayotganini aniq ko'rish uchun log yozamiz
    console.log("📥 KELGAN MA'LUMOT:", JSON.stringify(body));

    // Meta ba'zida instagram o'rniga page deb yuboradi
    if (body.object === 'instagram' || body.object === 'page') {
      // Barcha yuborilgan ma'lumotlarni aylanib chiqamiz (array bo'lishi mumkin)
      for (const entry of body.entry) {
        
        // Kimdir xabar (DM) yuborganida
        if (entry.messaging) {
          for (const messaging of entry.messaging) {
            if (messaging.message && messaging.message.text) {
              const senderId = messaging.sender.id;
              const text = messaging.message.text;

              console.log(`📩 Yangi xabar: "${text}" | Kimdan: ${senderId}`);

              // Foydalanuvchi suhbat tarixini yuklash (bo'lmasa yangi yaratish)
              if (!conversationHistory[senderId]) {
                conversationHistory[senderId] = [];
              }
              // Foydalanuvchi xabarini tarixga qo'shish
              conversationHistory[senderId].push({ "role": "user", "content": text });
              
              // Tarix juda uzun bo'lib ketmasligi uchun oxirgi 10 ta xabarni saqlaymiz
              if (conversationHistory[senderId].length > 10) {
                conversationHistory[senderId] = conversationHistory[senderId].slice(-10);
              }

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
                    "model": "deepseek/deepseek-chat-v3-0324:free",
                    "messages": [
                      {"role": "system", "content": `⚠️ MUTLAQ QOIDA: Siz FAQAT O'ZBEK TILIDA javob berasiz. Hech qachon ingliz, rus yoki boshqa tilda javob bermaysiz. Agar biron sabab bilan boshqa tilda javob bermoqchi bo'lsangiz - BEKOR QILING va O'zbek tilida qaytadan yozing.

Siz DentaCRM - stomatologik klinikalar uchun maxsus boshqaruv (CRM) dasturining professional, sotuvga usta, do'stona va tajribali Sotuvchi-menejerisiz. Vazifangiz mijozda qiziqish uyg'otib, ularni sotib olishga yoki mutaxassisga raqam qoldirishga undashdir. Doim "Siz" deb murojaat qiling.

Sotuv qoidalari (Juda muhim):
1. Narx so'ralganda darhol hammasini yozib yubormang! Avval: "Dasturimiz narxi klinikangizdagi shifokorlar soniga bog'liq. Klinikangizda nechta shifokor ishlaydi?" deb so'rang. Mijoz sonni aytgandan keyingina narxni ayting.
2. Har bir javob oxirida suhbatni davom ettiruvchi savol bering.
3. Qisqa va aniq yozing - 3-4 jumladan oshirmang.

DentaCRM haqida:
- Imkoniyatlari: Onlayn yozilish, omborxona, kassa, vrachlar oyligi, SMS/Telegram bot.
- Video darslik: https://youtube.com/@dentacrm?si=tvnjnALsejwcFRB6

Narxlar (faqat shifokorlar sonini bilgach ayting):
- 1 shifokor: 190,000 so'm/oy
- 2-3 shifokor: 290,000 so'm/oy
- 3+ dan ortiq: har qo'shimcha shifokor uchun +50,000 so'm/oy
- 1 yillik to'lovda: 15% chegirma + bepul o'rnatish
- Lokal versiya: bir martalik 390$ (1-2 shifokorli klinikalarga mos)

Demo: dentacrm.uz | Login: demoklinikaadmin | Parol: demoklinikaparol
Trial: 3 kunlik bepul (kerak bo'lsa 7 kun)

Maqsad: Qiziqtirish → Shifokorlar sonini bilish → Narx aytish → Demo/trial taklif → Telefon raqam olish.`},
                      ...conversationHistory[senderId]
                    ]
                  })
                });
                const aiData = await openRouterResponse.json();
                if (openRouterResponse.ok && aiData.choices && aiData.choices[0]) {
                   aiReplyText = aiData.choices[0].message.content;
                   // AI javobini tarixga qo'shish
                   conversationHistory[senderId].push({ "role": "assistant", "content": aiReplyText });
                } else {
                   console.error("❌ OpenRouter xatosi:", JSON.stringify(aiData));
                }
              } catch (error) {
                console.error("OpenRouter fetch xatosi:", error);
              }

              // 2. Olingan javobni Instagram orqali mijozga jo'natish
              try {
                // Foydalanuvchi xato yozgan bo'lishi ehtimolini hisobga olib, barcha yozilish turlarini tekshiramiz
                const ACCESS_TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN || 
                                     process.env.INSTAGRAM_ACCES_TOKEN || 
                                     process.env.ACCESS_TOKEN ||
                                     process.env.ACCES_TOKEN;
                
                // Token mavjudligini va to'g'riligini tekshirish uchun log (xavfsiz tarzda faqat boshini chiqaramiz)
                console.log("Token tekshiruvi:", ACCESS_TOKEN ? ACCESS_TOKEN.substring(0, 15) + "..." : "❌ TOKEN TOPILMADI!");

                const PAGE_ID = process.env.INSTAGRAM_PAGE_ID;
                
                // O'ngdan-chapga Page ID orqali yuborish Instagram Messaging talabi hisoblanadi
                const sendResponse = await fetch(`https://graph.facebook.com/v19.0/${PAGE_ID}/messages?access_token=${ACCESS_TOKEN}`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json"
                  },
                  body: JSON.stringify({
                    recipient: { id: senderId },
                    message: { text: aiReplyText }
                  })
                });
                
                const sendData = await sendResponse.json();
                if (sendResponse.ok) {
                   console.log(`✅ Javob yuborildi: "${aiReplyText}"`);
                } else {
                   console.error(`❌ Instagram xatosi:`, JSON.stringify(sendData));
                }
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
