import assert from 'node:assert/strict'
import { test } from 'node:test'

import { loadCore, plain } from './helpers.js'

const core = loadCore()
const dirOf = text => core.decideText(text).dir

test('Persian, Arabic and Hebrew text is RTL, English is LTR', () => {
  assert.equal(dirOf('سلام، حال شما چطور است؟'), 'rtl')
  assert.equal(dirOf('مرحبا بكم في العالم'), 'rtl')
  assert.equal(dirOf('שלום עולם'), 'rtl')
  assert.equal(dirOf('Hello, how are you today?'), 'ltr')
})

test('nothing to decide gives null: empty, digits, punctuation, symbols', () => {
  for (const text of ['', '   ', '1234', '۱۲۳۴', '... !!!', '— • —', '$$']) {
    assert.equal(dirOf(text), null, JSON.stringify(text))
  }
})

test('mixed lines go to the side with more words', () => {
  assert.equal(dirOf('React یک کتابخانه برای ساخت رابط کاربری است'), 'rtl')
  assert.equal(dirOf('از React و Next.js و Tailwind استفاده کن'), 'rtl')
  assert.equal(dirOf('I think the word سلام means hello'), 'ltr')
  assert.equal(dirOf('Open the file and run it, بعد'), 'ltr')
})

test('a tie is decided by the first strong word', () => {
  assert.equal(dirOf('Hello سلام'), 'ltr')
  assert.equal(dirOf('سلام Hello'), 'rtl')
})

test('a Persian word with a half-space (ZWNJ) is one word', () => {
  const zwnj = '‌'
  const result = core.decideText(`می${zwnj}خواهم کتاب${zwnj}ها`)
  assert.equal(result.dir, 'rtl')
  assert.equal(result.words, 2)
})

test('Persian and Arabic digits never decide a direction', () => {
  assert.equal(dirOf('۱۲۳ 456'), null)
  assert.equal(dirOf('۱۲۳ کتاب'), 'rtl')
})

test('Arabic yeh/kaf and Persian yeh/kaf are both RTL letters', () => {
  assert.equal(dirOf('يك'), 'rtl')
  assert.equal(dirOf('یک'), 'rtl')
})

test('code, links and file names do not sway a Persian sentence', () => {
  const sentence = 'برای نصب `npm install --global typescript` را اجرا کنید'
  assert.equal(core.decideText(sentence).ltr, 0)

  assert.equal(dirOf('server.js را باز کن'), 'rtl')
  assert.equal(dirOf('https://example.com/docs/getting-started سلام'), 'rtl')
  assert.equal(dirOf('/usr/local/bin/node src/index.ts'), null)
  assert.equal(dirOf('mail me at a.b@example.com'), 'ltr')
})

test('fenced code is ignored', () => {
  const text = 'سلام\n```js\nconst name = "Hossein"; console.log(name)\n```'
  const result = core.decideText(text)
  assert.equal(result.dir, 'rtl')
  assert.equal(result.ltr, 0)
})

test('math is found: display, bracket, inline and single-letter', () => {
  const slice = text => plain(core.findMath(text)).map(([a, b]) => text.slice(a, b))
  assert.deepEqual(slice('الف $$x^2 + y^2$$ ب'), ['$$x^2 + y^2$$'])
  assert.deepEqual(slice('الف \\[a=b\\] ب \\(c+d\\)'), ['\\[a=b\\]', '\\(c+d\\)'])
  assert.deepEqual(slice('مقدار $\\lambda = 3$ است'), ['$\\lambda = 3$'])
  assert.deepEqual(slice('فرض کنید $x$ یک عدد باشد'), ['$x$'])
})

test('currency is not math, and cannot steal a later closing $', () => {
  const slice = text => plain(core.findMath(text)).map(([a, b]) => text.slice(a, b))
  assert.deepEqual(slice('قیمت $5 تا $20 است'), [])
  assert.deepEqual(slice('costs $5 and $10 today'), [])
  assert.deepEqual(slice('قیمت 5$ و 10$ است'), [])
  assert.deepEqual(slice('قیمت $5 است و $x^2$ مثال'), ['$x^2$'])
  assert.deepEqual(slice('escaped \\$a^2\\$ stays'), [])
})

