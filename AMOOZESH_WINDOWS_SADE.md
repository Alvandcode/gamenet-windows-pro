# آموزش نصب و ساخت نسخه ویندوز

این راهنما برای نسخه فعلی مخزن (`gamenet-windows-pro-main`) است. مسیرها و نام فایل‌های نسخه‌های قدیمی (مثل `gamenet-windows-enhanced`) دیگر معتبر نیستند.

## نصب سریع

1. از بخش Releases فایل `Gamenet Manager Pro Setup.exe` را دانلود و نصب کن.
2. نسخه Portable هم با نام `GamenetManager-Portable-<version>.exe` موجود است و بدون نصب اجرا می‌شود.
3. اگر ویندوز هشدار SmartScreen داد، چون فایل تازه ساخته شده است، گزینه More info → Run anyway را بزن.

## ساخت از سورس

پیش‌نیاز: Node.js نسخه **22.22+** یا **24.15+** (یا 26+) و npm.

```bat
npm ci
npm test
npm start
```

برای ساخت نصب‌کننده:

```bat
build-windows.bat
```

این فایل اول وابستگی‌ها را نصب می‌کند، بعد تست‌ها را اجرا می‌کند و در آخر با `npm run dist:win` فایل‌های خروجی را داخل پوشه `dist` می‌سازد. خروجی‌ها:

- `Gamenet Manager Pro Setup <version>.exe` — نصب‌کننده
- `GamenetManager-Portable-<version>.exe` — نسخه بدون نصب

## اجرای تست‌ها

```bat
npm run test:all
```

تست‌های تکمیلی (اختیاری):

```bat
node tests/group-play.test.js
node tests/password-security.test.js
node tests/merge-integrity.test.js
```

## نکته‌های مهم

- داده‌ها روی خود سیستم و در `localStorage` ذخیره می‌شوند؛ بدون اینترنت هم برنامه کار می‌کند.
- از بخش بکاپ، خروجی رمزنگاری‌شده بگیر (رمز حداقل ۸ کاراکتر؛ برای بازگردانی همان رمز لازم است). فایل‌های بکاپ خودکار در پوشه Backups کنار داده‌های برنامه ساخته می‌شوند.
- اگر از همگام‌سازی Firebase استفاده می‌کنی، در کنسول Firebase سرویس **Anonymous Auth** را فعال کن؛ قوانین دیتابیس فقط به کاربر واردشده اجازه خواندن/نوشتن می‌دهند.
- برای کنترل سیستم‌های مشتری، ایجنت جدا روی هر سیستم نصب می‌شود و از شبکه داخلی روی پورت `48721` پاسخ می‌دهد.
