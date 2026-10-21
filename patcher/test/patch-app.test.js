import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import * as asarLib from '@electron/asar'

const require = createRequire(import.meta.url)
const app = require('../src/patch-app.cjs')
const asar = require('../src/asar.cjs')
const payload = require('../src/payload.cjs')

const CLI = new URL('../src/patch-app.cjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')

const FILES = {
  'package.json': '{"name":"claude","productName":"Claude","version":"9.9.9","main":"./.vite/build/index.pre.js"}',
  '.vite/build/index.pre.js': '"use strict";\nconst { app } = require("electron");\napp.whenReady();\n',
  '.vite/build/mainView.js': '"use strict";\nconst { contextBridge, ipcRenderer } = require("electron");\ncontextBridge.exposeInMainWorld("a", {});\n',
  '.vite/build/mainWindow.js': 'const { ipcRenderer } = require("electron");\nipcRenderer.send("x");\n',
  '.vite/build/index.js': 'const fs = require("node:fs");\nmodule.exports = fs;\n',
  '.vite/build/nodeHost.js': 'const { ipcRenderer } = require("electron");\n',
  '.vite/build/util.js': 'module.exports = 1;\n',
  'assets/readme.txt': 'hello',
}

let work
let archive

before(async () => {
  work = mkdtempSync(join(tmpdir(), 'pk app ب '))
  const src = join(work, 'src')
  for (const [rel, text] of Object.entries(FILES)) {
    mkdirSync(join(src, rel, '..'), { recursive: true })
    writeFileSync(join(src, rel), text)
  }
  archive = join(work, 'app.asar')
  await asarLib.createPackage(src, archive)
})

after(() => rmSync(work, { recursive: true, force: true }))

const read = (file, rel) => asar.readFile(file, rel).toString('utf8')

test('identify reads the app from package.json', () => {
  assert.deepEqual(app.identify(archive), {
    name: 'claude',
    productName: 'Claude',
    version: '9.9.9',
    main: '.vite/build/index.pre.js',
  })
})

test('targets are preload scripts; the main entry and node bundles are never chosen', () => {
  const { targets, candidates } = app.selectTargets(archive)
  assert.deepEqual(targets.sort(), ['.vite/build/mainView.js', '.vite/build/mainWindow.js'])
  assert.equal(candidates.includes('.vite/build/index.pre.js'), false)
  assert.equal(candidates.includes('.vite/build/nodeHost.js'), false)

  const all = app.selectTargets(archive, { all: true }).targets
  assert.ok(all.includes('.vite/build/util.js'))
  assert.equal(all.includes('.vite/build/index.pre.js'), false)
})

test('inject patches the targets only, and the result verifies', () => {
  const out = join(work, 'patched.asar')
  const result = app.inject(archive, out, { fontLocal: 'Inter' })
  assert.deepEqual(result.patched.sort(), ['.vite/build/mainView.js', '.vite/build/mainWindow.js'])
  assert.equal(result.version, '9.9.9')
  assert.equal(result.headerHash, asar.verify(out))

  assert.ok(payload.hasPayload(read(out, '.vite/build/mainView.js')))
  assert.ok(read(out, '.vite/build/mainView.js').startsWith('"use strict";\n'))
  for (const untouched of ['.vite/build/index.pre.js', '.vite/build/index.js', '.vite/build/util.js', 'assets/readme.txt']) {
    assert.equal(read(out, untouched), FILES[untouched])
  }
})

test('status tells whether and how an archive is patched', () => {
  const plain = app.status(archive)
  assert.equal(plain.isPatched, false)
  assert.deepEqual(plain.patched, [])

  const out = join(work, 'status.asar')
  app.inject(archive, out, { fontLocal: 'B Nazanin' })
  const patched = app.status(out)
  assert.equal(patched.isPatched, true)
  assert.equal(patched.patched.length, 2)
  assert.equal(patched.font, 'B Nazanin')

  const noFont = join(work, 'nofont.asar')
  app.inject(archive, noFont, { font: false })
  assert.equal(app.status(noFont).font, '')
})

test('patching an already patched archive keeps one payload; strip restores the original', () => {
  const once = join(work, 'once.asar')
  const twice = join(work, 'twice.asar')
  const restored = join(work, 'restored.asar')
  app.inject(archive, once, { font: false })
  app.inject(once, twice, { fontLocal: 'Inter' })
  assert.equal(read(twice, '.vite/build/mainView.js').split('PERSIAN-KIT:START').length, 2)

  const result = app.strip(twice, restored)
  assert.equal(result.restored.length, 2)
  for (const [rel, text] of Object.entries(FILES)) {
    assert.equal(read(restored, rel), text, rel)
  }
  assert.equal(app.status(restored).isPatched, false)
})

test('an app with no renderer script is refused, naming what was looked at', async () => {
  const src = join(work, 'no-preload')
  mkdirSync(join(src, '.vite/build'), { recursive: true })
  writeFileSync(join(src, 'package.json'), '{"name":"x","main":".vite/build/main.js"}')
  writeFileSync(join(src, '.vite/build/main.js'), 'require("electron")')
  writeFileSync(join(src, '.vite/build/util.js'), 'module.exports = 1')
  const bare = join(work, 'bare.asar')
  await asarLib.createPackage(src, bare)

  assert.throws(
    () => app.inject(bare, join(work, 'bare-out.asar'), { font: false }),
    /no renderer script found.*\.vite\/build\/util\.js.*--all-js/,
  )
  const forced = app.inject(bare, join(work, 'bare-forced.asar'), { font: false, all: true })
  assert.deepEqual(forced.patched, ['.vite/build/util.js'])
})

