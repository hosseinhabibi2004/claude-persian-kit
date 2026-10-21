import { expect, mock, test } from 'claude-code/testing'

const RUN = {
  origin: { kind: 'composer' },
  presentation: { isFullscreen: false, columns: 80 },
} as const

type World = {
  env?: Record<string, string>
  uname?: string
  exitCode?: number
  output?: string
  hasScript?: boolean
  rows?: ReadonlyArray<{ key: string; value: string }>
  isRunDenied?: boolean
}

const MAC = { env: { HOME: '/Users/علی رضا' }, uname: 'Darwin\n' } as const
const LINUX = { env: { HOME: '/home/x' }, uname: 'Linux\n' } as const
const WINDOWS = { env: { OS: 'Windows_NT', USERPROFILE: 'C:\\Users\\x' } } as const

// Everything beneath the plugin is a stand-in; `calls` lists what it was asked to run.
async function boot($: any, on: any, world: World) {
  mock.env(on, world.env ?? {})
  mock.store(on)
  const clock = mock.clock(on, { now: 1_000_000 })
  const calls: string[][] = []
  const written: Array<{ key: string; value: unknown }> = []

  on('command.register', () => ({ value: { command: 'persian-patch' } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('fs.exists', () => ({ value: world.hasScript ?? true }))
  on('config.list', () => ({ value: (world.rows ?? []).map(r => ({ ...r, label: r.key, kind: 'string', isLocked: false, provider: { plugin: 'x', tier: 'user' } })) }))
  on('config.set', (_: unknown, e: { key: string; value: unknown }) => {
    written.push({ key: e.key, value: e.value })

    return { value: e.value }
  })
  on('process.run', (_: unknown, e: { argv: readonly string[] }) => {
    calls.push([...e.argv])
    if (e.argv[0] === 'uname') {
      return world.uname === undefined ? { deny: 'no uname' } : { value: { exitCode: 0, stdout: world.uname, stderr: '' } }
    }
    if (world.isRunDenied) return { deny: 'cannot start' }

    return { value: { exitCode: world.exitCode ?? 0, stdout: world.output ?? 'installer output', stderr: '' } }
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })

  const patch = async (args: string): Promise<string> =>
    ((await $.command.run({ ...RUN, command: 'persian-patch', args })).text ?? '') as string

  return { patch, calls, written, clock, installerCalls: () => calls.filter(c => c[0] === 'bash') }
}

test('help, and a clear message for a mistake', async ($, on) => {
  const { patch, calls } = await boot($, on, MAC)
  expect(await patch('')).toMatch(/install/)
  expect(await patch('frobnicate')).toMatch(/unknown action: frobnicate/)
  expect(calls.filter(c => c[0] === 'bash')).toEqual([])
})

test('Windows: told the patcher is not in v0.1.0, nothing is run', async ($, on) => {
  const { patch, installerCalls } = await boot($, on, WINDOWS)
  expect(await patch('install')).toMatch(/not part of v0\.1\.0/)
  expect(await patch('install --confirm')).toMatch(/not part of v0\.1\.0/)
  expect(installerCalls()).toEqual([])
})

test('macOS: first install shows the risks and runs nothing; --confirm runs the installer', async ($, on) => {
  const { patch, installerCalls } = await boot($, on, MAC)

  const risks = await patch('install')
  expect(risks).toMatch(/Gatekeeper/)
  expect(risks).toMatch(/install --confirm/)
  expect(installerCalls()).toEqual([])

  expect(await patch('install --confirm')).toBe('installer output')
  const [call] = installerCalls()
  expect(call?.[0]).toBe('bash')
  expect(call?.[1]).toMatch(/\/patcher\/patch-mac\.sh$/)
  expect(call?.slice(2)).toEqual(['install', '--yes'])
})

test('--confirm alone, an old confirmation, or one for another action does not count', async ($, on) => {
  const { patch, installerCalls, clock } = await boot($, on, LINUX)

  expect(await patch('install --confirm')).toMatch(/EXPERIMENTAL/)
  expect(installerCalls()).toEqual([])

  await patch('install')
  await clock.advance(16 * 60_000)
  expect(await patch('install --confirm')).toMatch(/Risks/)
  expect(installerCalls()).toEqual([])

  await patch('install')
  expect(await patch('font Inter --confirm')).toMatch(/font Inter --confirm/)
  expect(installerCalls()).toEqual([])
})

test('a confirmation is used once', async ($, on) => {
  const { patch, installerCalls } = await boot($, on, LINUX)
  await patch('install')
  await patch('install --confirm')
  expect(installerCalls().length).toBe(1)
  await patch('install --confirm')
  expect(installerCalls().length).toBe(1)
})

test('install uses the font chosen in persian-fonts, none for the default', async ($, on) => {
  const custom = await boot($, on, { ...LINUX, rows: [{ key: 'persian-fonts.font', value: 'B Nazanin' }] })
  await custom.patch('install')
  await custom.patch('install --confirm')
  expect(custom.installerCalls()[0]?.slice(2)).toEqual(['install', '--yes', '--font', 'B Nazanin'])
})

test('install with the default font passes no font', async ($, on) => {
  const plain = await boot($, on, { ...LINUX, rows: [{ key: 'persian-fonts.font', value: 'Vazirmatn' }] })
  await plain.patch('install')
  await plain.patch('install --confirm')
  expect(plain.installerCalls()[0]?.slice(2)).toEqual(['install', '--yes'])
})

test('font <name> saves the choice and reinstalls with it, after consent', async ($, on) => {
  const { patch, installerCalls, written } = await boot($, on, MAC)
  await patch('font B Nazanin')
  expect(installerCalls()).toEqual([])
  expect(written).toEqual([])

  await patch('font B Nazanin --confirm')
  expect(written).toEqual([{ key: 'persian-fonts.font', value: 'B Nazanin' }])
  expect(installerCalls()[0]?.slice(2)).toEqual(['install', '--yes', '--font', 'B Nazanin'])
})

test('status and uninstall need no consent', async ($, on) => {
  const { patch, installerCalls } = await boot($, on, MAC)
  await patch('status')
  await patch('uninstall')
  expect(installerCalls().map(c => c.slice(2))).toEqual([['status'], ['uninstall', '--yes']])
})

test('a failing installer is explained, with its output', async ($, on) => {
  const { patch } = await boot($, on, { ...LINUX, exitCode: 4, output: 'error: no Claude Desktop found' })
  await patch('install')
  const text = await patch('install --confirm')
  expect(text).toMatch(/no Claude Desktop found/)
  expect(text).toMatch(/\(exit 4: /)
})

test('where the installer cannot be started, the exact command is printed', async ($, on) => {
  const { patch } = await boot($, on, { ...MAC, isRunDenied: true })
  const text = await patch('status')
  expect(text).toMatch(/run this in your own terminal/)
  expect(text).toMatch(/patch-mac\.sh' status|patch-mac\.sh status/)
})

test('a missing installer is reported, not run', async ($, on) => {
  const { patch, installerCalls } = await boot($, on, { ...LINUX, hasScript: false })
  expect(await patch('status')).toMatch(/installer not found/)
  expect(installerCalls()).toEqual([])
})

test('an unknown system runs nothing', async ($, on) => {
  const { patch, installerCalls } = await boot($, on, { env: { HOME: '/x' }, uname: 'FreeBSD' })
  expect(await patch('install --confirm')).toMatch(/nothing was run/)
  expect(installerCalls()).toEqual([])
})
