// Type-checks the mods. Uses Claude Code's own declaration file when it is at
// typings/claude-code/index.d.ts (see types/claude-code-stub.d.ts for how to get
// it); otherwise the small stub in this repository.
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { ROOT } from './plugins.mjs'

const real = join(ROOT, 'typings', 'claude-code', 'index.d.ts')
const stubDir = join(ROOT, 'typings', 'stub')
const useStub = !existsSync(real)

if (useStub) {
  mkdirSync(stubDir, { recursive: true })
  copyFileSync(join(ROOT, 'types', 'claude-code-stub.d.ts'), join(stubDir, 'index.d.ts'))
  console.log('typecheck: using the stub in types/claude-code-stub.d.ts (no typings/claude-code/index.d.ts)')
} else {
  console.log('typecheck: using Claude Code\'s own declaration file')
}

const tsc = join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc')
// The mods against the plugin API, then the pure logic and its unit tests against Node.
const configs = ['tsconfig.json', 'tsconfig.node.json']
let status = 0
for (const config of configs) {
  const result = spawnSync(process.execPath, [tsc, '-p', join(ROOT, config)], { stdio: 'inherit' })
  if (result.status !== 0) status = result.status ?? 1
}
if (useStub) rmSync(stubDir, { recursive: true, force: true })
process.exit(status)