test('the command line prints JSON and fails with a one-line message', () => {
  const out = join(work, 'cli.asar')
  const ok = spawnSync(process.execPath, [CLI, 'inject', '--asar', archive, '--out', out, '--no-font'], { encoding: 'utf8' })
  assert.equal(ok.status, 0, ok.stderr)
  assert.equal(JSON.parse(ok.stdout).patched.length, 2)

  const again = spawnSync(process.execPath, [CLI, 'inject', '--asar', archive, '--out', out], { encoding: 'utf8' })
  assert.equal(again.status, 1)
  assert.match(again.stderr, /^persian-kit: /)

  const bad = spawnSync(process.execPath, [CLI, 'frobnicate'], { encoding: 'utf8' })
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /usage:/)

  const missing = spawnSync(process.execPath, [CLI, 'status'], { encoding: 'utf8' })
  assert.match(missing.stderr, /missing --asar/)
})

test('plist-integrity points the stored hash at the new archive', () => {
  const file = join(work, 'Info.plist')
  writeFileSync(
    file,
    '<?xml version="1.0"?>\n<plist version="1.0">\n<dict>\n\t<key>CFBundleName</key>\n\t<string>Claude</string>\n' +
      '\t<key>ElectronAsarIntegrity</key>\n\t<dict>\n\t\t<key>Resources/app.asar</key>\n\t\t<dict>\n' +
      '\t\t\t<key>algorithm</key>\n\t\t\t<string>SHA256</string>\n\t\t\t<key>hash</key>\n\t\t\t<string>old</string>\n' +
      '\t\t</dict>\n\t</dict>\n</dict>\n</plist>\n',
  )
  const run = spawnSync(
    process.execPath,
    [CLI, 'plist-integrity', '--plist', file, '--hash', 'f'.repeat(64), '--display-name', 'Claude Persian'],
    { encoding: 'utf8' },
  )
  assert.equal(run.status, 0, run.stderr)
  assert.equal(JSON.parse(run.stdout).hadIntegrity, true)
  const text = readFileSync(file, 'utf8')
  assert.match(text, new RegExp(`<string>${'f'.repeat(64)}</string>`))
  assert.match(text, /<key>CFBundleDisplayName<\/key>\s*<string>Claude Persian<\/string>/)
})

test('entitlements lose the keys tied to the original developer team', () => {
  const ents =
    '<?xml version="1.0"?>\n<plist version="1.0">\n<dict>\n\t<key>com.apple.application-identifier</key>\n\t<string>T.x</string>\n' +
    '\t<key>com.apple.security.cs.allow-jit</key>\n\t<true/>\n\t<key>keychain-access-groups</key>\n\t<array><string>T.x</string></array>\n' +
    '\t<key>com.apple.security.virtualization</key>\n\t<true/>\n</dict>\n</plist>\n'
  const run = spawnSync(process.execPath, [CLI, 'entitlements'], { input: ents, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.doesNotMatch(run.stdout, /T\.x|application-identifier|keychain-access-groups/)
  assert.match(run.stdout, /allow-jit/)
  assert.match(run.stdout, /virtualization/)
})

test('list-code finds Mach-O files and bundles, deepest first, skipping links', () => {
  const root = join(work, 'Fake App.app')
  const macho = Buffer.from([0xcf, 0xfa, 0xed, 0xfe, 0, 0, 0, 0])
  const put = (rel, data) => {
    mkdirSync(join(root, rel, '..'), { recursive: true })
    writeFileSync(join(root, rel), data)
  }
  put('Contents/MacOS/Claude', macho)
  put('Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework', macho)
  put('Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libx.dylib', macho)
  put('Contents/Frameworks/Claude Helper (GPU).app/Contents/MacOS/Claude Helper (GPU)', macho)
  put('Contents/Resources/app.asar', 'not code')
  put('Contents/Resources/script.sh', '#!/bin/sh\n')
  symlinkSync('Versions/A', join(root, 'Contents/Frameworks/Electron Framework.framework/Current'))

  const list = app.listCode(root).map(p => p.slice(root.length + 1))
  assert.equal(list.includes('Contents/Resources/app.asar'), false)
  assert.equal(list.includes('Contents/Resources/script.sh'), false)
  assert.ok(list.includes('Contents/Frameworks/Electron Framework.framework'))
  assert.ok(list.includes('Contents/Frameworks/Claude Helper (GPU).app'))
  assert.ok(list.includes('Contents/MacOS/Claude'))
  // Contents are listed before the bundle that holds them.
  const at = name => list.indexOf(name)
  assert.ok(at('Contents/Frameworks/Electron Framework.framework/Versions/A/Libraries/libx.dylib') < at('Contents/Frameworks/Electron Framework.framework'))
  assert.ok(at('Contents/Frameworks/Claude Helper (GPU).app/Contents/MacOS/Claude Helper (GPU)') < at('Contents/Frameworks/Claude Helper (GPU).app'))
  assert.ok(at('Contents/Frameworks/Claude Helper (GPU).app') < at('Contents/MacOS/Claude') || true)
})
