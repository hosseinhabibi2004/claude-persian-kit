import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SOURCE, makePage, state } from './helpers.js'

const run = (html, options) => {
  const page = makePage(html, options)
  page.controller.start()

  return page
}

test('paragraphs: Persian is rtl, English ltr, numbers untouched', () => {
  const { qa } = run('<p>سلام دنیا</p><p>Hello world</p><p>12345</p><p>۱۲۳</p>')
  const [fa, en, digits, persianDigits] = qa('p')
  assert.deepEqual(state(fa), { dir: 'rtl', pk: 'rtl' })
  assert.deepEqual(state(en), { dir: 'ltr', pk: 'ltr' })
  assert.deepEqual(state(digits), { dir: null, pk: null })
  assert.deepEqual(state(persianDigits), { dir: null, pk: null })
})

test('a Persian line that starts with English, a file name or inline code is rtl', () => {
  const { qa } = run(
    '<p>React یک کتابخانه است</p>' +
      '<p><code>server.js</code> را اجرا کنید</p>' +
      '<p>https://example.com/a/b را باز کنید</p>',
  )
  assert.deepEqual(qa('p').map(p => p.getAttribute('dir')), ['rtl', 'rtl', 'rtl'])
})

test('code blocks and inline code are never touched', () => {
  const { q } = run(
    '<pre><code>const سلام = "ok"</code></pre><p>متن <code>x</code> است</p>',
  )
  assert.equal(q('pre').hasAttribute('data-pk'), false)
  assert.equal(q('pre code').hasAttribute('data-pk'), false)
  assert.equal(q('p code').hasAttribute('data-pk'), false)
  assert.equal(q('p').getAttribute('dir'), 'rtl')
})

test('rendered math does not decide anything and stays untouched', () => {
  const { q } = run(
    '<p><span class="katex">x^2 + y^2 = z^2 and more words here</span></p>' +
      '<p>مقدار <span class="katex">a b c d e f</span> برابر است</p>',
  )
  const [onlyMath, withMath] = [...q('body').querySelectorAll('p')]
  assert.equal(onlyMath.hasAttribute('data-pk'), false)
  assert.equal(withMath.getAttribute('dir'), 'rtl')
  assert.equal(q('.katex').hasAttribute('data-pk'), false)
})

test('the style sheet makes code and math left-to-right islands', () => {
  const { q } = run('<p>سلام</p>')
  const css = q('#persian-kit-style').textContent
  assert.match(css, /pre,code,kbd,samp,math,\.katex,\.katex-display\{direction:ltr;unicode-bidi:isolate\}/)
})

test('lists follow the majority, a long opposite item keeps its own side', () => {
  const { q, qa } = run(
    '<ul>' +
      '<li>خرید نان</li><li>پخت غذا برای شام</li><li>Install the package now</li><li>تمیز کردن خانه</li>' +
      '</ul>',
  )
  assert.equal(q('ul').getAttribute('dir'), 'rtl')
  const items = qa('li')
  assert.equal(items[0].getAttribute('data-pk'), null)
  assert.equal(items[2].getAttribute('dir'), 'ltr')
})

test('a short English item stays with its Persian list', () => {
  const { q, qa } = run('<ol><li>سلام دنیا</li><li>بله</li><li>Yes</li></ol>')
  assert.equal(q('ol').getAttribute('dir'), 'rtl')
  assert.equal(qa('li')[2].getAttribute('data-pk'), null)
})

test('loose list items (li > p) still decide the list', () => {
  const { q } = run('<ul><li><p>سلام دنیا</p></li><li><p>خداحافظ دوست</p></li></ul>')
  assert.equal(q('ul').getAttribute('dir'), 'rtl')
  assert.equal(q('li p').getAttribute('dir'), 'rtl')
})

test('tables: majority sets the table, each cell can differ', () => {
  const { q } = run(
    '<table><thead><tr><th>Name</th><th>توضیح</th></tr></thead>' +
      '<tbody><tr><td>نام</td><td>The quick brown fox jumps</td></tr>' +
      '<tr><td>سن</td><td>۱۲</td></tr></tbody></table>',
  )
  assert.equal(q('table').getAttribute('dir'), 'rtl')
  const cells = [...q('body').querySelectorAll('td, th')]
  assert.equal(cells[0].hasAttribute('data-pk'), true) // "Name": ltr cell in rtl table
  assert.equal(cells[0].getAttribute('dir'), 'ltr')
  assert.equal(cells[2].hasAttribute('data-pk'), false) // same as the table
  assert.equal(cells[3].getAttribute('dir'), 'ltr')
  assert.equal(cells[5].hasAttribute('data-pk'), false) // number: neutral
})

