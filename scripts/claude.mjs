// Runs the `claude` CLI the same way on macOS, Linux and Windows.
import { spawnSync } from 'node:child_process'

export function claude(args, options = {}) {
  // On Windows an npm-installed `claude` is a .cmd shim, which needs a shell.
  const result = spawnSync('claude', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  })
  if (result.error) throw result.error

  return result.status ?? 1
}
