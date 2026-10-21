// An installed plugin receives only its own folder, so the patcher and the font
// that live at the repo root are copied into the plugins that use them:
//
//   patcher/ (without test/)  ->  plugins/persian-rtl/patcher/
//   fonts/                    ->  plugins/persian-rtl/fonts/ and plugins/persian-fonts/fonts/
//
// `node scripts/sync-assets.mjs`          copies
// `node scripts/sync-assets.mjs --check`  fails if a copy differs (used by CI)
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ROOT } from './plugins.mjs'

const COPIES = [
  { from: 'patcher', to: 'plugins/persian-rtl/patcher', skip: ['test'] },
  { from: 'fonts', to: 'plugins/persian-rtl/fonts', skip: [] },
  { from: 'fonts', to: 'plugins/persian-fonts/fonts', skip: [] },
]

function filesOf(dir, skip, base = dir) {
  if (!existsSync(dir)) return []

  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name)
    if (base === dir && skip.includes(entry.name)) return []

    return entry.isDirectory() ? filesOf(full, skip, base) : [relative(base, full).split('\\').join('/')]
  })
}

const isCheck = process.argv.includes('--check')
let drift = 0

for (const { from, to, skip } of COPIES) {
  const src = join(ROOT, from)
  const dst = join(ROOT, to)
  const wanted = filesOf(src, skip)

  if (isCheck) {
    const have = filesOf(dst, [])
    const missing = wanted.filter(f => !have.includes(f))
    const extra = have.filter(f => !wanted.includes(f))
    const changed = wanted.filter(f => have.includes(f) && !readFileSync(join(src, f)).equals(readFileSync(join(dst, f))))
    for (const f of missing) console.error(`missing in ${to}: ${f}`)
    for (const f of extra) console.error(`not in ${from}: ${to}/${f}`)
    for (const f of changed) console.error(`differs: ${to}/${f}`)
    drift += missing.length + extra.length + changed.length
  } else {
    rmSync(dst, { recursive: true, force: true })
    for (const f of wanted) {
      mkdirSync(join(dst, f, '..'), { recursive: true })
      cpSync(join(src, f), join(dst, f))
      if (f.endsWith('.sh') && process.platform !== 'win32') chmodSync(join(dst, f), statSync(join(src, f)).mode | 0o111)
    }
    console.log(`${from} -> ${to} (${wanted.length} files)`)
  }
}

if (isCheck) {
  if (drift > 0) {
    console.error(`\n${drift} difference(s). Run: npm run sync`)
    process.exit(1)
  }
  console.log('copies are in sync')
}
