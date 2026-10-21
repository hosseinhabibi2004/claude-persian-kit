import assert from 'node:assert/strict'
import { createHash, randomBytes } from 'node:crypto'
import {
  chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, statSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import * as asarLib from '@electron/asar'

const require = createRequire(import.meta.url)
const asar = require('../src/asar.cjs')

const sha = buf => createHash('sha256').update(buf).digest('hex')

// Known gap: on the GitHub Windows runner this file's fixture step (@electron/asar
// packing with `unpack` and a 9 MB file) ends the Node process with 0xC0000409
// and no message. The rewriter is only used by the macOS and Linux installers, and
// Windows has no patcher in v0.1.0, so it is skipped there until it is looked into.
const skip = process.platform === 'win32' ? 'fixture packer crashes on the Windows runner (not investigated)' : false

let work
let archive
const BIG = randomBytes(9 * 1024 * 1024)

before(async () => {
  if (skip) return
  work = mkdtempSync(join(tmpdir(), 'pk asar ب '))
  const src = join(work, 'app src')
  const put = (rel, data, mode) => {
    const file = join(src, rel)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, data)
    if (mode) chmodSync(file, mode)
  }
  put('package.json', '{"name":"claude","main":".vite/build/index.pre.js"}')
  put('.vite/build/index.pre.js', '"use strict";\nconst { app } = require("electron");\napp.whenReady();\n')
  put('.vite/build/preload.js', '"use strict";\nconst { contextBridge } = require("electron");\ncontextBridge.exposeInMainWorld("x", {});\n')
  put('.vite/build/empty.js', '')
  put('assets/big.bin', BIG)
  put('assets/فایل نمونه.txt', 'سلام')
  put('bin/run.sh', '#!/bin/sh\necho hi\n', 0o755)
  put('native/addon.node', randomBytes(2048))

  archive = join(work, 'app.asar')
  await asarLib.createPackageWithOptions(src, archive, { unpack: '*.node' })
})

after(() => {
  if (work) rmSync(work, { recursive: true, force: true })
})

const out = name => join(work, name)

// Like a real app, the unpacked files sit beside the archive.
const withUnpacked = copy => cpSync(archive + '.unpacked', copy + '.unpacked', { recursive: true })

test('list and readFile see the packed files, not the unpacked ones', { skip }, () => {
  const names = asar.list(archive).map(f => f.path)
  assert.ok(names.includes('.vite/build/preload.js'))
  assert.ok(names.includes('assets/فایل نمونه.txt'))
  assert.equal(names.includes('native/addon.node'), false)
  assert.equal(asar.readFile(archive, 'assets/فایل نمونه.txt').toString('utf8'), 'سلام')
  assert.throws(() => asar.readFile(archive, 'nope.js'), /not in archive/)
})

test('an unchanged rewrite is byte for byte the same archive', { skip }, () => {
  const copy = out('same.asar')
  const result = asar.rewrite(archive, copy, () => undefined)
  assert.deepEqual(result.changed, [])
  assert.ok(readFileSync(copy).equals(readFileSync(archive)))
  assert.equal(result.headerHash, asar.currentHeaderHash(archive))
})

test('a rewrite replaces only the chosen file and matches the reference reader', { skip }, () => {
  const copy = out('patched.asar')
  const seen = []
  const result = asar.rewrite(archive, copy, (path, content) => {
    seen.push(path)
    if (path !== '.vite/build/preload.js') return undefined
    return Buffer.concat([Buffer.from('/* added */\n'), content()])
  })
  assert.deepEqual(result.changed, ['.vite/build/preload.js'])
  assert.ok(seen.includes('assets/big.bin'))

  // The reference implementation can read what we wrote.
  withUnpacked(copy)
  const dir = out('extracted')
  asarLib.extractAll(copy, dir)
  assert.ok(readFileSync(join(dir, '.vite/build/preload.js'), 'utf8').startsWith('/* added */\n"use strict"'))
  assert.equal(readFileSync(join(dir, '.vite/build/index.pre.js'), 'utf8').includes('whenReady'), true)
  assert.ok(readFileSync(join(dir, 'assets/big.bin')).equals(BIG))
  assert.equal(readFileSync(join(dir, 'assets/فایل نمونه.txt'), 'utf8'), 'سلام')
  assert.equal(readFileSync(join(dir, '.vite/build/empty.js'), 'utf8'), '')
  // Windows has no execute bit to carry over.
  if (process.platform !== 'win32') assert.equal(statSync(join(dir, 'bin/run.sh')).mode & 0o111, 0o111)

  // Unpacked stays unpacked; the integrity records and the header hash agree.
  assert.equal(asarLib.statFile(copy, 'native/addon.node').unpacked, true)
  const raw = asarLib.getRawHeader(copy)
  assert.equal(result.headerHash, sha(Buffer.from(raw.headerString)))
  assert.equal(asar.verify(copy), result.headerHash)
})

test('large replacements get one integrity block per 4 MiB', { skip }, () => {
  const copy = out('big.asar')
  const bigger = randomBytes(9 * 1024 * 1024 + 5)
  asar.rewrite(archive, copy, path => (path === 'assets/big.bin' ? bigger : undefined))
  const { header } = asarLib.getRawHeader(copy)
  const entry = header.files.assets.files['big.bin']
  assert.equal(entry.integrity.blocks.length, 3)
  assert.equal(entry.integrity.hash, sha(bigger))
  asar.verify(copy)
  withUnpacked(copy)
  const dir = out('extracted-big')
  asarLib.extractAll(copy, dir)
  assert.ok(readFileSync(join(dir, 'assets/big.bin')).equals(bigger))
})

test('a failing transform leaves no output behind', { skip }, () => {
  const copy = out('failed.asar')
  assert.throws(() => asar.rewrite(archive, copy, () => {
    throw new Error('boom')
  }), /boom/)
  assert.equal(existsSync(copy), false)

  assert.throws(() => asar.rewrite(archive, out('bad.asar'), () => 'text'), /Buffer or undefined/)
  assert.equal(existsSync(out('bad.asar')), false)
})

test('an existing output is never overwritten', { skip }, () => {
  const copy = out('exists.asar')
  writeFileSync(copy, 'keep')
  assert.throws(() => asar.rewrite(archive, copy, () => undefined), /EEXIST/)
  assert.equal(readFileSync(copy, 'utf8'), 'keep')
})

test('verify notices a changed byte', { skip }, () => {
  const copy = out('tampered.asar')
  asar.rewrite(archive, copy, () => undefined)
  const bytes = readFileSync(copy)
  bytes[bytes.length - 1] ^= 0xff
  writeFileSync(copy, bytes)
  assert.throws(() => asar.verify(copy))
})

test('things that are not archives are refused', { skip }, () => {
  const junk = out('junk.asar')
  writeFileSync(junk, 'this is not an archive at all, not even close')
  assert.throws(() => asar.list(junk), /invalid ASAR header/)
  writeFileSync(junk, 'tiny')
  assert.throws(() => asar.list(junk), /not an ASAR archive/)
})
