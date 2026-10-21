import { expect, test } from 'claude-code/testing'

const RUN = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

const BASE = {
  model: 'claude-test',
  promptModel: 'claude-test',
  surfaces: [],
  tools: [],
  outputStyle: null,
  traits: [],
} as const

test('adds one Persian writing section after the engine\'s own', async ($, on) => {
  on('prompt.compose', () => ({
    sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }],
  }))

  const { sections } = await $.prompt.compose(BASE)

  expect(sections.map(section => section.id)).toEqual([
    'intro',
    'persian-writing:rules',
  ])
  expect(sections[1]?.scope).toBe('session')
  expect(sections[1]?.text).toMatch(/ZWNJ/)
})

test('adds nothing when switched off', { options: { enabled: false } }, async ($, on) => {
  on('prompt.compose', () => ({
    sections: [{ id: 'intro', text: 'You are Claude.', scope: 'shared' }],
  }))

  const { sections } = await $.prompt.compose(BASE)

  expect(sections.map(section => section.id)).toEqual(['intro'])
})

test('the options change the text', { options: { digits: true, quotes: true } }, async ($, on) => {
  on('prompt.compose', () => ({ sections: [] }))

  const { sections } = await $.prompt.compose(BASE)

  expect(sections[0]?.text).toMatch(/۰۱۲۳۴۵۶۷۸۹/)
  expect(sections[0]?.text).toMatch(/guillemets/)
})

test('/persian shows the state and writes a changed option', async ($, on) => {
  on('command.register', () => ({ value: { command: 'persian' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  const written: Array<{ key: string; value: unknown }> = []
  on('config.set', (_, e) => {
    written.push({ key: e.key, value: e.value })

    return { value: e.value }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const status = await $.command.run({ ...RUN, command: 'persian', args: '' })
  expect(status.text).toMatch(/● قوانین/)

  const changed = await $.command.run({ ...RUN, command: 'persian', args: 'digits on' })
  expect(written).toEqual([{ key: 'persian-writing.digits', value: true }])
  expect(changed.text).toMatch(/● ارقام فارسی/)

  const bad = await $.command.run({ ...RUN, command: 'persian', args: 'nope' })
  expect(bad.text).toMatch(/نامعتبر: nope/)
  expect(written.length).toBe(1)
})
