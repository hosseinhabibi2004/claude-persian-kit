import { readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// Every folder under plugins/ that holds a plugin.json.
export function pluginDirs() {
  const base = join(ROOT, 'plugins')

  return readdirSync(base, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => join(base, entry.name))
    .filter(dir => existsSync(join(dir, '.claude-plugin', 'plugin.json')))
}
