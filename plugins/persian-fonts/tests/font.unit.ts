import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DEFAULT_FONT, cleanName, currentFont, describeFont, isFontName } from '../hooks/font.ts'

test('the default is Vazirmatn', () => {
  assert.equal(DEFAULT_FONT, 'Vazirmatn')
  assert.equal(currentFont({}), 'Vazirmatn')
  assert.equal(currentFont({ font: '' }), 'Vazirmatn')
  assert.equal(currentFont({ font: 42 }), 'Vazirmatn')
})

test('a chosen installed font is used, trimmed; a bad value falls back', () => {
  assert.equal(currentFont({ font: '  B Nazanin ' }), 'B Nazanin')
  assert.equal(currentFont({ font: 'ب نازنین' }), 'ب نازنین')
  assert.equal(currentFont({ font: 'a"; rm -rf /' }), 'Vazirmatn')
})

test('font names: plain names only, quotes around one are dropped', () => {
  for (const ok of ['Vazirmatn', 'Noto Naskh Arabic', 'Sahel-2', 'ب نازنین']) assert.equal(isFontName(ok), true, ok)
  for (const bad of ['', '   ', 'a;b', 'a"b', '$(id)', '<x>', 'x'.repeat(81)]) assert.equal(isFontName(bad), false, bad)
  assert.equal(cleanName(' "Noto Naskh Arabic" '), 'Noto Naskh Arabic')
  assert.equal(cleanName("'Sahel'"), 'Sahel')
})

test('the description says what the font touches and how to apply it', () => {
  const built = describeFont('Vazirmatn')
  assert.match(built, /bundled/)
  assert.match(built, /Arabic-script characters only/)
  assert.match(built, /\/persian-patch font/)
  assert.match(describeFont('B Nazanin'), /must be installed/)
})
