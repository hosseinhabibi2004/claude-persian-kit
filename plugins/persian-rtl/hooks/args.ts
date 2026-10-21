// Parsing of `/persian-patch <action> [options]`.

export const ACTIONS = ['install', 'status', 'uninstall', 'font', 'help'] as const
export type Action = (typeof ACTIONS)[number]

export type Parsed =
  | { kind: 'ok'; action: Action; isConfirmed: boolean; font?: string }
  | { kind: 'error'; message: string }

// Font names: letters (Persian included), digits, spaces, dots, dashes, underscores.
const FONT_NAME = /^[\p{L}\p{N} ._-]{1,80}$/u

export function isFontName(name: string): boolean {
  return FONT_NAME.test(name.trim())
}

export function parseArgs(args: string): Parsed {
  const words = args.trim().split(/\s+/).filter(Boolean)
  const first = (words.shift() ?? 'help').toLowerCase()
  if (!(ACTIONS as readonly string[]).includes(first)) {
    return { kind: 'error', message: `unknown action: ${first}` }
  }
  const action = first as Action

  const isConfirmed = words.some(word => word === '--confirm' || word === '--yes')
  const rest = words.filter(word => word !== '--confirm' && word !== '--yes')
  const unknown = rest.find(word => word.startsWith('--'))
  if (unknown !== undefined) return { kind: 'error', message: `unknown option: ${unknown}` }

  if (action === 'font') {
    // The rest of the line is the name, so `font B Nazanin` needs no quotes.
    const name = rest.join(' ').replace(/^["']|["']$/g, '').trim()
    if (name === '') return { kind: 'error', message: 'font needs a name: /persian-patch font Vazirmatn' }
    if (!isFontName(name)) return { kind: 'error', message: `not a plain font name: ${name}` }

    return { kind: 'ok', action, isConfirmed, font: name }
  }
  if (rest.length > 0) return { kind: 'error', message: `unexpected: ${rest.join(' ')}` }

  return { kind: 'ok', action, isConfirmed }
}

// Whether an action changes the machine and so needs the person's consent.
export function needsConsent(action: Action): boolean {
  return action === 'install' || action === 'font'
}
