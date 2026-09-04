# 🎮 Gamenet Manager Alvand - نسخه دسکتاپ

## پیش‌نیازها
1. نصب Node.js (نسخه 18 یا بالاتر):
   https://nodejs.org (گزینه LTS را دانلود و نصب کنید)

2. باز کردن Command Prompt یا PowerShell در پوشه پروژه

## 📦 مراحل نصب و ساخت

### مرحله ۱: نصب کتابخانه‌ها
```bash
npm install
```

### مرحله ۲: اجرای برنامه (برای تست)
```bash
npm start
```

### مرحله ۳: ساخت فایل نصبی
```bash
npm run dist:win
```

## 📁 خروجی‌ها
پس از اجرای دستور `dist:win`، در پوشه `dist` دو فایل ایجاد می‌شود:
- **Gamenet Manager Alvand Setup.exe** → فایل نصبی (Installer)
- **GamenetManager-Portable-1.0.0.exe** → نسخه قابل حمل (بدون نیاز به نصب)

## ⚠️ نکات مهم

### آیکون
برای تغییر آیکون برنامه، فایل `assets/icon.ico` را جایگزین کنید.
- سایز پیشنهادی: 256x256 پیکسل
- فرمت: ICO (می‌توانید از سایت convertio.co برای تبدیل PNG به ICO استفاده کنید)

### ذخیره‌سازی داده‌ها
داده‌های شما (کلاینت‌ها، نشست‌ها و تعرفه‌ها) در مسیر زیر ذخیره می‌شوند:
```
%APPDATA%\gamenet-manager-alvand\Local Storage
```

### حالت تولید (Production)
اگر می‌خواهید منوی Developer Tools مخفی شود، در فایل `main.js` این خط را تغییر دهید:
```javascript
devTools: false
```

## 🛠️ عیب‌یابی
- اگر خطای `electron not found` دیدید، دستور `npm install` را دوباره اجرا کنید.
- برای ساخت نصب‌کننده، حتماً باید روی ویندوز باشید (یا از GitHub Actions استفاده کنید).
