// Pure logic of persian-writing: no engine calls, so node can test it directly.

export const FIELDS = ['enabled', 'zwnj', 'yehKaf', 'digits', 'quotes'] as const

export type Field = (typeof FIELDS)[number]
export type Settings = Record<Field, boolean>

export const DEFAULTS: Settings = {
  enabled: true,
  zwnj: true,
  yehKaf: true,
  digits: false,
  quotes: false,
}

// What `/persian <word>` accepts for each field.
const ALIASES: Readonly<Record<string, Field>> = {
  on: 'enabled',
  enabled: 'enabled',
  zwnj: 'zwnj',
  halfspace: 'zwnj',
  yeh: 'yehKaf',
  kaf: 'yehKaf',
  yehkaf: 'yehKaf',
  digits: 'digits',
  quotes: 'quotes',
  guillemets: 'quotes',
}

const WORDS_ON = new Set(['on', 'yes', 'true', '1', 'روشن'])
const WORDS_OFF = new Set(['off', 'no', 'false', '0', 'خاموش'])

export const SECTION_ID = 'persian-writing:rules'

export function resolveSettings(
  options: Readonly<Record<string, unknown>>,
): Settings {
  const out: Settings = { ...DEFAULTS }
  for (const field of FIELDS) {
    const value = options[field]
    if (typeof value === 'boolean') out[field] = value
  }
  return out
}

export type Parsed =
  | { kind: 'status' }
  | { kind: 'set'; field: Field; value: boolean }
  | { kind: 'toggle'; field: Field }
  | { kind: 'error'; word: string }

// `/persian`, `/persian digits`, `/persian digits on`, `/persian off`.
export function parseArgs(args: string): Parsed {
  const words = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const first = words[0]
  if (first === undefined || first === 'status') return { kind: 'status' }

  // A bare on/off switches the whole feature.
  if (WORDS_ON.has(first) || WORDS_OFF.has(first)) {
    return { kind: 'set', field: 'enabled', value: WORDS_ON.has(first) }
  }

  const field = ALIASES[first]
  if (field === undefined) return { kind: 'error', word: first }

  const second = words[1]
  if (second === undefined) return { kind: 'toggle', field }
  if (WORDS_ON.has(second)) return { kind: 'set', field, value: true }
  if (WORDS_OFF.has(second)) return { kind: 'set', field, value: false }

  return { kind: 'error', word: second }
}

const ZWNJ_RULE = [
  'Half-space (ZWNJ, U+200C): write it, never a plain space or nothing, in',
  '- the verb prefixes می and نمی: می‌خواهم, نمی‌دانم',
  '- the plural ها and های: کتاب‌ها, خانه‌های',
  '- the comparative and superlative تر and ترین: بزرگ‌تر, کوچک‌ترین',
  '- a final silent ه before a suffix: خانه‌ای, خانه‌ام, خانه‌اش (but کتابم, with no ZWNJ, after a joining letter)',
  '- compound words: نیم‌فاصله, به‌روزرسانی, بی‌نهایت',
].join('\n')

const YEH_KAF_RULE = [
  'Letters: use Persian ی (U+06CC) and ک (U+06A9). Never Arabic ي (U+064A) or ك (U+0643),',
  'and no Arabic-only forms such as ة, أ, ؤ or إ in Persian words.',
].join('\n')

const DIGITS_ON = [
  'Digits: write Persian digits ۰۱۲۳۴۵۶۷۸۹ in Persian prose, headings, lists and tables.',
  'Keep Latin 0-9 inside code, commands, file names, URLs, version numbers and math.',
].join('\n')

const DIGITS_OFF =
  'Digits: do not convert to Persian digits; use 0-9, unless the user writes ۰-۹.'

const QUOTES_ON =
  'Quotes: quote Persian text with guillemets «like this». Keep straight quotes inside code and JSON.'

const PUNCTUATION_RULE =
  'Punctuation: use the Persian comma ، semicolon ؛ and question mark ؟ in Persian sentences.'

// The text added to the system prompt, or undefined when the feature is off.
export function buildSection(settings: Settings): string | undefined {
  if (!settings.enabled) return undefined

  const rules: string[] = []
  if (settings.yehKaf) rules.push(YEH_KAF_RULE)
  if (settings.zwnj) rules.push(ZWNJ_RULE)
  rules.push(PUNCTUATION_RULE)
  rules.push(settings.digits ? DIGITS_ON : DIGITS_OFF)
  if (settings.quotes) rules.push(QUOTES_ON)

  return [
    '# Writing Persian',
    '',
    'These rules apply only when you write Persian (Farsi) text. They never change code,',
    'commands, file paths, URLs, identifiers or text in another language, and they do not',
    'make you answer in Persian: answer in the language the user writes in.',
    '',
    ...rules.flatMap(rule => [rule, '']),
  ]
    .join('\n')
    .trimEnd()
}

const LABELS: Readonly<Record<Field, string>> = {
  enabled: 'قوانین نگارش فارسی',
  zwnj: 'نیم‌فاصله (zwnj)',
  yehKaf: 'ی و ک فارسی (yeh)',
  digits: 'ارقام فارسی (digits)',
  quotes: 'گیومه «» (quotes)',
}

export function labelOf(field: Field): string {
  return LABELS[field]
}

export function describe(settings: Settings): string {
  const rows = FIELDS.map(
    field => `${settings[field] ? '●' : '○'} ${LABELS[field]}`,
  )
  const usage =
    'استفاده: /persian [zwnj|yeh|digits|quotes] [on|off]  ·  /persian off برای خاموش کردن همه'

  return [...rows, usage].join('\n')
}