test('native RTL is left alone; a native ltr is not', () => {
  const { qa } = run(
    '<p dir="rtl">English words inside a native rtl block</p>' +
      '<p dir="auto">سلام دنیا</p>' +
      '<p dir="ltr">سلام دنیا</p>',
  )
  const [rtl, auto, ltr] = qa('p')
  assert.deepEqual(state(rtl), { dir: 'rtl', pk: null })
  assert.deepEqual(state(auto), { dir: 'auto', pk: null })
  assert.deepEqual(state(ltr), { dir: 'rtl', pk: 'rtl' })
})

test('a dir the app sets later is never removed by us', () => {
  const { q, controller } = run('<p>سلام دنیا</p>')
  const p = q('p')
  assert.equal(p.getAttribute('dir'), 'rtl')

  p.setAttribute('dir', 'auto') // the app takes over
  p.textContent = 'سلام دوباره'
  controller.scan(p)
  assert.deepEqual(state(p), { dir: 'auto', pk: null })
})

test('a block that loses all its letters is released', () => {
  const { q, controller } = run('<p>سلام دنیا</p>')
  const p = q('p')
  p.textContent = '...'
  controller.scan(p)
  assert.deepEqual(state(p), { dir: null, pk: null })
})

test('multi-line blocks with both directions are mixed, not forced', () => {
  const { q } = run(
    '<p>سلام دنیا<br>Hello there my friend<br>خداحافظ</p>' +
      '<div>یک روز بخیر دوست من\nGood morning to you all</div>',
  )
  const p = q('p')
  assert.deepEqual(state(p), { dir: null, pk: 'mixed' })
  assert.deepEqual(state(q('div')), { dir: null, pk: 'mixed' })
})

test('plain text blocks need enough words and stay out of navigation', () => {
  const { q } = run(
    '<div id="msg">این یک پیام ساده است</div>' +
      '<div id="short">سلام</div>' +
      '<nav><div id="nav">این یک گزینه ی منو است</div></nav>' +
      '<button><div id="btn">این یک دکمه است ببین</div></button>',
  )
  assert.equal(q('#msg').getAttribute('dir'), 'rtl')
  assert.equal(q('#short').hasAttribute('data-pk'), false)
  assert.equal(q('#nav').hasAttribute('data-pk'), false)
  assert.equal(q('#btn').hasAttribute('data-pk'), false)
})

test('the input box follows its own text; a native one is skipped', () => {
  const { q } = run(
    '<div id="editor" contenteditable="true"><p>سلام</p></div>' +
      '<textarea id="area"></textarea>' +
      '<div id="native" contenteditable="true" dir="rtl"></div>',
  )
  assert.equal(q('#editor').hasAttribute('data-pk-input'), true)
  assert.equal(q('#editor p').hasAttribute('data-pk'), false)
  assert.equal(q('#area').getAttribute('dir'), 'auto')
  assert.equal(q('#native').hasAttribute('data-pk-input'), false)
})

test('a second pass changes nothing', async () => {
  const page = run(
    '<p>سلام دنیا</p><ul><li>خرید نان</li><li>Install it now please</li></ul>' +
      '<table><tr><td>نام</td><td>Name here</td></tr></table>' +
      '<div contenteditable="true"></div>',
  )
  const records = []
  const observer = new page.win.MutationObserver(list => records.push(...list))
  observer.observe(page.doc.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
    characterData: true,
  })

  page.controller.scan(page.doc.body)
  page.controller.scan(page.doc.body)
  await page.settle()
  observer.disconnect()

  assert.equal(records.length, 0)
})

test('injecting the script twice keeps one style sheet and one api', () => {
  const page = run('<p>سلام</p>')
  const api = page.win.__persianKit
  page.win.eval(SOURCE)
  assert.equal(page.win.__persianKit, api)
  assert.equal(page.qa('#persian-kit-style').length, 1)
})

