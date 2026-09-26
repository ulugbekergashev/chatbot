// DentaCRM haqidagi bilimlar bazasi. Narx, aksiya yoki funksiyalar o'zgarsa — faqat shu faylni tahrirlang.
// Bot faqat shu yerda yozilgan faktlarga tayanadi, qolganini o'ylab topmaydi.

export const PRODUCT = `
DentaCRM — stomatologik klinikalar uchun boshqaruv (CRM) dasturi.
Sayt: dentacrm.uz
Video obzor: https://youtube.com/@dentacrm?si=tvnjnALsejwcFRB6

ASOSIY FUNKSIYALAR:
- Onlayn yozilish (bemorlar qabulga o'zlari yoziladi)
- Omborxona (materiallar hisobi)
- Kassa (to'lovlar va tushum nazorati)
- Vrachlar oyligi (hisob-kitob avtomatik)
- SMS va Telegram bot (bemorlarga eslatmalar)

NARXLAR (oylik obuna):
- 1 shifokor: 190,000 so'm/oy
- 2-3 shifokor: 290,000 so'm/oy
- 3 tadan ko'p: 290,000 so'm + har bir qo'shimcha shifokor uchun 50,000 so'm/oy (masalan, 4 shifokor — 340,000 so'm, 5 shifokor — 390,000 so'm)
- 1 yilga to'lansa: 15% chegirma + bepul o'rnatish
- Lokal versiya (klinika kompyuteriga o'rnatiladi): 390$ bir martalik

SINAB KO'RISH:
- Demo: dentacrm.uz — login: demoklinikaadmin, parol: demoklinikaparol
- Bepul sinov muddati: 3 kun (so'ralsa 7 kungacha uzaytiriladi)
`.trim();

// Ko'p uchraydigan e'tirozlarga javob yo'nalishlari (faqat yuqoridagi faktlarga asoslangan)
export const OBJECTIONS = `
- "Qimmat": 1 shifokorli tarif kuniga taxminan 6,300 so'm turadi; yillik to'lovda 15% chegirma va bepul o'rnatish bor; avval 3 kun bepul sinab ko'rish mumkin.
- "O'ylab ko'raman": demo login bilan hozir o'zingiz ko'rib chiqishni yoki qisqa video obzorni taklif qiling.
- "Boshqa dastur ishlataman / daftarda yuritaman": hozirgi usulda nimasi noqulay ekanini so'rang va shu muammoni hal qiladigan funksiyani ko'rsating.
- "Internetga ishonmayman / ma'lumotlar xavfsizligi": lokal versiya bor — klinika kompyuteriga o'rnatiladi.
`.trim();
