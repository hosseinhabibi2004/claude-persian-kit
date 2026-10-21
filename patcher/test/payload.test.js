import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import vm from 'node:vm'
import { test } from 'node:test'

import { JSDOM } from 'jsdom'

const require = createRequire(import.meta.url)
const payload = require('../src/payload.cjs')

const ORIGINAL = 'const answer = 42;\nconsole.log(answer);\n'

test('the payload compiles and carries the config before the script', () => {
  const text = payload.buildPayload()
  new vm.Script(text)
  assert.ok(text.indexOf('PERSIAN-KIT:CONFIG') < text.indexOf('PERSIAN-KIT:START'))
  assert.ok(text.trimEnd().endsWith('/* PERSIAN-KIT:END */'))
})

test('the default font is Vazirmatn, embedded as woff2', () => {
  const { font } = payload.buildConfig()
  assert.equal(font.family, 'Vazirmatn')
  assert.equal(font.source.kind, 'data')
  assert.equal(font.source.format, 'woff2')
  // "wOF2" is the woff2 magic number.
  assert.ok(font.source.base64.startsWith('d09GMg'))
})

test('options: installed font, no font, no rtl, another file', () => {
  assert.deepEqual(payload.buildConfig({ fontLocal: ' B Nazanin ' }).font, {
    enabled: true,
    family: 'B Nazanin',
    source: { kind: 'local', name: 'B Nazanin' },
  })
  assert.deepEqual(payload.buildConfig({ font: false }).font, {
    enabled: false,
    family: '',
    source: null,
  })
  assert.equal(payload.buildConfig({ rtl: false }).rtl, false)
  assert.equal(payload.buildConfig({}).rtl, true)
})

test('bad font names and files are refused with a clear message', () => {
  for (const name of ['', 'A"; alert(1); "', 'a\nb', '<x>', 'x'.repeat(81)]) {
    assert.throws(() => payload.buildConfig({ fontLocal: name }), /persian-kit: font name/)
  }
  assert.throws(() => payload.buildConfig({ fontFile: '/nope/missing.woff2' }), /cannot read the font file/)
  assert.throws(() => payload.buildConfig({ fontFile: '/nope/font.exe' }), /must be \.woff2/)
})

test('Persian font names are accepted', () => {
  assert.equal(payload.buildConfig({ fontLocal: 'ب نازنین' }).font.family, 'ب نازنین')
})

test('inject then strip gives back the original file exactly', () => {
  const text = payload.buildPayload({ font: false })
  const patched = payload.injectPayload(ORIGINAL, text)
  assert.ok(payload.hasPayload(patched))
  assert.equal(payload.hasPayload(ORIGINAL), false)
  assert.equal(payload.stripPayload(patched), ORIGINAL)
})

test('injecting twice, or over an older payload, leaves one payload', () => {
  const first = payload.injectPayload(ORIGINAL, payload.buildPayload({ font: false }))
  const second = payload.injectPayload(first, payload.buildPayload({ fontLocal: 'Inter' }))
  assert.equal(second.split('PERSIAN-KIT:START').length, 2)
  assert.equal(payload.stripPayload(second), ORIGINAL)
  assert.match(second, /"name":"Inter"/)
})

test('"use strict" and a shebang stay first', () => {
  const text = payload.buildPayload({ font: false })

  const strict = payload.injectPayload('"use strict";\nrun();\n', text)
  assert.ok(strict.startsWith('"use strict";\n'))
  assert.equal(payload.stripPayload(strict), '"use strict";\nrun();\n')

  const shebang = payload.injectPayload("#!/usr/bin/env node\n'use strict'\nrun()\n", text)
  assert.ok(shebang.startsWith("#!/usr/bin/env node\n'use strict'\n"))
  assert.equal(payload.stripPayload(shebang), "#!/usr/bin/env node\n'use strict'\nrun()\n")
  new vm.Script(strict)
})

test('Windows line endings survive', () => {
  const crlf = 'a();\r\nb();\r\n'
  const patched = payload.injectPayload(crlf, payload.buildPayload({ font: false }))
  assert.equal(payload.stripPayload(patched), crlf)
})

test('the command line writes the same payload to a file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pk payload ب '))
  try {
    const out = join(dir, 'payload.js')
    const result = spawnSync(
      process.execPath,
      [payload.SCRIPT_FILE.replace('persian-rtl.js', 'payload.cjs'), 'build', '--out', out, '--no-font'],
      { encoding: 'utf8' },
    )
    assert.equal(result.status, 0, result.stderr)
    assert.equal(readFileSync(out, 'utf8'), payload.buildPayload({ font: false }))

    const bad = spawnSync(
      process.execPath,
      [payload.SCRIPT_FILE.replace('persian-rtl.js', 'payload.cjs'), 'build', '--bogus'],
      { encoding: 'utf8' },
    )
    assert.notEqual(bad.status, 0)
    assert.match(bad.stderr, /unknown option/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('end to end: a patched file runs in a page, fixes it and registers the font', async () => {
  const dom = new JSDOM('<!doctype html><body style=\'font-family:"Inter"\'><p>سلام دنیا</p></body>', {
    runScripts: 'outside-only',
  })
  const win = dom.window
  const faces = []
  win.FontFace = class {
    constructor(family, src, descriptors) {
      Object.assign(this, { family, src, descriptors })
      faces.push(this)
    }
    load() {
      return Promise.resolve()
    }
  }
  win.document.fonts = { add() {} }

  // The script starts once the page has been parsed, as in the real app.
  await new Promise(resolve => win.addEventListener('load', resolve))

  const patched = payload.injectPayload(ORIGINAL, payload.buildPayload())
  win.eval(patched)

  assert.equal(win.document.querySelector('p').getAttribute('dir'), 'rtl')
  assert.equal(faces[0].family, 'Inter')
  assert.ok(faces[0].src.includes('base64,d09GMg'))

  // Injecting a second file into the same page changes nothing.
  win.eval(patched)
  assert.equal(win.document.querySelectorAll('#persian-kit-style').length, 1)
})

test('writing a patched file to a path with spaces and Persian letters works', () => {
  const dir = mkdtempSync(join(tmpdir(), 'پوشه ی آزمایش '))
  try {
    const file = join(dir, 'فایل نمونه.js')
    writeFileSync(file, ORIGINAL)
    const patched = payload.injectPayload(readFileSync(file, 'utf8'), payload.buildPayload({ font: false }))
    writeFileSync(file, patched)
    assert.equal(payload.stripPayload(readFileSync(file, 'utf8')), ORIGINAL)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
