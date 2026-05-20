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

              // 1. OpenRouter (AI) orqali xabarga javob o'ylash - bir nechta model sinab ko'ramiz
              let aiReplyText = null;
              const models = [
                "meta-llama/llama-3.1-8b-instruct:free",
                "qwen/qwen3-8b:free",
                "meta-llama/llama-3.2-3b-instruct:free"
              ];
              const systemPrompt = `⚠️ MUTLAQ QOIDA: Siz FAQAT O'ZBEK TILIDA javob berasiz. Hech qachon ingliz, rus yoki boshqa tilda javob bermaysiz.\n\nSiz DentaCRM - stomatologik klinikalar uchun maxsus boshqaruv (CRM) dasturining professional, sotuvga usta, do'stona va tajribali Sotuvchi-menejerisiz. Vazifangiz mijozda qiziqish uyg'otib, ularni sotib olishga yoki mutaxassisga raqam qoldirishga undashdir. Doim "Siz" deb murojaat qiling.\n\nSotuv qoidalari:\n1. Narx so'ralganda avval: "Klinikangizda nechta shifokor ishlaydi?" deb so'rang. Sonni bilgandan keyingina narxni ayting.\n2. Har bir javob oxirida suhbatni davom ettiruvchi savol bering.\n3. Qisqa yozing - 3-4 jumladan oshirmang.\n\nDentaCRM: Onlayn yozilish, omborxona, kassa, vrachlar oyligi, SMS/Telegram bot.\nVideo: https://youtube.com/@dentacrm?si=tvnjnALsejwcFRB6\n\nNarxlar (shifokorlar sonini bilgach ayting):\n- 1 shifokor: 190,000 so'm/oy\n- 2-3 shifokor: 290,000 so'm/oy\n- 3+: har qo'shimcha +50,000 so'm/oy\n- 1 yillik: 15% chegirma + bepul o'rnatish\n- Lokal: 390$ (bir martalik)\n\nDemo: dentacrm.uz | demoklinikaadmin | demoklinikaparol\nTrial: 3 kun bepul (7 kungacha uzaytirish mumkin)`;

              for (const model of models) {
                if (aiReplyText) break;
                try {
                  console.log(`🤖 Model: ${model}`);
                  const openRouterResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                      "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                      "model": model,
                      "messages": [
                        {"role": "system", "content": systemPrompt},
                        ...conversationHistory[senderId]
                      ]
                    })
                  });
                  const aiData = await openRouterResponse.json();
                  if (openRouterResponse.ok && aiData.choices && aiData.choices[0]) {
                    aiReplyText = aiData.choices[0].message.content;
                    console.log(`✅ Model ishladi: ${model}`);
                    conversationHistory[senderId].push({ "role": "assistant", "content": aiReplyText });
                  } else {
                    console.error(`❌ Model (${model}) xatosi:`, JSON.stringify(aiData));
                  }
                } catch (err) {
                  console.error(`❌ Model (${model}) fetch xatosi:`, err);
                }
              }

              if (!aiReplyText) {
                aiReplyText = "Kechirasiz, hozir texnik muammo bor. Biroz kutib, qayta yuboring.";
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
