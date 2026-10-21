import type { Register } from 'claude-code'

import {
  SECTION_ID,
  buildSection,
  describe,
  labelOf,
  parseArgs,
  resolveSettings,
} from './rules.ts'

const PLUGIN = 'persian-writing'

export const register: Register = (on, options) => {
  const settings = resolveSettings(options)

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const text = buildSection(settings)
    if (text === undefined) return composed

    const others = composed.sections.filter(section => section.id !== SECTION_ID)

    return {
      sections: [...others, { id: SECTION_ID, text, scope: 'session' as const }],
    }
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'persian',
      description: 'Show or change the Persian writing rules',
      argumentHint: '[zwnj|yeh|digits|quotes|on|off] [on|off]',
    })

    return next(e)
  })

  on('command.run', { command: 'persian' }, async ($, e) => {
    const parsed = parseArgs(e.args ?? '')

    if (parsed.kind === 'status') return { text: describe(settings) }
    if (parsed.kind === 'error') {
      return { text: `نامعتبر: ${parsed.word}\n${describe(settings)}` }
    }

    const field = parsed.field
    const value = parsed.kind === 'set' ? parsed.value : !settings[field]
    const done = await $.config.set({ key: `${PLUGIN}.${field}`, value })
    if ('deny' in done) return { text: `ناموفق: ${done.deny}` }

    const next = { ...settings, [field]: value }

    return {
      text: `${labelOf(field)}: ${value ? 'روشن' : 'خاموش'}\n${describe(next)}`,
      context: [
        'The Persian writing rules changed; they apply from the next message on.',
      ],
    }
  })
}
