// Loads patcher/src/persian-rtl.js the way the installer does: as plain script
// text run inside a page (or, for the pure logic, inside a bare context).
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { JSDOM } from 'jsdom'

export const SOURCE = readFileSync(
  new URL('../src/persian-rtl.js', import.meta.url),
  'utf8',
)

// Results come out of another realm; compare them as plain data.
export const plain = value => JSON.parse(JSON.stringify(value))

export function loadCore() {
  const context = vm.createContext({})
  vm.runInContext(SOURCE, context)

  return context.__persianKit.core
}

// A page with the script loaded but not started. `schedule` never fires by
// itself: tests call flush() when they want the debounced work to happen.
export function makePage(html, { config, head = '' } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html><head>${head}</head><body>${html}</body></html>`,
    { runScripts: 'outside-only', pretendToBeVisual: true },
  )
  const win = dom.window
  win.__PERSIAN_KIT_NO_AUTOSTART__ = true
  if (config) win.__PERSIAN_KIT_CONFIG__ = config
  win.eval(SOURCE)

  const controller = win.__persianKit.createController(win, {
    schedule: () => 1,
    cancel: () => {},
  })

  return {
    win,
    doc: win.document,
    controller,
    q: selector => win.document.querySelector(selector),
    qa: selector => [...win.document.querySelectorAll(selector)],
    // MutationObserver callbacks arrive as microtasks.
    settle: () => new Promise(resolve => setTimeout(resolve, 0)),
  }
}

export const state = el => ({
  dir: el.getAttribute('dir'),
  pk: el.getAttribute('data-pk'),
})
