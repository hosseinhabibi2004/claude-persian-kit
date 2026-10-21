// `claude plugin test` on every plugin that has *.test.ts files.
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { claude } from './claude.mjs'
import { pluginDirs } from './plugins.mjs'

let failed = 0
for (const dir of pluginDirs()) {
  const tests = join(dir, 'tests')
  const hasTests =
    existsSync(tests) && readdirSync(tests).some(name => /\.test\.tsx?$/.test(name))
  if (!hasTests) continue

  console.log(`\n== test ${dir}`)
  if (claude(['plugin', 'test', dir]) !== 0) failed += 1
}

if (failed > 0) {
  console.error(`\n${failed} plugin test run(s) failed`)
  process.exit(1)
}
