import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const plist = require('../src/plist.cjs')

const INFO = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleName</key>
\t<string>Claude</string>
\t<key>CFBundleDisplayName</key>
\t<string>Claude &amp; Co</string>
\t<key>LSEnvironment</key>
\t<dict>
\t\t<key>MallocNanoZone</key>
\t\t<string>0</string>
\t</dict>
\t<key>ElectronAsarIntegrity</key>
\t<dict>
\t\t<key>Resources/app.asar</key>
\t\t<dict>
\t\t\t<key>algorithm</key>
\t\t\t<string>SHA256</string>
\t\t\t<key>hash</key>
\t\t\t<string>aaaa</string>
\t\t</dict>
\t</dict>
\t<key>NSSupportsAutomaticTermination</key>
\t<true/>
\t<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict><key>CFBundleURLSchemes</key><array><string>claude</string></array></dict>
\t</array>
</dict>
</plist>
`

test('reads strings by key path, including nested and escaped ones', () => {
  assert.equal(plist.getString(INFO, ['CFBundleName']), 'Claude')
  assert.equal(plist.getString(INFO, ['CFBundleDisplayName']), 'Claude & Co')
  assert.equal(plist.getString(INFO, ['ElectronAsarIntegrity', 'Resources/app.asar', 'hash']), 'aaaa')
  assert.equal(plist.getString(INFO, ['LSEnvironment', 'MallocNanoZone']), '0')
  assert.equal(plist.getString(INFO, ['Missing']), undefined)
  assert.equal(plist.getString(INFO, ['NSSupportsAutomaticTermination']), undefined)
  assert.equal(plist.getString(INFO, ['ElectronAsarIntegrity', 'nope', 'hash']), undefined)
})

test('setting the integrity hash changes that value and nothing else', () => {
  const path = ['ElectronAsarIntegrity', 'Resources/app.asar', 'hash']
  const out = plist.setString(INFO, path, 'bbbb')
  assert.equal(plist.getString(out, path), 'bbbb')
  assert.equal(out, INFO.replace('<string>aaaa</string>', '<string>bbbb</string>'))
})

test('a missing top-level key is added, an existing one replaced, text is escaped', () => {
  const added = plist.setString(INFO, ['CFBundleDisplayNameX'], 'A <B>')
  assert.equal(plist.getString(added, ['CFBundleDisplayNameX']), 'A <B>')
  assert.ok(added.endsWith('</dict>\n</plist>\n'))
  assert.equal(plist.getString(plist.setString(INFO, ['CFBundleDisplayName'], 'Claude Persian'), ['CFBundleDisplayName']), 'Claude Persian')
  assert.throws(() => plist.setString(INFO, ['LSEnvironment', 'Nope'], 'x'), /does not exist/)
})

test('removing keys drops key and value, whatever the value type', () => {
  const ents = `<?xml version="1.0"?>
<plist version="1.0">
<dict>
\t<key>com.apple.application-identifier</key>
\t<string>TEAM.com.example</string>
\t<key>keychain-access-groups</key>
\t<array>
\t\t<string>TEAM.com.example</string>
\t</array>
\t<key>com.apple.security.cs.allow-jit</key>
\t<true/>
</dict>
</plist>
`
  const out = plist.removeKeys(ents, ['com.apple.application-identifier', 'keychain-access-groups', 'absent'])
  assert.doesNotMatch(out, /TEAM/)
  assert.match(out, /allow-jit/)
  assert.equal(plist.removeKeys(out, ['absent']), out)
})

test('binary or broken plists are refused rather than mangled', () => {
  assert.throws(() => plist.getString('bplist00\u0000\u0001', ['x']), /binary plist/)
  assert.throws(() => plist.getString('<plist><dict><key>a</key>', ['a']), /plist:/)
})
