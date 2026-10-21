// The words /persian-patch prints: Persian first, English under it.

import { type Os, osName } from './os.ts'

export function help(): string {
  return [
    'پچ کردن Claude Desktop برای فونت و راست‌به‌چپ فارسی',
    'Persian font & RTL patch for Claude Desktop',
    '',
    '/persian-patch install          پچ کردن / patch',
    '/persian-patch status           وضعیت / status',
    '/persian-patch uninstall        حذف نسخه‌ی پچ‌شده / remove the patched copy',
    '/persian-patch font <name>      تغییر فونت / change the font (Vazirmatn or an installed font)',
    '',
    'دستورهای install و font اول خطرها را نشان می‌دهند؛ برای اجرا همان دستور را با --confirm بفرستید.',
    'install and font show the risks first; run the same command again with --confirm to go ahead.',
  ].join('\n')
}

// What the person agrees to, per system. Shown before anything is changed.
export function risks(os: Os, action: string): string {
  const common = [
    `خطرها و آنچه تغییر می‌کند (${osName(os)}):`,
    `Risks and what changes (${osName(os)}):`,
    '',
    '- فقط یک «کپی» از Claude Desktop ساخته و پچ می‌شود؛ برنامه‌ی اصلی دست نمی‌خورد.',
    '  Only a COPY of Claude Desktop is made and patched; the original is not modified.',
    '- با هر به‌روزرسانی Claude Desktop باید دوباره install بزنید.',
    '  After each Claude Desktop update, run install again.',
    '- این کار با شرایط استفاده‌ی Anthropic ممکن است هم‌خوان نباشد؛ مسئولیت با خود شماست.',
    '  Modifying the app may not fit Anthropic\'s terms of service; use it at your own risk.',
  ]
  const specific: Record<Os, string[]> = {
    macos: [
      '- کپی با امضای محلی (ad hoc) امضا می‌شود: بار اول macOS (Gatekeeper) می‌پرسد؛ راست‌کلیک ← Open.',
      '  The copy gets a local ad hoc signature: Gatekeeper may ask once (right-click, Open).',
      '- سیستم‌عامل یک بار اجازه‌ی Keychain («Claude Safe Storage») می‌خواهد.',
      '  macOS asks once to allow "Claude Safe Storage" in your Keychain.',
      '- sudo لازم نیست. Node.js و ابزارهای خط فرمان Xcode لازم‌اند.',
      '  No sudo. Needs Node.js and the Xcode command line tools.',
    ],
    linux: [
      '- آزمایشی: Anthropic نسخه‌ی رسمی لینوکس ندارد؛ نسخه‌ی نصب‌شده‌ی شما (AppImage/deb/rpm/Flatpak/جامعه) پیدا و کپی می‌شود.',
      '  EXPERIMENTAL: there is no official Linux build; your installed one (AppImage, deb, rpm, Flatpak, community) is found and copied.',
      '- اگر چیزی پیدا نشود، چیزی تغییر نمی‌کند. Node.js لازم است.',
      '  If none is found nothing changes. Needs Node.js.',
      '- Claude Code در ترمینال بدون این پچ هم کار می‌کند.',
      '  Claude Code in a terminal works without this patch.',
    ],
    windows: [],
    unknown: [],
  }

  return [
    ...common,
    ...specific[os],
    '',
    `برای ادامه: /persian-patch ${action} --confirm`,
    `To go ahead: /persian-patch ${action} --confirm`,
  ].join('\n')
}

export function unsupported(os: Os): string {
  if (os === 'windows') {
    return [
      'ویندوز: نصب‌کننده‌ی پچ در نسخه‌ی ۰٫۱٫۰ نیست (فقط macOS و Linux).',
      'Windows: the patcher is not part of v0.1.0 (macOS and Linux only).',
      'افزونه‌ی persian-writing (و /persian) روی ویندوز کار می‌کند.',
      'The persian-writing mod and /persian work on Windows.',
    ].join('\n')
  }

  return [
    'این سیستم‌عامل شناخته نشد.',
    'Could not tell which operating system this is, so nothing was run.',
  ].join('\n')
}

export function manualCommand(argv: readonly string[]): string {
  const quoted = argv.map(part => (/^[\w./:=+@%-]+$/.test(part) ? part : `'${part.replace(/'/g, "'\\''")}'`))

  return [
    'اجرای مستقیم ممکن نشد؛ این دستور را در ترمینال خودتان اجرا کنید:',
    'Could not run it from here; run this in your own terminal:',
    '',
    quoted.join(' '),
  ].join('\n')
}

export const EXIT_MEANING: Readonly<Record<number, string>> = {
  2: 'استفاده‌ی نادرست / usage error',
  3: 'پیش‌نیاز نصب نیست (Node.js یا ابزارهای macOS) / a prerequisite is missing (Node.js or the macOS tools)',
  4: 'Claude Desktop پیدا نشد / Claude Desktop was not found',
  5: 'ناموفق بود؛ چیزی نیمه‌کاره نمانده / it failed; nothing was left half done',
}