test('math does not count as English words', () => {
  const result = core.decideText('مقدار $\\lambda = 3$ و $$\\frac{a}{b}$$ برابر است')
  assert.equal(result.dir, 'rtl')
  assert.equal(result.ltr, 0)
})

test('stripNoise keeps line breaks so lines can still be told apart', () => {
  const out = core.stripNoise('یک\n`code`\nدو')
  assert.equal(out.split('\n').length, 3)
})

test('decideLines: a block whose lines disagree is mixed', () => {
  const mixed = core.decideLines('سلام دنیا\nHello world today\nخداحافظ')
  assert.equal(mixed.isMixed, true)
  assert.equal(mixed.dir, 'rtl')

  assert.equal(core.decideLines('سلام\nخداحافظ').isMixed, false)
  assert.equal(core.decideLines('Hello\nWorld').isMixed, false)
  assert.equal(core.decideLines('سلام\n\n۱۲۳').isMixed, false)
})

test('decideGroup: item majority, then words, then first', () => {
  const rtl = (words = 1) => ({ dir: 'rtl', words })
  const ltr = (words = 1) => ({ dir: 'ltr', words })
  assert.equal(core.decideGroup([ltr(), rtl(), rtl()]), 'rtl')
  assert.equal(core.decideGroup([ltr(9), rtl(2)]), 'ltr')
  assert.equal(core.decideGroup([ltr(2), rtl(5)]), 'rtl')
  assert.equal(core.decideGroup([ltr(3), rtl(3)]), 'ltr')
  assert.equal(core.decideGroup([{ dir: null }, { dir: null }]), null)
  assert.equal(core.decideGroup([]), null)
})

test('firstStrong honours direction marks over letters', () => {
  assert.equal(core.firstStrong('‏abc'), 'rtl')
  assert.equal(core.firstStrong('‎سلام'), 'ltr')
  assert.equal(core.firstStrong('12 - سلام'), 'rtl')
  assert.equal(core.firstStrong('12 - '), null)
})

test('font families: named app families only, never code or generic ones', () => {
  const families = core.pickFamilies(
    ['"Anthropic Sans", system-ui, sans-serif', "'Inter', Arial", 'ui-sans-serif, sans-serif'],
    ['"JetBrains Mono", ui-monospace, monospace', 'Inter'],
  )
  assert.deepEqual(plain(families), ['Anthropic Sans', 'Arial'])
})

test('font faces: embedded font covers all weights; local font gets two', () => {
  const data = core.fontFaces({
    source: { kind: 'data', format: 'woff2', base64: 'AAAA' },
  })
  assert.equal(data.length, 1)
  assert.match(data[0].src, /^url\(data:font\/woff2;base64,AAAA\) format\("woff2"\)$/)
  assert.equal(data[0].weight, '100 900')

  const local = core.fontFaces({ source: { kind: 'local', name: 'B Nazanin' } })
  assert.equal(local.length, 2)
  assert.match(local[0].src, /local\("B Nazanin"\)/)
  assert.match(local[1].src, /local\("B Nazanin Bold"\)/)

  assert.deepEqual(plain(core.fontFaces({ source: null })), [])
  assert.deepEqual(plain(core.fontFaces(undefined)), [])
})

test('a font name cannot break out of its CSS string', () => {
  const [face] = core.fontFaces({ source: { kind: 'local', name: 'A") ; x{"' } })
  // Quotes are dropped from the name, so both local() strings stay closed.
  assert.equal(face.src.split('"').length, 5)
})

test('the font only covers Arabic-script characters', () => {
  assert.match(core.ARABIC_SCRIPT_RANGE, /U\+0600-06FF/)
  assert.doesNotMatch(core.ARABIC_SCRIPT_RANGE, /U\+0000|U\+0020|U\+0041|U\+00FF/)
})

test('css keeps code and math left-to-right', () => {
  const css = core.buildCss()
  assert.match(css, /pre,code,kbd,samp/)
  assert.match(css, /\.katex/)
  assert.match(css, /unicode-bidi:isolate/)
})
