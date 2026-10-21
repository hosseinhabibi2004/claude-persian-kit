// The macOS installer against the real macOS tools (codesign, ditto, plutil ...)
// and a real Mach-O program. Runs only on macOS (the CI job on macos-latest);
// elsewhere it is skipped. The stand-in based test (mac-installer.test.js) checks
// the same steps everywhere.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import * as asarLib from '@electron/asar'

const require = createRequire(import.meta.url)
const asar = require('../src/asar.cjs')
const plist = require('../src/plist.cjs')

const SCRIPT = new URL('../patch-mac.sh', import.meta.url).pathname
const skip = process.platform === 'darwin' ? false : 'needs macOS'

const INFO = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
\t<key>CFBundleName</key><string>Claude</string>
\t<key>CFBundleExecutable</key><string>Claude</string>
\t<key>CFBundleIdentifier</key><string>com.example.claude-test</string>
\t<key>CFBundlePackageType</key><string>APPL</string>
\t<key>CFBundleVersion</key><string>1</string>
\t<key>ElectronAsarIntegrity</key>
\t<dict>
\t\t<key>Resources/app.asar</key>
\t\t<dict>
\t\t\t<key>algorithm</key><string>SHA256</string>
\t\t\t<key>hash</key><string>${'0'.repeat(64)}</string>
\t\t</dict>
\t</dict>
</dict>
</plist>
`

let work
let source
let home
let target

const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const run = (args, env = {}) =>
  spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home, ...env } })

before(async () => {
  if (skip) return
  work = mkdtempSync(join(tmpdir(), 'پچ مک واقعی '))
  home = join(work, 'home')
  mkdirSync(join(home, 'Applications'), { recursive: true })
  source = join(work, 'Claude.app')
  target = join(home, 'Applications', 'Claude-Persian.app')

  mkdirSync(join(source, 'Contents/MacOS'), { recursive: true })
  mkdirSync(join(source, 'Contents/Resources'), { recursive: true })
  writeFileSync(join(source, 'Contents/Info.plist'), INFO)
  const c = join(work, 'main.c')
  writeFileSync(c, '#include <stdio.h>\nint main(void) { puts("claude-test-ok"); return 0; }\n')
  const built = spawnSync('cc', ['-o', join(source, 'Contents/MacOS/Claude'), c])
  assert.equal(built.status, 0, String(built.stderr))

  const src = join(work, 'asar src')
  mkdirSync(join(src, '.vite/build'), { recursive: true })
  writeFileSync(join(src, 'package.json'), '{"name":"claude","version":"7.7.7","main":".vite/build/index.pre.js"}')
  writeFileSync(join(src, '.vite/build/index.pre.js'), 'require("electron")')
  writeFileSync(join(src, '.vite/build/mainView.js'), 'require("electron").contextBridge;\n')
  await asarLib.createPackage(src, join(source, 'Contents/Resources/app.asar'))
  const signed = spawnSync('codesign', ['--force', '--sign', '-', source])
  assert.equal(signed.status, 0, String(signed.stderr))
})

after(() => {
  if (work) rmSync(work, { recursive: true, force: true })
})

test('install builds a copy that is signed, verifies and still runs', { skip }, () => {
  const before = sha(join(source, 'Contents/Resources/app.asar'))
  const result = run(['install', '--yes', '--source', source])
  assert.equal(result.status, 0, result.stderr + result.stdout)

  assert.equal(sha(join(source, 'Contents/Resources/app.asar')), before)
  assert.equal(spawnSync('codesign', ['--verify', '--deep', '--strict', target]).status, 0)
  assert.equal(spawnSync('codesign', ['--verify', '--deep', '--strict', source]).status, 0)

  const info = spawnSync('codesign', ['-dv', target], { encoding: 'utf8' })
  assert.match(info.stderr, /Signature=adhoc/)

  const xml = readFileSync(join(target, 'Contents/Info.plist'), 'utf8')
  const copyAsar = join(target, 'Contents/Resources/app.asar')
  assert.equal(plist.getString(xml, ['ElectronAsarIntegrity', 'Resources/app.asar', 'hash']), asar.currentHeaderHash(copyAsar))
  assert.equal(plist.getString(xml, ['CFBundleDisplayName']), 'Claude Persian')

  const ran = spawnSync(join(target, 'Contents/MacOS/Claude'), { encoding: 'utf8' })
  assert.equal(ran.stdout.trim(), 'claude-test-ok')
})

test('status, a second install with another font, and uninstall', { skip }, () => {
  assert.match(run(['status']).stdout, /patched: true/)
  const again = run(['install', '--yes', '--source', source, '--font', 'B Nazanin'])
  assert.equal(again.status, 0, again.stderr)
  assert.match(run(['status']).stdout, /font: B Nazanin/)
  assert.equal(run(['uninstall', '--yes']).status, 0)
  assert.equal(existsSync(target), false)
  assert.equal(spawnSync('codesign', ['--verify', source]).status, 0)
})
