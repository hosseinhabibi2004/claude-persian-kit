// Operating system and path handling for /persian-patch. Pure functions over
// the environment values the hook reads through $.env and `uname -s`: a hooks
// module has no Node, so it cannot ask `process.platform` or use `path`.

export type Os = 'macos' | 'linux' | 'windows' | 'unknown'

export type Env = {
  readonly OS?: string
  readonly HOME?: string
  readonly USERPROFILE?: string
  readonly LOCALAPPDATA?: string
  readonly XDG_DATA_HOME?: string
}

// `unameS` is the output of `uname -s`, absent where there is no such command
// (plain Windows). Git Bash and MSYS report MINGW/MSYS/CYGWIN: still Windows.
export function detectOs(env: Env, unameS: string | undefined): Os {
  if (env.OS === 'Windows_NT') return 'windows'
  const kernel = (unameS ?? '').trim().toLowerCase()
  if (kernel === 'darwin') return 'macos'
  if (kernel === 'linux') return 'linux'
  if (/^(mingw|msys|cygwin)/.test(kernel)) return 'windows'
  if (kernel === '' && env.USERPROFILE !== undefined && env.HOME === undefined) return 'windows'

  return 'unknown'
}

const SEPARATOR: Record<Os, string> = {
  macos: '/',
  linux: '/',
  unknown: '/',
  windows: '\\',
}

// Joins path parts with the system's separator. Parts may use either
// separator, may end with one, and may hold spaces or Persian letters.
export function joinPath(os: Os, ...parts: readonly string[]): string {
  const sep = SEPARATOR[os]
  const wrongSep = sep === '/' ? /\\/g : /\//g
  const clean = parts
    .filter(part => part !== '')
    .map((part, index) => {
      const fixed = os === 'windows' ? part.replace(wrongSep, sep) : part
      const trimmed = index === 0 ? fixed.replace(/[\\/]+$/, '') : fixed.replace(/^[\\/]+|[\\/]+$/g, '')

      return trimmed === '' && index === 0 ? sep : trimmed
    })

  return clean.join(sep).replace(sep === '/' ? /\/{2,}/g : /\\{2,}/g, sep)
}

export function homeDir(os: Os, env: Env): string | undefined {
  return os === 'windows' ? env.USERPROFILE ?? env.HOME : env.HOME
}

// Where the installers keep the kit's own files (the copy they patch).
export function dataDir(os: Os, env: Env): string | undefined {
  const home = homeDir(os, env)
  switch (os) {
    case 'macos':
      return home && joinPath(os, home, 'Library', 'Application Support', 'claude-persian-kit')
    case 'linux':
      return env.XDG_DATA_HOME
        ? joinPath(os, env.XDG_DATA_HOME, 'claude-persian-kit')
        : home && joinPath(os, home, '.local', 'share', 'claude-persian-kit')
    case 'windows':
      return env.LOCALAPPDATA
        ? joinPath(os, env.LOCALAPPDATA, 'claude-persian-kit')
        : home && joinPath(os, home, 'AppData', 'Local', 'claude-persian-kit')
    default:
      return undefined
  }
}

export type Installer = { readonly script: string }

// The installer for a system, or undefined where v0.1.0 has none (Windows).
export function installerFor(os: Os): Installer | undefined {
  if (os === 'macos') return { script: 'patch-mac.sh' }
  if (os === 'linux') return { script: 'patch-linux.sh' }

  return undefined
}

export function osName(os: Os): string {
  return { macos: 'macOS', linux: 'Linux', windows: 'Windows', unknown: 'an unknown system' }[os]
}
