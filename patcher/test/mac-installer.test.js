// The macOS installer, run with stand-ins for the macOS tools (codesign, ditto,
// plutil ...) so its steps, order and failure handling can be checked anywhere.
// A test against the real tools runs in CI on macOS (mac-installer-real.test.js).
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import * as asarLib from '@electron/asar'

const require = createRequire(import.meta.url)
const asar = require('../src/asar.cjs')
const plist = require('../src/plist.cjs')

const SCRIPT = new URL('../patch-mac.sh', import.meta.url).pathname
const skip = process.platform === 'win32' ? 'bash installers do not run on Windows' : false
const MACHO = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0, 0, 0, 0, 1, 2, 3])

const INFO = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
\t<key>CFBundleName</key>
\t<string>Claude</string>
\t<key>ElectronAsarIntegrity</key>
\t<dict>
\t\t<key>Resources/app.asar</key>
\t\t<dict>
\t\t\t<key>algorithm</key>
\t\t\t<string>SHA256</string>
\t\t\t<key>hash</key>
\t\t\t<string>${'0'.repeat(64)}</string>
\t\t</dict>
\t</dict>
</dict>
</plist>
`

const ENTITLEMENTS = `<?xml version="1.0"?>
<plist version="1.0">
<dict>
\t<key>com.apple.application-identifier</key>
\t<string>TEAMID.com.example.claude</string>
\t<key>com.apple.security.cs.allow-jit</key>
\t<true/>
\t<key>keychain-access-groups</key>
\t<array><string>TEAMID.com.example.claude</string></array>
</dict>
</plist>
`

const STUBS = {
  uname: '#!/bin/sh\n[ "$1" = "-s" ] && echo Darwin || /usr/bin/uname "$@"\n',
  ditto: '#!/bin/sh\ncp -R "$1" "$2"\n',
  plutil: '#!/bin/sh\nexit 0\n',
  xattr: '#!/bin/sh\nexit 0\n',
  pgrep: '#!/bin/sh\nexit 1\n',
  open: '#!/bin/sh\necho "open $*" >> "$STUB_LOG"\n',
  codesign: `#!/bin/sh
case "$1" in
  -d) cat "$STUB_ENTS"; exit 0 ;;
  --verify) echo "verify $*" >> "$STUB_LOG"; [ -z "$STUB_VERIFY_FAIL" ]; exit $? ;;
esac
# codesign --force --sign - [--entitlements FILE] ITEM
item=""; ents=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --entitlements) ents="$2"; shift ;;
    --force|--sign|-) ;;
    *) item="$1" ;;
  esac
  shift
