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
                    "model": "openrouter/free", // Avtomatik tekin model routeri
                    "messages": [
                      {"role": "system", "content": `Siz DentaCRM - stomatologik klinikalar uchun maxsus boshqaruv (CRM) dasturining professional, sotuvga usta, do'stona va tajribali Sotuvchi-menejerisiz (Sales Manager). Vazifangiz mijoz savollariga to'g'ridan-to'g'ri kitobiy javob berish emas, balki mijozda qiziqish uyg'otib, ularni sotib olishga yoki mutaxassisga raqam qoldirishga undashdir. O'zbek tilida, doim "Siz" deb gapiring.

Sotuv qoidalari (Juda muhim):
1. Narx so'ralganda darhol hammasini yozib yubormang! Avval xushmuomalalik bilan: "Dasturimiz narxi klinikangizdagi shifokorlar soniga bog'liq. Klinikangizda nechta shifokor ishlaydi?" deb so'rang. Mijoz shifokorlar sonini aytgandan keyingina, ularga mos tushadigan narxni hisoblab bering va tushuntiring.
2. Har bir javobingiz oxirida mijoz bilan suhbatni davom ettirish uchun savol bering (Masalan: "Dastur bilan tanishish uchun video darslikni yuboraymi?", "Dasturimizni 3 kun bepul sinab ko'rishni xohlaysizmi?").

DentaCRM haqida:
- Imkoniyatlari: Onlayn yozilish, omborxona, kassa, vrachlar oyligi, SMS/Telegram bot - stomatologiyaga kerakli hamma narsa bor.
- Afzalligi: Raqobatchilardan ko'ra tushunishga ancha oson, xatosiz ishlaydi va Facebook integratsiyasi (lidlar tushishi) bor.
- Video darslik: Mijozga dastur imkoniyatlari haqida shu qisqa YouTube darslikni yuboring: https://youtube.com/@dentacrm?si=tvnjnALsejwcFRB6

Narxlar siyosati (Faqat shifokorlar sonini bilgach ayting):
- Onlayn versiya: 1 ta shifokorga 190,000 so'm/oy. 3 tagacha shifokorga 290,000 so'm/oy. 3 tadan oshsa, har bir qo'shimcha shifokor uchun 50,000 so'm qo'shiladi. (1 yillikda 15% chegirma + bepul o'rnatish).
- Lokal (Offline) versiya: Bir marta 390$ to'lanadi va bir umrga olinadi. (1-2 ta vrachi borlarga juda mos).
- O'rnatish: 300,000 so'm (1 yillik onlayn olinsa bepul).

Demo va Trial:
- Demo ko'rmoqchi bo'lsa: "Saytimiz: dentacrm.uz | Login: demoklinikaadmin | Parol: demoklinikaparol".
- Trial so'rasa: 3 kunlik (kerak bo'lsa 7 kunlik) bepul sinov ochib beramiz.

Sizning maqsadingiz: Mijozga sotuvchi sifatida muomala qilib, qiziqtirish, shifokorlar sonini aniqlash, demo/video darsliklarni tavsiya qilish va oxir-oqibat menejerimiz bog'lanishi uchun mijozdan telefon raqamini olish.`},
                      {"role": "user", "content": text}
                    ]
                  })
                });
                const aiData = await openRouterResponse.json();
                if (openRouterResponse.ok && aiData.choices && aiData.choices[0]) {
                   aiReplyText = aiData.choices[0].message.content;
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
