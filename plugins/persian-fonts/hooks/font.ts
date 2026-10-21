// Pure logic of persian-fonts.

export const DEFAULT_FONT = 'Vazirmatn'

// Letters (Persian included), digits, spaces, dots, dashes and underscores.
const FONT_NAME = /^[\p{L}\p{N} ._-]{1,80}$/u

export function isFontName(name: string): boolean {
  return FONT_NAME.test(name.trim())
}

export function cleanName(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, '').trim()
}

export function currentFont(options: Readonly<Record<string, unknown>>): string {
  const value = options['font']

  return typeof value === 'string' && isFontName(value) ? value.trim() : DEFAULT_FONT
}

export function describeFont(font: string): string {
  const source =
    font === DEFAULT_FONT
      ? 'Vazirmatn (همراه افزونه، بدون نیاز به نصب / bundled, nothing to install)'
      : `${font} (باید روی سیستم نصب باشد / must be installed on this computer)`

  return [
    `فونت فارسی / Persian font: ${source}`,
    'فقط برای حروف عربی‌خط (فارسی، عربی، ...)؛ کد و monospace و حروف لاتین دست نمی‌خورند.',
    'Applied to Arabic-script characters only; code, monospace and Latin text keep their own font.',
    'برای اعمال در Claude Desktop: /persian-patch font <name>',
    'To apply it in Claude Desktop: /persian-patch font <name>',
  ].join('\n')
}
