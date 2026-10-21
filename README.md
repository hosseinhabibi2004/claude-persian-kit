# Persian font & RTL plugin for Claude Desktop and Claude Code

فارسی · [English](README.en.md)

[![CI](https://github.com/hosseinhabibi2004/claude-persian-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/hosseinhabibi2004/claude-persian-kit/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

متن فارسی در Claude سه مشکل دارد: فونت برای فارسی ساخته نشده، خط‌های ترکیبی فارسی و انگلیسی به‌هم می‌ریزند، و فارسیِ
نوشته‌شده توسط مدل اغلب حرف‌های اشتباه (ي و ك عربی) یا بدون نیم‌فاصله است. این مجموعه هر سه را در جاهایی که یک
افزونه به آن‌ها دسترسی دارد درست می‌کند، و صریح می‌گوید کجا نمی‌تواند.

> **وضعیت: نسخه‌ی ۰٫۱٫۰.** افزونه‌ها در CI روی macOS و Linux و Windows آزمایش می‌شوند. پچ‌کننده‌ی Claude Desktop
> (macOS و Linux) با فایل‌های آزمایشی و برنامه‌های ساختگی آزمایش شده، **ولی نویسنده هنوز آن را روی Claude Desktop واقعی
> امتحان نکرده است**. لطفاً نتیجه را گزارش کنید. در ویندوز فعلاً فقط افزونه‌ها هستند و پچ‌کننده در این نسخه نیست.

## چه چیزهایی دارد

| افزونه | کار |
|---|---|
| `persian-writing` | یک بخش کوتاه به پرامپت سیستمی Claude اضافه می‌کند تا فارسی درست بنویسد: نیم‌فاصله (ZWNJ) در «می‌خواهم» و «کتاب‌ها»، «ی» و «ک» فارسی به‌جای «ي» و «ك» عربی، و اختیاری ارقام فارسی و گیومه‌ی «». دستور `/persian` گزینه‌ها را نشان می‌دهد یا تغییر می‌دهد. |
| `persian-fonts` | فونت فارسی را انتخاب می‌کند: Vazirmatn (همراه افزونه) یا هر فونتی که روی کامپیوترتان نصب است. فقط حرف‌های عربی‌خط از آن استفاده می‌کنند؛ کد، monospace و حرف‌های لاتین فونت خودشان را نگه می‌دارند. دستور `/persian-font` آن را نشان می‌دهد یا تعیین می‌کند. |
| `persian-rtl` | پچ‌کننده و دستور `/persian-patch` در این افزونه است. Claude Desktop پچ‌شده جهتِ هر پاراگراف، خط‌های ترکیبی فارسی/انگلیسی، فهرست‌ها، جدول‌ها و جعبه‌ی ورودی را درست می‌کند و ریاضی و کد را چپ‌به‌راست نگه می‌دارد. |
| `persian-kit` | هر سه افزونه‌ی بالا را یک‌جا نصب می‌کند. (نام افزونه‌هایی که با `claude-` شروع شوند رزرو است؛ برای همین `claude-persian-kit` نیست.) |

### چرا پچ لازم است

یک افزونه نمی‌تواند ظاهر متن گفتگو را در Claude Desktop عوض کند. فونت و جهتِ داخل پیام‌ها به یک اسکریپت کوچک داخل
خودِ برنامه نیاز دارند. `/persian-patch` یک **کپی جدا و پچ‌شده** از Claude Desktop می‌سازد؛ برنامه‌ی اصلی شما هرگز
تغییر نمی‌کند.

## نصب

**در Claude Desktop:** کنار جعبه‌ی پیام روی **+** بزنید ← **Plugins** ← **Add marketplace** و این را وارد کنید:

```
hosseinhabibi2004/claude-persian-kit
```

سپس **persian-kit** (یا فقط افزونه‌هایی که می‌خواهید) را اضافه کنید.

**در ترمینال:**

```bash
claude plugin marketplace add hosseinhabibi2004/claude-persian-kit
claude plugin install persian-kit@claude-persian-kit
```

داخل یک نشست در حال اجرا: `/plugin install persian-kit --marketplace hosseinhabibi2004/claude-persian-kit`

### پچ کردن Claude Desktop (macOS و Linux)

```
/persian-patch install
```

این دستور فقط خطرها را نشان می‌دهد و چیزی را تغییر نمی‌دهد. بخوانید، بعد همان دستور را با `--confirm` بفرستید (تا ۱۵
دقیقه‌ی بعد):

```
/persian-patch install --confirm
```

دستورهای دیگر: `/persian-patch status`، `/persian-patch uninstall` و `/persian-patch font "B Nazanin"`.
برای `install` به Node.js نسخه‌ی ۱۸ یا بالاتر نیاز دارید. اگر اجرا از داخل Claude ممکن نباشد، خطِ فرمانِ دقیق را
چاپ می‌کند تا در ترمینال خودتان اجرا کنید.

**بعد از هر به‌روزرسانی Claude Desktop دوباره `install` بزنید:** به‌روزرسانِ Anthropic فقط برنامه‌ی اصلی را به‌روز می‌کند.

## به تفکیک سیستم‌عامل

### macOS

- از `/Applications/Claude.app` یک کپی در `~/Applications/Claude-Persian.app` می‌سازد. بدون sudo. اصل برنامه دست نمی‌خورد.
- به **Node.js** و **ابزارهای خط فرمان Xcode** نیاز دارد (`xcode-select --install`، برای `codesign`).
- کپی با امضای محلیِ *ad hoc* امضا می‌شود، پس:
  - **Gatekeeper** بار اول ممکن است هشدار بدهد: روی برنامه راست‌کلیک ← **Open** (یا System Settings ← Privacy & Security ←
    **Open Anyway**).
  - **Keychain**: macOS یک بار می‌پرسد «Claude Safe Storage» مجاز است یا نه، چون امضای کپی با اصل فرق دارد. این طبیعی است.
- پیش از باز کردن کپی، Claude اصلی را ببندید: ورود و تنظیمات را به‌اشتراک دارند.
- حذف: `/persian-patch uninstall` یا پاک کردن `~/Applications/Claude-Persian.app`.

### Linux (آزمایشی)

- Anthropic نسخه‌ی رسمی Claude Desktop برای لینوکس منتشر نمی‌کند. نصب‌کننده دنبال یک بیلد Electron می‌گردد که از قبل
  دارید و **اگر چیزی پیدا نکند، صریح می‌گوید** (و چیزی تغییر نمی‌کند).
- این‌ها شناخته می‌شوند: بسته‌ی **deb یا rpm** نصب‌شده (زیر `/opt` و `/usr/lib` و `/usr/share`)، **Flatpak** یا **Snap**،
  فایل **AppImage** (در `~/Applications` و `~/Downloads` و ...) یا بسته‌ی جامعه. خودتان هم می‌توانید مسیر را بدهید:
  `patch-linux.sh install --path <پوشه | app.asar | فایل.AppImage>`.
- نصب را به `~/.local/share/claude-persian-kit/Claude-Persian` کپی می‌کند، کپی را پچ می‌کند و یک راه‌انداز
  `claude-persian` و یک ورودی در منوی برنامه‌ها می‌سازد. اصل دست نمی‌خورد.
- ممکن است در برنامه‌ی Electronِ کپی‌شده، ابزار sandbox (با setuid) نباشد. اگر باز نشد، با `--no-sandbox` دوباره نصب کنید
  (این sandbox را برای کپی خاموش می‌کند؛ تصمیمش با خودتان است).
- **Claude Code در ترمینال روی لینوکس فقط با افزونه‌ها کار می‌کند** و به پچ نیازی ندارد.

### Windows

- **افزونه‌ها:** `persian-writing` و `persian-fonts` و `persian-rtl` مثل جاهای دیگر نصب می‌شوند و کار می‌کنند.
- **پچ‌کننده:** در نسخه‌ی ۰٫۱٫۰ نیست. `/persian-patch` همین را می‌گوید و چیزی اجرا نمی‌کند. پس هنوز اسکریپت PowerShell هم
  وجود ندارد و بحث نسخه‌ی PowerShell و execution policy در این نسخه مطرح نیست.

## چه چیزی کجا کار می‌کند

راهنما: ✅ کار می‌کند و در CI آزمایش می‌شود · 🧪 ساخته و با فایل‌های آزمایشی تست شده، ولی روی Claude Desktop واقعی هنوز
تأیید نشده · ➖ کاری که یک افزونه نمی‌تواند بکند · ❌ در ۰٫۱٫۰ نیست.

| قابلیت | Desktop Chat | Desktop Code | ترمینال | VS Code |
|---|---|---|---|---|
| Claude فارسی درست می‌نویسد (`persian-writing` و `/persian`) | ➖ افزونه‌ها در Chat اجرا نمی‌شوند | ✅ | ✅ | ✅ (همان موتورِ ترمینال) |
| فونت فارسی در پیام‌ها (`persian-fonts` و پچ) | 🧪 macOS و Linux · ❌ Windows | 🧪 macOS و Linux · ❌ Windows | ➖ ترمینال خودش می‌کشد | ➖ پایین را ببینید |
| جهت هر پاراگراف، خط‌های ترکیبی، فهرست و جدول | 🧪 macOS و Linux · ❌ Windows | 🧪 macOS و Linux · ❌ Windows | ➖ | ➖ |
| جعبه‌ی ورودی از متنش پیروی می‌کند | 🧪 macOS و Linux · ❌ Windows | 🧪 macOS و Linux · ❌ Windows | ➖ | ➖ |
| ریاضی و کد چپ‌به‌راست می‌مانند | 🧪 | 🧪 | ➖ | ➖ |
| جاهایی که خودشان `dir` گذاشته‌اند دست نمی‌خورند | 🧪 | 🧪 | ➖ | ➖ |

| سیستم‌عامل | افزونه‌ها | پچ‌کننده‌ی Desktop |
|---|---|---|
| macOS | ✅ | 🧪 |
| Linux | ✅ | 🧪 آزمایشی |
| Windows | ✅ | ❌ |

## ترمینال و VS Code

در ترمینال، Claude Code را **فونت و موتور متنِ خودِ ترمینال** می‌کشد و هیچ افزونه‌ای هیچ‌کدام را عوض نمی‌کند. کاری که
می‌توانید بکنید:

۱. **فونتی بگذارید که حرف‌های فارسی دارد.** بیشتر فونت‌های monospace ندارند. فونتی با حرف‌های عربی‌خط بگذارید، یا یک
   فهرست جایگزین تا فقط حرف‌های فارسی از Vazirmatn بیایند (monospace نیست، پس فاصله‌ها در شبکه‌ی ترمینال ممکن است
   ناهموار شود):
   - **Terminal.app:** Settings ← Profiles ← Text ← Font.
   - **iTerm2:** Settings ← Profiles ← Text ← Font (و فونت غیر ASCII).
   - **GNOME Terminal:** Preferences ← پروفایل شما ← Text ← Custom font.
   - **Konsole:** Settings ← Edit Current Profile ← Appearance ← Font.
   - **Windows Terminal:** Settings ← پروفایل شما ← Appearance ← Font face.
   - **kitty:** در `kitty.conf`: `symbol_map U+0600-06FF,U+0750-077F,U+FB50-FDFF,U+FE70-FEFF Vazirmatn`
   - **ترمینال داخلی VS Code:** `"terminal.integrated.fontFamily": "'فونت monospace شما', 'Vazirmatn'"`
۲. **Bidi (ترتیب‌دهی راست‌به‌چپ) قابلیتِ خودِ ترمینال است و بیشتر ترمینال‌ها ندارند.** بدون آن ممکن است حرف‌های یک خط
   فارسی به ترتیب غلط یا جدا از هم دیده شوند. اینکه ترمینال شما پشتیبانی می‌کند یا نه و چطور روشنش کنید، در مستندات
   خودش است؛ این پروژه نتوانست برای همه‌ی ترمینال‌ها تأییدش کند و تنظیمی را که راستی‌آزمایی نکرده فهرست نمی‌کند. برای
   iTerm2 جدید گزارش شده که یک گزینه‌ی آزمایشی راست‌به‌چپ در Settings ← General ← Experimental دارد.
۳. **VS Code:** ترمینال داخلی همان ترمینال است (بالا). پنل خودِ افزونه‌ی Claude Code در نسخه‌ی ۰٫۱٫۰ پچ نمی‌شود.
   `persian-writing` در هر دو کار می‌کند.

اگر خواندن فارسی در ترمینال آزاردهنده است، Claude Desktop پچ‌شده جای بهتری است.

## رفع اشکال

| مشکل | کار |
|---|---|
| `/persian-patch` می‌گوید Node.js نیست | Node.js نسخه‌ی ۱۸ یا بالاتر را از <https://nodejs.org> نصب کنید و دوباره بزنید. |
| macOS: «cannot be opened» یا «damaged» | روی کپی راست‌کلیک ← Open، یا System Settings ← Privacy & Security ← Open Anyway. |
| macOS رمز Keychain می‌خواهد | برای کپی یک بار طبیعی است («Claude Safe Storage»). |
| کپی، برنامه‌ی اصلی را باز می‌کند | اول Claude اصلی را ببندید؛ هر دو یک پروفایل دارند. |
| در گفتگو چیزی عوض نشد | **Claude Persian** را باز کنید (نه برنامه‌ی اصلی). `status` نشان می‌دهد کپی پچ شده یا نه. |
| بعد از `font` فارسی همان است | فونت باید روی کامپیوتر نصب باشد و نامش دقیق باشد. Vazirmatn همراه افزونه است. |
| Claude Desktop به‌روز شد و پچ رفت | دوباره `/persian-patch install --confirm` بزنید. |
| Linux: «no installation found» | نسخه‌ی رسمی لینوکس وجود ندارد. با `--path` بیلدی را که دارید نشان بدهید، یا فقط Claude Code را در ترمینال به کار ببرید. |
| Linux: کپی باز نمی‌شود | با `--no-sandbox` دوباره نصب کنید (بالا را ببینید). |
| کد یا ریاضی برعکس دیده می‌شود | لطفاً با عکس و متن، issue باز کنید. |

## توسعه

```bash
npm ci
npm run test:unit    # منطق خالص، jsdom و نصب‌کننده‌ها (node:test)
npm run test:mods    # claude plugin test برای هر افزونه
npm run validate     # claude plugin validate --strict برای مارکت‌پلیس و هر افزونه
npm run typecheck    # tsc
npm run sync         # کپی patcher/ و fonts/ در افزونه‌ها (CI فقط sync:check را اجرا می‌کند)
```

ساختار: `.claude-plugin/marketplace.json`؛ `plugins/*` (چهار افزونه)؛ `patcher/src/persian-rtl.js` (همان یک اسکریپت: منطق
تشخیصِ خالص + یک لایه‌ی نازک DOM)؛ `patcher/src/*.cjs` (ابزار ASAR و plist و payload)؛ `patcher/patch-mac.sh`
و `patcher/patch-linux.sh`؛ `fonts/` (Vazirmatn و مجوزش). افزونه‌ی نصب‌شده فقط پوشه‌ی خودش را می‌گیرد، پس
`scripts/sync-assets.mjs` پچ‌کننده و فونت را در `persian-rtl` و `persian-fonts` کپی می‌کند.

type-check از فایل نوعِ خودِ Claude Code استفاده می‌کند اگر آن را در `typings/claude-code/index.d.ts` بگذارید (Claude
Code آن را کنار افزونه‌ای که بارگذاری می‌کند می‌نویسد)؛ وگرنه از یک stub کوچک در `types/`.

## سلب مسئولیت

این یک پروژه‌ی غیررسمی است و ربطی به Anthropic ندارد و از طرف آن تأیید نشده. پچ‌کننده روی یک **کپی** از Claude Desktop
کار می‌کند (و در macOS آن را دوباره امضا می‌کند)؛ این ممکن است با شرایط استفاده‌ی Anthropic هم‌خوان نباشد، با هر
به‌روزرسانی Claude Desktop ممکن است از کار بیفتد، و مسئولیتش با خود شماست. نرم‌افزار «همان‌طور که هست» و بدون هیچ
ضمانتی ارائه می‌شود (به [LICENSE](LICENSE) نگاه کنید).

## قدردانی

ایده‌هایی که از پروژه‌های دیگر آموختیم (هیچ کدی کپی نشده؛ همه‌چیز اینجا از نو نوشته شده):

- [shraga100/claude-desktop-rtl-patch](https://github.com/shraga100/claude-desktop-rtl-patch): پچ کردن کد رندررِ
  `app.asar`، رویکرد `unicode-range` برای فونت دلخواه، و دست نزدن به بخش‌هایی که خودشان RTL را درست مدیریت می‌کنند.
- [soguy/claude-desktop-rtl-mac](https://github.com/soguy/claude-desktop-rtl-mac): پچ کردن یک کپی جدا در macOS،
  امضای ad hoc، پیام Keychain، و دور نگه داشتن اسکریپت از فرایند اصلی.
- [mhghotbi/claude-desktop-rtl](https://github.com/mhghotbi/claude-desktop-rtl): کاربرد فارسی، و گذاشتن Vazirmatn
  داخل صفحه به‌صورت `data:` به‌خاطر سیاست امنیتی محتوای برنامه.
- [DavidiBellaire/Claude-UniMath](https://github.com/DavidiBellaire/Claude-UniMath): نگه داشتن ریاضی به‌صورت جزیره‌ی
  چپ‌به‌راست میان متن راست‌به‌چپ، محافظ ارز (`$5` فرمول نیست)، و آزمایش منطق.
- [Esi-Abolfazl/skills](https://github.com/Esi-Abolfazl/skills): ساختار مارکت‌پلیس افزونه و چیدمان یک mod.

## مجوز

MIT، حق نشر hosseinhabibi2004 ([LICENSE](LICENSE)). تنها دارایی شخص ثالث، فونت
[Vazirmatn](https://github.com/rastikerdar/vazirmatn) است با مجوز SIL Open Font License 1.1
([fonts/OFL.txt](fonts/OFL.txt)).
