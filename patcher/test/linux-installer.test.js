import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import * as asarLib from '@electron/asar'

const SCRIPT = new URL('../patch-linux.sh', import.meta.url).pathname
const skip = process.platform === 'win32' ? 'bash installers do not run on Windows' : false

const PRELOAD = '"use strict";\nconst { contextBridge } = require("electron");\ncontextBridge.exposeInMainWorld("a", {});\n'
const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex')

let home
let install
let asarFile

const run = (args, { env = {}, input } = {}) =>
  spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    input,
    env: { PATH: process.env.PATH, HOME: home, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

before(async () => {
  if (skip) return
  home = mkdtempSync(join(tmpdir(), 'خانه ی pk '))
  install = join(home, 'opt', 'Claude Desktop ب')
  const src = join(home, 'asar src')
  mkdirSync(join(src, '.vite/build'), { recursive: true })
  writeFileSync(join(src, 'package.json'), '{"name":"claude","productName":"Claude","version":"1.2.3","main":".vite/build/index.pre.js"}')
  writeFileSync(join(src, '.vite/build/index.pre.js'), 'require("electron")')
  writeFileSync(join(src, '.vite/build/mainView.js'), PRELOAD)
  mkdirSync(join(install, 'resources'), { recursive: true })
  asarFile = join(install, 'resources', 'app.asar')
  await asarLib.createPackage(src, asarFile)
  // Something that looks like the Electron program of an install.
  for (const candidate of ['/bin/true', '/usr/bin/true']) {
    if (existsSync(candidate)) {
      copyFileSync(candidate, join(install, 'claude'))
      break
    }
  }
  writeFileSync(join(install, 'LICENSE'), 'x')
})

after(() => {
  if (home) rmSync(home, { recursive: true, force: true })
})

const kit = () => join(home, '.local', 'share', 'claude-persian-kit')

test('the script has no shell syntax errors', { skip }, () => {
  const check = spawnSync('bash', ['-n', SCRIPT], { encoding: 'utf8' })
  assert.equal(check.status, 0, check.stderr)
})

test('detect finds the archive of an install with spaces and Persian letters', { skip }, () => {
  const result = run(['detect', '--path', install])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /version: 1\.2\.3/)
  assert.ok(result.stdout.includes(asarFile))
})

test('nothing found says so clearly and exits 4', { skip }, () => {
  const empty = mkdtempSync(join(tmpdir(), 'pk empty '))
  const none = run(['install', '--yes'], { env: { HOME: empty } })
  rmSync(empty, { recursive: true, force: true })
  assert.equal(none.status, 4)
  assert.match(none.stderr, /no Claude Desktop \(Electron\) installation found/)
  assert.match(none.stderr, /official Claude Desktop for Linux/)

  const missing = run(['install', '--yes', '--path', join(home, 'nope')])
  assert.equal(missing.status, 4)

  const notClaude = join(home, 'other')
  mkdirSync(notClaude)
  assert.equal(run(['install', '--yes', '--path', notClaude]).status, 4)
})

test('it never changes anything without a yes', { skip }, () => {
  const result = run(['install', '--path', install])
  assert.equal(result.status, 2)
  assert.equal(existsSync(kit()), false)
})

