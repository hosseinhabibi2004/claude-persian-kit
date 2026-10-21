import type { Register } from 'claude-code'

import { cleanName, currentFont, describeFont, isFontName } from './font.ts'

export const register: Register = (on, options) => {
  const font = currentFont(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'persian-font',
      description: 'Show or choose the Persian font (Vazirmatn or an installed font)',
      argumentHint: '[font name]',
    })

    return next(e)
  })

  on('command.run', { command: 'persian-font' }, async ($, e) => {
    const name = cleanName(e.args ?? '')
    if (name === '') return { text: describeFont(font) }
    if (!isFontName(name)) return { text: `نام فونت نامعتبر / not a plain font name: ${name}` }

    const done = await $.config.set({ key: 'persian-fonts.font', value: name })
    if ('deny' in done) return { text: `ناموفق / failed: ${done.deny}` }

    return {
      text: `${describeFont(name)}\n\nذخیره شد. برای اعمال: /persian-patch font ${name}\nSaved. To apply: /persian-patch font ${name}`,
    }
  })
}