done
echo "sign $item" >> "$STUB_LOG"
[ -n "$ents" ] && cp "$ents" "$STUB_LOG.last-ents"
case "$item" in *"$STUB_SIGN_FAIL"*) [ -n "$STUB_SIGN_FAIL" ] && exit 1 ;; esac
exit 0
`,
}

let work
let bin
let log
let source
let target
let home

const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex')

function put(rel, data) {
  const file = join(source, rel)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, data)
}

before(async () => {
  if (skip) return
  work = mkdtempSync(join(tmpdir(), 'پچ مک pk '))
  home = join(work, 'home')
  mkdirSync(join(home, 'Applications'), { recursive: true })
  bin = join(work, 'bin')
  mkdirSync(bin)
  for (const [name, text] of Object.entries(STUBS)) {
    writeFileSync(join(bin, name), text)
    chmodSync(join(bin, name), 0o755)
  }
  writeFileSync(join(work, 'ents.plist'), ENTITLEMENTS)
  log = join(work, 'calls.log')

  source = join(work, 'Claude.app')
  target = join(home, 'Applications', 'Claude-Persian.app')
  put('Contents/Info.plist', INFO)
  put('Contents/MacOS/Claude', MACHO)
  put('Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework', MACHO)
  put('Contents/Frameworks/Claude Helper (GPU).app/Contents/MacOS/Claude Helper (GPU)', MACHO)
  symlinkSync('Versions/A', join(source, 'Contents/Frameworks/Electron Framework.framework/Current'))

  const src = join(work, 'asar src')
  mkdirSync(join(src, '.vite/build'), { recursive: true })
  writeFileSync(join(src, 'package.json'), '{"name":"claude","version":"4.5.6","main":".vite/build/index.pre.js"}')
  writeFileSync(join(src, '.vite/build/index.pre.js'), 'require("electron")')
  writeFileSync(join(src, '.vite/build/mainView.js'), '"use strict";\nrequire("electron").contextBridge;\n')
  mkdirSync(join(source, 'Contents/Resources'), { recursive: true })
  await asarLib.createPackage(src, join(source, 'Contents/Resources/app.asar'))
})

after(() => {
  if (work) rmSync(work, { recursive: true, force: true })
})

function run(args, extra = {}) {
  rmSync(log, { force: true })
  rmSync(log + '.last-ents', { force: true })
  const result = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      HOME: home,
      STUB_LOG: log,
      STUB_ENTS: join(work, 'ents.plist'),
      ...extra,
    },
  })
  const calls = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []

  return { ...result, calls }
}

const common = ['--source', '__SOURCE__']
const args = (...rest) => [...rest].map(a => (a === '__SOURCE__' ? source : a))

test('the script has no shell syntax errors', { skip }, () => {
  assert.equal(spawnSync('bash', ['-n', SCRIPT]).status, 0)
})

test('it refuses to run anywhere but macOS', { skip: skip || process.platform === 'darwin' }, () => {
  const result = spawnSync('bash', [SCRIPT, 'install', '--yes'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: home } })
  assert.equal(result.status, 3)
  assert.match(result.stderr, /for macOS/)
})

test('no Claude.app: a clear message and exit 4', { skip }, () => {
  const result = run(['install', '--yes', '--source', join(work, 'Missing.app')])
  assert.equal(result.status, 4)
  assert.match(result.stderr, /not an app bundle/)
})

test('it asks before changing anything', { skip }, () => {
  const result = run(args('install', ...common))
  assert.equal(result.status, 2)
  assert.equal(existsSync(target), false)
})

test('install patches a copy, repoints the hash and signs inside out', { skip }, () => {
  const asarBefore = sha(join(source, 'Contents/Resources/app.asar'))
  const infoBefore = sha(join(source, 'Contents/Info.plist'))

  const result = run(args('install', '--yes', ...common))
  assert.equal(result.status, 0, result.stderr + result.stdout)

  // The original app is exactly as it was.
  assert.equal(sha(join(source, 'Contents/Resources/app.asar')), asarBefore)
  assert.equal(sha(join(source, 'Contents/Info.plist')), infoBefore)

  // The copy carries the payload, and Info.plist points at its header hash.
  const copyAsar = join(target, 'Contents/Resources/app.asar')
  const xml = readFileSync(join(target, 'Contents/Info.plist'), 'utf8')
  assert.equal(plist.getString(xml, ['ElectronAsarIntegrity', 'Resources/app.asar', 'hash']), asar.currentHeaderHash(copyAsar))
  assert.equal(plist.getString(xml, ['CFBundleDisplayName']), 'Claude Persian')
  assert.equal(plist.getString(xml, ['CFBundleName']), 'Claude')
  assert.match(asar.readFile(copyAsar, '.vite/build/mainView.js').toString(), /PERSIAN-KIT:START/)
  assert.equal(asar.readFile(copyAsar, '.vite/build/index.pre.js').toString(), 'require("electron")')

  // Everything is signed before the bundle that holds it; the app itself is last.
  const signed = result.calls.filter(c => c.startsWith('sign ')).map(c => c.slice(5))
  const at = suffix => signed.findIndex(s => s.endsWith(suffix))
  assert.ok(signed.length >= 5, signed.join('\n'))
  assert.ok(at('Electron Framework.framework/Versions/A/Electron Framework') < at('Electron Framework.framework'))
  assert.ok(at('Claude Helper (GPU).app/Contents/MacOS/Claude Helper (GPU)') < at('Claude Helper (GPU).app'))
  assert.ok(signed[signed.length - 1].endsWith('Claude-Persian.app.new'))
  assert.ok(result.calls.some(c => c.startsWith('verify --verify --deep --strict')))

  // Team-bound entitlements are dropped, the others kept.
  const ents = readFileSync(log + '.last-ents', 'utf8')
  assert.doesNotMatch(ents, /TEAMID|application-identifier|keychain-access-groups/)
  assert.match(ents, /allow-jit/)

  assert.equal(existsSync(target + '.new'), false)
  assert.ok(existsSync(join(target, 'Contents/Resources/.persian-kit.json')))
})

test('status reports the copy', { skip }, () => {
  const result = run(['status'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /installed: yes/)
  assert.match(result.stdout, /version: 4\.5\.6/)
  assert.match(result.stdout, /patched: true/)
  assert.match(result.stdout, /font: Vazirmatn/)
})

test('a failed signature leaves the earlier copy in place and no leftovers', { skip }, () => {
  const marker = readFileSync(join(target, 'Contents/Resources/.persian-kit.json'), 'utf8')
  const result = run(args('install', '--yes', '--font', 'Inter', ...common), { STUB_SIGN_FAIL: 'Helper' })
  assert.equal(result.status, 5)
  assert.match(result.stderr, /could not sign/)
  assert.equal(existsSync(target + '.new'), false)
  assert.equal(readFileSync(join(target, 'Contents/Resources/.persian-kit.json'), 'utf8'), marker)
  assert.match(run(['status']).stdout, /font: Vazirmatn/)
})

test('a signature that does not verify is a failure too', { skip }, () => {
  const result = run(args('install', '--yes', ...common), { STUB_VERIFY_FAIL: '1' })
  assert.equal(result.status, 5)
  assert.match(result.stderr, /does not verify/)
  assert.equal(existsSync(target + '.new'), false)
})

test('installing again with another font replaces the copy', { skip }, () => {
  const result = run(args('install', '--yes', '--font', 'B Nazanin', '--launch', ...common))
  assert.equal(result.status, 0, result.stderr)
  assert.match(run(['status']).stdout, /font: B Nazanin/)
  assert.ok(result.calls.some(c => c.startsWith('open ')))
})

test('it will not replace or remove an app it did not make', { skip }, () => {
  const other = join(work, 'Other.app')
  mkdirSync(join(other, 'Contents/Resources'), { recursive: true })
  writeFileSync(join(other, 'Contents/Resources/precious.txt'), 'mine')
  const install = run(args('install', '--yes', '--target', other, ...common))
  assert.equal(install.status, 5)
  const uninstall = run(['uninstall', '--yes', '--target', other])
  assert.equal(uninstall.status, 5)
  assert.ok(existsSync(join(other, 'Contents/Resources/precious.txt')))
})

test('uninstall removes the copy and leaves Claude.app alone', { skip }, () => {
  const before = sha(join(source, 'Contents/Resources/app.asar'))
  const result = run(['uninstall', '--yes'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(existsSync(target), false)
  assert.equal(sha(join(source, 'Contents/Resources/app.asar')), before)
  assert.match(run(['status']).stdout, /installed: no/)
})

test('usage mistakes exit 2', { skip }, () => {
  assert.equal(run([]).status, 2)
  assert.equal(run(['frobnicate']).status, 2)
  assert.equal(run(['status', '--bogus']).status, 2)
  assert.equal(run(['install', '--source']).status, 2)
})