test('install makes a patched copy and leaves the original untouched', { skip }, () => {
  const before = sha(asarFile)
  const result = run(['install', '--yes', '--path', install])
  assert.equal(result.status, 0, result.stderr + result.stdout)

  const copy = join(kit(), 'Claude-Persian')
  assert.ok(existsSync(join(copy, '.persian-kit.json')))
  assert.equal(sha(asarFile), before)
  assert.notEqual(sha(join(copy, 'resources', 'app.asar')), before)
  assert.deepEqual(readdirSync(kit()).sort(), ['Claude-Persian'])

  const launcher = join(home, '.local', 'bin', 'claude-persian')
  assert.ok(statSync(launcher).mode & 0o111)
  const text = readFileSync(launcher, 'utf8')
  assert.match(text, /# claude-persian-kit/)
  assert.ok(text.includes(copy) || text.includes('electron'))
  assert.doesNotMatch(text, /--no-sandbox/)

  const desktop = readFileSync(join(home, '.local', 'share', 'applications', 'claude-persian.desktop'), 'utf8')
  assert.ok(desktop.includes(`Exec="${launcher}"`))
})

test('status reports the copy, its font and what was patched', { skip }, () => {
  const result = run(['status'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /installed: yes/)
  assert.match(result.stdout, /patched: true/)
  assert.match(result.stdout, /font: Vazirmatn/)
  assert.match(result.stdout, /version: 1\.2\.3/)
})

test('installing again with another font replaces the copy cleanly', { skip }, () => {
  const result = run(['install', '--yes', '--path', install, '--font', 'B Nazanin', '--no-sandbox'])
  assert.equal(result.status, 0, result.stderr)
  assert.match(run(['status']).stdout, /font: B Nazanin/)
  assert.deepEqual(readdirSync(kit()).sort(), ['Claude-Persian'])
  assert.match(readFileSync(join(home, '.local', 'bin', 'claude-persian'), 'utf8'), /--no-sandbox/)
})

test('a bad font name is refused before anything is replaced', { skip }, () => {
  const result = run(['install', '--yes', '--path', install, '--font', 'A"; rm -rf x; "'])
  assert.equal(result.status, 5)
  assert.match(run(['status']).stdout, /font: B Nazanin/)
})

test('it refuses to copy a folder that is clearly not an app folder', { skip }, () => {
  const loose = join(home, 'app.asar')
  copyFileSync(asarFile, loose)
  const result = run(['install', '--yes', '--path', loose])
  assert.equal(result.status, 5)
  assert.match(result.stderr, /refusing to copy/)
})

test('unknown commands and options are usage errors', { skip }, () => {
  assert.equal(run([]).status, 2)
  assert.equal(run(['frobnicate']).status, 2)
  assert.equal(run(['status', '--bogus']).status, 2)
})

test('uninstall removes what the kit made and nothing else', { skip }, () => {
  const before = sha(asarFile)
  const result = run(['uninstall', '--yes'])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(existsSync(join(kit(), 'Claude-Persian')), false)
  assert.equal(existsSync(join(home, '.local', 'bin', 'claude-persian')), false)
  assert.equal(existsSync(join(home, '.local', 'share', 'applications', 'claude-persian.desktop')), false)
  assert.equal(sha(asarFile), before)
  assert.match(run(['status']).stdout, /installed: no/)
})

test('uninstall will not delete a folder the kit did not make', { skip }, () => {
  mkdirSync(join(kit(), 'Claude-Persian'), { recursive: true })
  writeFileSync(join(kit(), 'Claude-Persian', 'precious.txt'), 'mine')
  const result = run(['uninstall', '--yes'])
  assert.equal(result.status, 5)
  assert.ok(existsSync(join(kit(), 'Claude-Persian', 'precious.txt')))
})

test('an AppImage is unpacked and its copy patched', { skip }, () => {
  const apps = join(home, 'Applications')
  mkdirSync(apps)
  const image = join(apps, 'Claude-1.2.3-x86_64.AppImage')
  // A stand-in that unpacks itself the way a real AppImage does.
  writeFileSync(
    image,
    `#!/bin/sh\nif [ "$1" = "--appimage-extract" ]; then mkdir -p squashfs-root/resources && cp "${asarFile}" squashfs-root/resources/app.asar; fi\n`,
    { mode: 0o755 },
  )
  const empty = mkdtempSync(join(tmpdir(), 'pk img '))
  mkdirSync(join(empty, 'Applications'))
  copyFileSync(image, join(empty, 'Applications', 'Claude.AppImage'))
  writeFileSync(join(empty, 'Applications', 'Claude.AppImage'), readFileSync(image), { mode: 0o755 })

  const result = run(['install', '--yes', '--path', image], { env: { HOME: empty } })
  assert.equal(result.status, 0, result.stderr + result.stdout)
  const status = run(['status'], { env: { HOME: empty } })
  assert.match(status.stdout, /patched: true/)
  assert.match(readFileSync(join(empty, '.local', 'bin', 'claude-persian'), 'utf8'), /exec electron /)
  rmSync(empty, { recursive: true, force: true })
})

test('the copy that ships inside the persian-rtl plugin installs the same way', { skip }, () => {
  const shipped = new URL('../../plugins/persian-rtl/patcher/patch-linux.sh', import.meta.url).pathname
  const fresh = mkdtempSync(join(tmpdir(), 'pk shipped '))
  try {
    const result = spawnSync('bash', [shipped, 'install', '--yes', '--path', install, '--font', 'Inter'], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: fresh },
    })
    assert.equal(result.status, 0, result.stderr + result.stdout)
    const status = spawnSync('bash', [shipped, 'status'], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: fresh } })
    assert.match(status.stdout, /patched: true/)
    assert.match(status.stdout, /font: Inter/)

    // With the default font it embeds Vazirmatn from the plugin's own fonts folder.
    const again = spawnSync('bash', [shipped, 'install', '--yes', '--path', install], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, HOME: fresh },
    })
    assert.equal(again.status, 0, again.stderr)
    const text = readFileSync(join(fresh, '.local/share/claude-persian-kit/Claude-Persian/resources/app.asar'))
    assert.ok(text.includes('d09GMg'))
  } finally {
    rmSync(fresh, { recursive: true, force: true })
  }
})
