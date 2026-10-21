import assert from 'node:assert/strict'
import { test } from 'node:test'

import { dataDir, detectOs, homeDir, installerFor, joinPath } from '../hooks/os.ts'

test('Windows is told by OS=Windows_NT, a MINGW/MSYS uname, or a lone USERPROFILE', () => {
  assert.equal(detectOs({ OS: 'Windows_NT' }, undefined), 'windows')
  assert.equal(detectOs({ OS: 'Windows_NT', HOME: '/c/Users/x' }, 'MINGW64_NT-10.0'), 'windows')
  assert.equal(detectOs({}, 'MSYS_NT-10.0-19045\n'), 'windows')
  assert.equal(detectOs({}, 'CYGWIN_NT-10.0'), 'windows')
  assert.equal(detectOs({ USERPROFILE: 'C:\\Users\\x' }, undefined), 'windows')
})

test('macOS and Linux are told by uname, whatever the case or trailing newline', () => {
  assert.equal(detectOs({ HOME: '/Users/x' }, 'Darwin\n'), 'macos')
  assert.equal(detectOs({ HOME: '/home/x' }, 'Linux'), 'linux')
  assert.equal(detectOs({ HOME: '/home/x' }, ' linux \n'), 'linux')
})

test('anything else is unknown, never guessed', () => {
  assert.equal(detectOs({}, undefined), 'unknown')
  assert.equal(detectOs({ HOME: '/x' }, 'FreeBSD'), 'unknown')
  assert.equal(detectOs({ HOME: '/x', USERPROFILE: 'C:\\x' }, undefined), 'unknown')
})

test('paths use the system separator and survive spaces and Persian letters', () => {
  assert.equal(joinPath('linux', '/home/علی', '.local', 'share'), '/home/علی/.local/share')
  assert.equal(joinPath('macos', '/Users/x y', 'Library', 'Application Support'), '/Users/x y/Library/Application Support')
  assert.equal(joinPath('windows', 'C:\\Users\\علی رضا', 'AppData', 'Local'), 'C:\\Users\\علی رضا\\AppData\\Local')
})

test('separators are collapsed, trailing ones dropped, the other kind converted on Windows', () => {
  assert.equal(joinPath('linux', '/opt/', '/Claude/', 'app.asar'), '/opt/Claude/app.asar')
  assert.equal(joinPath('windows', 'C:\\Program Files\\', '\\Claude', 'a/b'), 'C:\\Program Files\\Claude\\a\\b')
  assert.equal(joinPath('windows', 'C:/Users/x', 'y'), 'C:\\Users\\x\\y')
  assert.equal(joinPath('linux', '/', 'etc'), '/etc')
  assert.equal(joinPath('linux', '', 'a', '', 'b'), 'a/b')
})

test('home folder: USERPROFILE on Windows, HOME elsewhere', () => {
  assert.equal(homeDir('windows', { USERPROFILE: 'C:\\Users\\x', HOME: '/c/Users/x' }), 'C:\\Users\\x')
  assert.equal(homeDir('windows', { HOME: 'C:\\Users\\y' }), 'C:\\Users\\y')
  assert.equal(homeDir('linux', { HOME: '/home/x', USERPROFILE: 'ignored' }), '/home/x')
  assert.equal(homeDir('macos', {}), undefined)
})

test('the kit folder follows each system\'s conventions', () => {
  assert.equal(dataDir('macos', { HOME: '/Users/علی' }), '/Users/علی/Library/Application Support/claude-persian-kit')
  assert.equal(dataDir('linux', { HOME: '/home/x' }), '/home/x/.local/share/claude-persian-kit')
  assert.equal(dataDir('linux', { HOME: '/home/x', XDG_DATA_HOME: '/data dir' }), '/data dir/claude-persian-kit')
  assert.equal(dataDir('windows', { USERPROFILE: 'C:\\Users\\x', LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local' }), 'C:\\Users\\x\\AppData\\Local\\claude-persian-kit')
  assert.equal(dataDir('windows', { USERPROFILE: 'C:\\Users\\x' }), 'C:\\Users\\x\\AppData\\Local\\claude-persian-kit')
  assert.equal(dataDir('linux', {}), undefined)
  assert.equal(dataDir('unknown', { HOME: '/x' }), undefined)
})

test('installers: macOS and Linux have one, Windows and unknown do not (yet)', () => {
  assert.equal(installerFor('macos')?.script, 'patch-mac.sh')
  assert.equal(installerFor('linux')?.script, 'patch-linux.sh')
  assert.equal(installerFor('windows'), undefined)
  assert.equal(installerFor('unknown'), undefined)
})
