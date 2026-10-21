import { expect, test } from 'claude-code/testing'

const RUN = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

async function boot($: any, on: any) {
  const written: Array<{ key: string; value: unknown }> = []
  on('command.register', () => ({ value: { command: 'persian-font' } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('config.set', (_: unknown, e: { key: string; value: unknown }) => {
    written.push({ key: e.key, value: e.value })

    return { value: e.value }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  return {
    written,
    font: async (args: string): Promise<string> =>
      ((await $.command.run({ ...RUN, command: 'persian-font', args })).text ?? '') as string,
  }
}

test('/persian-font shows the built-in font by default', async ($, on) => {
  const { font } = await boot($, on)
  expect(await font('')).toMatch(/Vazirmatn/)
})

test('/persian-font shows the font from the options', { options: { font: 'B Nazanin' } }, async ($, on) => {
  const { font } = await boot($, on)
  expect(await font('')).toMatch(/B Nazanin/)
})

test('/persian-font <name> saves the choice and says how to apply it', async ($, on) => {
  const { font, written } = await boot($, on)
  const text = await font('"Noto Naskh Arabic"')
  expect(written).toEqual([{ key: 'persian-fonts.font', value: 'Noto Naskh Arabic' }])
  expect(text).toMatch(/\/persian-patch font Noto Naskh Arabic/)
})

test('/persian-font refuses a name that is not a plain font name', async ($, on) => {
  const { font, written } = await boot($, on)
  expect(await font('a"; rm -rf /')).toMatch(/not a plain font name/)
  expect(written).toEqual([])
})
