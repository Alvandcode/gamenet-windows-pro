# 🎮 Gamenet Manager Pro - نسخه دسکتاپ (1.8.1 hardened)

نسخه اصلاح‌شده و ماژولار: امنیت Electron، ذخیره‌سازی امن، بدون تک‌فایل غول‌پیکر، بدون کرش با دیتای خراب.

## ساختار

```
main.js               # پراسس اصلی هاردن‌شده (sandbox, single-instance, IPC بکاپ)
preload.js            # تنها پل renderer <-> main (contextBridge)
index.html            # شل سبک (~85KB) + CSP
src/styles/main.css   # استایل استخراج‌شده
src/js/config.js      # نسخه + کانفیگ (فایربیس اختیاری)
src/js/security.js    # safeParse, escapeHtml, SHA-256, secureRandomId
src/js/storage.js     # لایه ذخیره امن + آینه فایل (throttled)
src/js/app.js         # منطق فروشگاه (پچ‌شده، بدون تغییر رفتار)
src/js/patches.js     # هاردنینگ runtime (هش پسورد، ولیدیشن بکاپ، ...)
config.example.json   # نمونه کانفیگ (کلید واقعی هرگز کامیت نشود)
tests/                # تست دود + تست بوت بدون وابستگی
```

## پیش‌نیازها

- Node.js 20 LTS — https://nodejs.org
- ویندوز برای خروجی NSIS/Portable (یا GitHub Actions)

## اجرا و بیلد

```bash
npm ci
npm test            # تست دود + تست بوت + چک سینتکس همه فایل‌ها
npm start           # اجرا
npm run start:dev   # اجرا با DevTools (فقط توسعه)
npm run dist:win    # خروجی dist/*.exe
```

یا در ویندوز: `build-windows.bat`

## چه چیزهایی درست شد

1. **امنیت Electron** — `devTools` فقط با `--dev`، `sandbox:true`، حذف منو در پروداکشن، قفل `single-instance`، بلاک `will-navigate`/`window.open`، `preload` با `contextBridge`.
2. **ماژولار شدن** — `index.html` از ~۳۵۰KB تک‌فایل به شل ~۸۵KB + فایل‌های جدا. CSP فعال شد.
3. **ذخیره‌سازی** — `safeParse` ضدکرش، `saveData` با try/catch، throttle نوشتن دیسک (هر ۱ ثانیه → هر ۱۵ ثانیه)، آینه خودکار به `%APPDATA%\...\backups\` از طریق IPC.
4. **XSS** — `escapeHtml` روی نام‌های کاربری، حذف نمایش رمز اپراتور از لیست (`••••`).
5. **پسورد** — هش SHA-256 با سازگاری عقب‌رو (لاگین هم plaintext قدیمی هم هش جدید را قبول می‌کند)، هشدار اجباری تعویض `admin/1234`.
6. **سکرت** — کلید Firebase هاردکدشده حذف شد. پیش‌فرض کاملاً آفلاین/لوکال. برای سینک: `config.example.json` را به `config.local.json` کپی کن (gitignore است).
7. **بهداشت ریپو** — `.gitignore`، `LICENSE (MIT)`، `.nvmrc`، ورک‌فلو با `npm ci` + cache + ریلیز فقط روی تگ `v*`.

## ذخیره‌سازی و بکاپ

- کش سریع: `localStorage` با پیشوند `alvand_*`
- کپی امن: `%APPDATA%\gamenet-manager-alvand\backups\gamenet-auto-YYYY-MM-DD.json` (حداکثر 14 فایل آخر)
- ریستور ورودی نامعتبر را رد می‌کند تا دیتای مغازه پاک نشود.

## آفلاین / فایربیس

پیش‌فرض **کاملاً آفلاین**. اگر CDNها (PDF/فایربیس/فونت) لود نشوند برنامه بالا می‌آید و فقط همان دکمه با پیام غیرفعال می‌شود.

## آیکون و لوگو

- آیکون نصب: `assets/icon.ico` (256x256 ICO) — اگر فایل نباشد برنامه با آیکون پیش‌فرض بالا می‌آید.
- لوگوی داخل برنامه دنبال `assets/logo.png` می‌گردد؛ اگر نباشد حرف `A` نشان می‌دهد.

## فروش لایسنس (نسخه تجاری)

- لایسنس‌ها امضای RSA-2048 دارند؛ فقط با `license-tools/gen-license.bat` ساخته می‌شوند. راهنمای قدم‌به‌قدم: `license-tools/SELLER-README.md`
- اتصال Firebase (یک بار): `license-tools/FIREBASE.md` + فایل `database.rules.json`
- ⚠️ `license-tools/private.key` را هیچ‌وقت منتشر نکن (در گیت نیست، در فایل نصبی مشتری هم نیست).

## عیب‌یابی

- `electron not found` → `npm ci`
- خروجی فقط روی ویندوز ساخته می‌شود (یا اکشن گیت‌هاب).
- دیتای خراب؟ برنامه کرش نمی‌کند؛ مقدار خراب قرنطینه می‌شود (`__alvand_corrupt_*`) و بکاپ فایلی در `userData/backups` هست.
- DevTools لازم داری؟ `npm run start:dev`
