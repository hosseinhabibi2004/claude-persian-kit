import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULTS,
  buildSection,
  describe as describeSettings,
  parseArgs,
  resolveSettings,
} from '../hooks/rules.ts'

const ARABIC_YEH = 'ي'
const ARABIC_KAF = 'ك'

test('defaults: on, ZWNJ and ی/ک on, digits and quotes off', () => {
  assert.deepEqual(resolveSettings({}), DEFAULTS)
  assert.equal(DEFAULTS.enabled, true)
  assert.equal(DEFAULTS.digits, false)
})

test('resolveSettings reads booleans and ignores everything else', () => {
  const settings = resolveSettings({ digits: true, zwnj: 'no', quotes: 1 })
  assert.equal(settings.digits, true)
  assert.equal(settings.zwnj, true)
  assert.equal(settings.quotes, false)
})

test('the section is absent when the feature is off', () => {
  assert.equal(buildSection({ ...DEFAULTS, enabled: false }), undefined)
})

test('the default section asks for ZWNJ and ی/ک, and keeps Latin digits', () => {
  const text = buildSection(DEFAULTS) ?? ''
  assert.match(text, /ZWNJ/)
  assert.match(text, /U\+06CC/)
  assert.match(text, /do not convert to Persian digits/)
  assert.doesNotMatch(text, /guillemets/)
})

test('each option adds or removes its own rule', () => {
  const on = buildSection({ ...DEFAULTS, digits: true, quotes: true }) ?? ''
  assert.match(on, /۰۱۲۳۴۵۶۷۸۹/)
  assert.match(on, /guillemets «like this»/)

  const off = buildSection({ ...DEFAULTS, zwnj: false, yehKaf: false }) ?? ''
  assert.doesNotMatch(off, /U\+200C/)
  assert.doesNotMatch(off, /U\+06CC/)
})

test('the section is written with Persian ی/ک, never Arabic ي/ك', () => {
  const text = buildSection({ ...DEFAULTS, digits: true, quotes: true }) ?? ''
  // Only the one rule line that forbids them may name the Arabic letters.
  assert.equal(text.includes(ARABIC_YEH), true)
  const withoutRule = text.replace(/Never Arabic[^\n]*/, '')
  assert.equal(withoutRule.includes(ARABIC_YEH), false)
  assert.equal(withoutRule.includes(ARABIC_KAF), false)
})

test('parseArgs: status, toggles, sets and errors', () => {
  assert.deepEqual(parseArgs(''), { kind: 'status' })
  assert.deepEqual(parseArgs('  Status '), { kind: 'status' })
  assert.deepEqual(parseArgs('off'), { kind: 'set', field: 'enabled', value: false })
  assert.deepEqual(parseArgs('digits'), { kind: 'toggle', field: 'digits' })
  assert.deepEqual(parseArgs('quotes ON'), { kind: 'set', field: 'quotes', value: true })
  assert.deepEqual(parseArgs('yeh off'), { kind: 'set', field: 'yehKaf', value: false })
  assert.deepEqual(parseArgs('halfspace خاموش'), { kind: 'set', field: 'zwnj', value: false })
  assert.deepEqual(parseArgs('bogus'), { kind: 'error', word: 'bogus' })
  assert.deepEqual(parseArgs('digits maybe'), { kind: 'error', word: 'maybe' })
})

test('describe lists every option', () => {
  const text = describeSettings(DEFAULTS)
  assert.equal(text.split('\n').length, 6)
  assert.match(text, /^● قوانین/)
})
