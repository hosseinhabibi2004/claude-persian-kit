// `claude plugin validate` on the marketplace and on every plugin, warnings fatal.
import { claude } from './claude.mjs'
import { ROOT, pluginDirs } from './plugins.mjs'

let failed = 0
for (const target of [ROOT, ...pluginDirs()]) {
  console.log(`\n== validate ${target}`)
  if (claude(['plugin', 'validate', target, '--strict']) !== 0) failed += 1
}

if (failed > 0) {
  console.error(`\n${failed} validation(s) failed`)
  process.exit(1)
}