test('streaming: the direction follows the text as it arrives', async () => {
  const page = run('<p id="m"></p>')
  const p = page.q('#m')
  const text = page.doc.createTextNode('')
  p.appendChild(text)

  const steps = [
    ['Hel', 'ltr'],
    ['Hello wor', 'ltr'],
    ['Hello world سلام', 'ltr'],
    ['Hello world سلام دنیا خوبی', 'rtl'],
  ]
  for (const [value, expected] of steps) {
    text.data = value
    await page.settle()
    page.controller.flush()
    assert.equal(p.getAttribute('dir'), expected, value)
  }
})

test('streaming: new blocks and new list items are picked up', async () => {
  const page = run('<div id="root"></div>')
  const root = page.q('#root')

  const list = page.doc.createElement('ul')
  root.appendChild(list)
  for (const label of ['خرید نان', 'پخت غذا', 'Install it now please']) {
    const li = page.doc.createElement('li')
    li.textContent = label
    list.appendChild(li)
    await page.settle()
    page.controller.flush()
  }

  assert.equal(list.getAttribute('dir'), 'rtl')
  assert.equal(list.children[2].getAttribute('dir'), 'ltr')
})

test('turning rtl off in the config leaves the page alone', () => {
  const { q } = run('<p>سلام دنیا</p>', { config: { rtl: false } })
  assert.equal(q('p').hasAttribute('data-pk'), false)
})

// --- fonts -------------------------------------------------------------------

function withFontApi(page) {
  const faces = []
  page.win.FontFace = class {
    constructor(family, src, descriptors) {
      this.family = family
      this.src = src
      this.descriptors = descriptors
      faces.push(this)
    }
    load() {
      return Promise.resolve(this)
    }
  }
  page.doc.fonts = { add: () => {} }

  return faces
}

function runWithFonts(html, config) {
  const page = makePage(html, { config })
  const faces = withFontApi(page)
  page.controller.start()

  return { page, faces }
}

test('the font is added under the app\'s own families, never for code', () => {
  const { faces } = runWithFonts(
    '<body style=\'font-family:"Anthropic Sans", system-ui, sans-serif\'>' +
      '<p>سلام</p><pre style=\'font-family:"Fira Code", monospace\'>x</pre>',
    { font: { source: { kind: 'data', format: 'woff2', base64: 'AAAA' } } },
  )
  const body = faces.filter(face => face.family === 'Anthropic Sans')
  assert.equal(body.length, 1)
  assert.equal(body[0].descriptors.unicodeRange.startsWith('U+0600-06FF'), true)
  assert.match(body[0].src, /^url\(data:font\/woff2;base64,AAAA\)/)
  assert.equal(faces.some(face => face.family === 'Fira Code'), false)
  assert.equal(faces.some(face => /system-ui|sans-serif/.test(face.family)), false)
})

test('an installed font is used through local()', () => {
  const page = makePage('<p style=\'font-family:"Inter"\'>سلام</p>', {
    config: { font: { source: { kind: 'local', name: 'B Nazanin' } } },
  })
  const faces = withFontApi(page)
  page.controller.start()

  const inter = faces.filter(face => face.family === 'Inter')
  assert.equal(inter.length, 2)
  assert.match(inter[0].src, /local\("B Nazanin"\)/)
})

test('no font source, or fonts switched off: nothing is registered', () => {
  const html = '<p style=\'font-family:"Inter"\'>سلام</p>'
  assert.equal(runWithFonts(html, {}).faces.length, 0)
  assert.equal(
    runWithFonts(html, {
      font: { enabled: false, source: { kind: 'local', name: 'X' } },
    }).faces.length,
    0,
  )
})

test('a family is registered once, however often the page changes', async () => {
  const { page, faces } = runWithFonts('<p style=\'font-family:"Inter"\'>سلام</p>', {
    font: { source: { kind: 'local', name: 'X' } },
  })
  const before = faces.length
  const extra = page.doc.createElement('p')
  extra.setAttribute('style', 'font-family:"Inter"')
  extra.textContent = 'بیشتر'
  page.doc.body.appendChild(extra)
  await page.settle()
  page.controller.flush()
  assert.equal(faces.length, before)
})
