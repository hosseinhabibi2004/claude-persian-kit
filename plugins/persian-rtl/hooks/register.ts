import type { Register } from 'claude-code'

import { needsConsent, parseArgs, type Action } from './args.ts'
import { EXIT_MEANING, help, manualCommand, risks, unsupported } from './messages.ts'
import { detectOs, installerFor, joinPath, type Env, type Os } from './os.ts'

const CONSENT_KEY = 'consent'
const CONSENT_MINUTES = 15
const FONT_ROW = 'persian-fonts.font'
const DEFAULT_FONT = 'Vazirmatn'
const TAIL = 4000

type Consent = { action: string; os: Os; at: number }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'persian-patch',
      description: 'Patch Claude Desktop for Persian font and RTL (install, status, uninstall, font)',
      argumentHint: 'install|status|uninstall|font <name>',
    })

    return next(e)
  })

  on('command.run', { command: 'persian-patch' }, async ($, e) => {
    const parsed = parseArgs(e.args ?? '')
    if (parsed.kind === 'error') return { text: `${parsed.message}\n\n${help()}` }
    if (parsed.action === 'help') return { text: help() }

    const env: Env = {
      OS: await $.env.get('OS'),
      HOME: await $.env.get('HOME'),
      USERPROFILE: await $.env.get('USERPROFILE'),
      LOCALAPPDATA: await $.env.get('LOCALAPPDATA'),
      XDG_DATA_HOME: await $.env.get('XDG_DATA_HOME'),
    }
    const uname = await $.process.run(['uname', '-s']).then(
      result => (result.exitCode === 0 ? result.stdout : undefined),
      () => undefined,
    )
    const os = detectOs(env, uname)
    const installer = installerFor(os)
    if (installer === undefined) return { text: unsupported(os) }

    const script = joinPath(os, $.plugin.root, 'patcher', installer.script)
    if (!(await $.fs.exists(script))) {
      return { text: `نصب‌کننده پیدا نشد / installer not found: ${script}` }
    }

    const action: Action = parsed.action
    let font = parsed.font
    if (needsConsent(action)) {
      const pending = (await $.store.get(CONSENT_KEY)) as Consent | undefined
      const now = await $.clock.now()
      const isValid =
        parsed.isConfirmed &&
        pending !== undefined &&
        pending.action === action &&
        pending.os === os &&
        now - pending.at <= CONSENT_MINUTES * 60_000

      if (!isValid) {
        // Show the risks and remember that they were shown; a confirm is only
        // honoured for the same action, soon after.
        await $.store.set(CONSENT_KEY, { action, os, at: now } satisfies Consent)

        return { text: risks(os, action === 'font' ? `font ${parsed.font}` : action) }
      }
      await $.store.delete(CONSENT_KEY)
    }

    if (action === 'install' && font === undefined) {
      const rows = await $.config.list()
      const row = rows.find(r => r.key === FONT_ROW)
      if (typeof row?.value === 'string' && row.value !== '') font = row.value
    }
    if (action === 'font' && font !== undefined) {
      // Remember the choice in persian-fonts' options when that plugin is there.
      await $.config.set({ key: FONT_ROW, value: font }).catch(() => undefined)
    }

    const argv = ['bash', script, action === 'font' ? 'install' : action]
    if (action === 'install' || action === 'font') {
      argv.push('--yes')
      if (font !== undefined && font !== DEFAULT_FONT) argv.push('--font', font)
    }
    if (action === 'uninstall') argv.push('--yes')

    const ran = await $.process.run(argv, { timeoutMs: 600_000 }).then(
      result => result,
      () => undefined,
    )
    if (ran === undefined) return { text: manualCommand(argv) }

    const output = `${ran.stdout}${ran.stderr}`.trim()
    const shown = output.length > TAIL ? `…${output.slice(-TAIL)}` : output
    const meaning = EXIT_MEANING[ran.exitCode]
    if (ran.exitCode === 0) return { text: shown }

    return { text: `${shown}\n\n(exit ${ran.exitCode}${meaning ? `: ${meaning}` : ''})` }
  })
}
