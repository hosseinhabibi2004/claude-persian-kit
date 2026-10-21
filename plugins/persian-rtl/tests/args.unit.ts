import assert from 'node:assert/strict'
import { test } from 'node:test'

import { isFontName, needsConsent, parseArgs } from '../hooks/args.ts'
import { help, manualCommand, risks, unsupported } from '../hooks/messages.ts'

test('actions and --confirm are read, case and spacing do not matter', () => {
  assert.deepEqual(parseArgs(''), { kind: 'ok', action: 'help', isConfirmed: false })
  assert.deepEqual(parseArgs('  INSTALL  '), { kind: 'ok', action: 'install', isConfirmed: false })
  assert.deepEqual(parseArgs('install --confirm'), { kind: 'ok', action: 'install', isConfirmed: true })
  assert.deepEqual(parseArgs('status'), { kind: 'ok', action: 'status', isConfirmed: false })
  assert.deepEqual(parseArgs('uninstall --yes'), { kind: 'ok', action: 'uninstall', isConfirmed: true })
})

test('font takes the rest of the line, with or without quotes, Persian included', () => {
  assert.deepEqual(parseArgs('font Vazirmatn'), { kind: 'ok', action: 'font', isConfirmed: false, font: 'Vazirmatn' })
  assert.equal((parseArgs('font B Nazanin --confirm') as { font: string }).font, 'B Nazanin')
  assert.equal((parseArgs('font "Noto Naskh Arabic"') as { font: string }).font, 'Noto Naskh Arabic')
  assert.equal((parseArgs('font ب نازنین') as { font: string }).font, 'ب نازنین')
})

test('mistakes are errors with a reason, not silently ignored', () => {
  assert.deepEqual(parseArgs('frobnicate'), { kind: 'error', message: 'unknown action: frobnicate' })
  assert.deepEqual(parseArgs('install --force'), { kind: 'error', message: 'unknown option: --force' })
  assert.equal(parseArgs('install now').kind, 'error')
  assert.equal(parseArgs('font').kind, 'error')
  assert.equal(parseArgs('font A"; rm -rf /; "').kind, 'error')
  assert.equal(parseArgs('font ' + 'x'.repeat(81)).kind, 'error')
})

test('font names: plain names only', () => {
  for (const ok of ['Vazirmatn', 'B Nazanin', 'Noto Sans-Arabic_2', 'ب نازنین', 'Font.Name']) assert.equal(isFontName(ok), true, ok)
  for (const bad of ['', 'a;b', 'a"b', '$(x)', 'a\nb', '<b>', '`x`']) assert.equal(isFontName(bad), false, bad)
})

test('only install and font need consent', () => {
  assert.equal(needsConsent('install'), true)
  assert.equal(needsConsent('font'), true)
  for (const a of ['status', 'uninstall', 'help'] as const) assert.equal(needsConsent(a), false)
})

test('the risk text is per system and tells how to go ahead', () => {
  const mac = risks('macos', 'install')
  assert.match(mac, /Gatekeeper/)
  assert.match(mac, /Keychain/)
  assert.match(mac, /\/persian-patch install --confirm/)
  assert.match(risks('linux', 'install'), /EXPERIMENTAL/)
  assert.match(risks('macos', 'font B Nazanin'), /\/persian-patch font B Nazanin --confirm/)
  for (const os of ['macos', 'linux'] as const) assert.match(risks(os, 'install'), /COPY/)
})

test('Windows is told clearly that the patcher is not in v0.1.0', () => {
  assert.match(unsupported('windows'), /not part of v0\.1\.0/)
  assert.match(unsupported('unknown'), /nothing was run/)
})

test('a command for the person to run by hand is quoted for a shell', () => {
  const text = manualCommand(['bash', '/Users/علی رضا/p/patch-mac.sh', 'install', '--font', "B Naz'anin"])
  assert.match(text, /bash '\/Users\/علی رضا\/p\/patch-mac\.sh' install --font 'B Naz'\\''anin'/)
})

test('help lists every action', () => {
  for (const word of ['install', 'status', 'uninstall', 'font']) assert.match(help(), new RegExp(word))
})
