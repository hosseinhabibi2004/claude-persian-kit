'use strict';

// The command the macOS and Linux installers call for everything that is not
// plain file copying: read and patch app.asar, edit plists, list code to sign.
// Prints one JSON object on success; on failure prints the reason to stderr and
// exits 1. Plain Node, no dependencies.
//
// Keep this file ASCII-only.

const fs = require('node:fs');
const path = require('node:path');

const asar = require('./asar.cjs');
const payload = require('./payload.cjs');
const plist = require('./plist.cjs');

// Bundles that run in Node, never in a page: the payload must not reach them.
const NODE_ONLY = /(^|\/)(directMcpHost|nodeHost|shellPathWorker|transcriptSearchWorker|.*[Ww]orker)\.js$/;
const BUILD_PREFIX = '.vite/build/';

function fail(message) {
  const error = new Error(message);
  error.isUser = true;
  throw error;
}

function normalize(p) {
  return String(p).replace(/\\/g, '/').replace(/^\.\//, '');
}

function identify(asarFile) {
  let pkg;
  try {
    pkg = JSON.parse(asar.readFile(asarFile, 'package.json').toString('utf8'));
  } catch (e) {
    fail('cannot read package.json from ' + asarFile + ' (' + e.message + ')');
  }

  return {
    name: pkg.name || '',
    productName: pkg.productName || '',
    version: pkg.version || '',
    main: normalize(pkg.main || ''),
  };
}

// The renderer-side scripts: preload files that talk to the page. The main
// process entry and Node-only bundles are never chosen. With `all`, every other
// script in the build folder is.
function selectTargets(asarFile, options) {
  const opts = options || {};
  const info = identify(asarFile);
  const candidates = asar.list(asarFile)
    .map(f => f.path)
    .filter(p => p.startsWith(BUILD_PREFIX) && /\.(js|cjs|mjs)$/.test(p))
    .filter(p => p !== info.main && !NODE_ONLY.test(p));

  if (opts.all) return { info: info, targets: candidates, candidates: candidates };

  const targets = candidates.filter(p => {
    const text = asar.readFile(asarFile, p).toString('utf8');

    return /\b(contextBridge|ipcRenderer)\b/.test(text);
  });

  return { info: info, targets: targets, candidates: candidates };
}

function inject(inAsar, outAsar, options) {
  const opts = options || {};
  const picked = selectTargets(inAsar, opts);
  if (picked.targets.length === 0) {
    fail(
      'no renderer script found in ' + inAsar + '. Scripts looked at: ' +
        (picked.candidates.join(', ') || '(none)') +
        '. Claude Desktop may have changed; try --all-js.'
    );
  }
  const text = payload.buildPayload(opts);
  const wanted = new Set(picked.targets);
  const result = asar.rewrite(inAsar, outAsar, (p, content) => {
    if (!wanted.has(p)) return undefined;

    return Buffer.from(payload.injectPayload(content().toString('utf8'), text), 'utf8');
  });
  asar.verify(outAsar);

  return {
    headerHash: result.headerHash,
    patched: result.changed,
    version: picked.info.version,
    main: picked.info.main,
  };
}

function strip(inAsar, outAsar) {
  const result = asar.rewrite(inAsar, outAsar, (p, content) => {
    if (!/\.(js|cjs|mjs)$/.test(p) || !p.startsWith(BUILD_PREFIX)) return undefined;
    const buf = content();
    if (buf.length > 64 * 1024 * 1024) return undefined;
    const text = buf.toString('utf8');
    if (!payload.hasPayload(text)) return undefined;

    return Buffer.from(payload.stripPayload(text), 'utf8');
  });
  asar.verify(outAsar);

  return { headerHash: result.headerHash, restored: result.changed };
}

function status(asarFile) {
  const info = identify(asarFile);
  const patched = [];
  let family = null;
  asar.list(asarFile)
    .filter(f => f.path.startsWith(BUILD_PREFIX) && /\.(js|cjs|mjs)$/.test(f.path) && f.size < 64 * 1024 * 1024)
    .forEach(f => {
      const text = asar.readFile(asarFile, f.path).toString('utf8');
      if (!payload.hasPayload(text)) return;
      patched.push(f.path);
      const m = /__PERSIAN_KIT_CONFIG__ = (\{.*\});/.exec(text);
      if (m && family === null) {
        try {
          const cfg = JSON.parse(m[1]);
          family = cfg.font && cfg.font.enabled ? cfg.font.family : '';
        } catch (e) {
          family = null;
        }
      }
    });

  return {
    version: info.version,
    patched: patched,
    isPatched: patched.length > 0,
    font: family,
    headerHash: asar.currentHeaderHash(asarFile),
  };
}

// Mach-O files and bundles under an app, deepest first, as code to sign.
const MACHO = [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe, 0xbebafeca];
const BUNDLE = /\.(app|framework|xpc|appex|plugin)$/;

function listCode(appDir) {
  const out = [];
  (function visit(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) return;
      if (entry.isDirectory()) {
        visit(full);
        if (BUNDLE.test(entry.name)) out.push(full);
      } else if (entry.isFile()) {
        const fd = fs.openSync(full, 'r');
        try {
          const head = Buffer.alloc(4);
          if (fs.readSync(fd, head, 0, 4, 0) === 4 && MACHO.includes(head.readUInt32BE(0))) out.push(full);
        } finally {
          fs.closeSync(fd);
        }
      }
    });
  })(path.join(appDir, 'Contents'));
  const depth = p => p.split(path.sep).length;

  return out.sort((a, b) => depth(b) - depth(a) || (a < b ? -1 : 1));
}

const ENTITLEMENT_KEYS_BOUND_TO_TEAM = [
  'com.apple.application-identifier',
  'com.apple.developer.team-identifier',
  'keychain-access-groups',
];

// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { _: [] };
  const rest = argv.slice();
  while (rest.length) {
    const a = rest.shift();
    if (a === '--asar') opts.asar = rest.shift();
    else if (a === '--out') opts.out = rest.shift();
    else if (a === '--app') opts.app = rest.shift();
    else if (a === '--plist') opts.plist = rest.shift();
    else if (a === '--hash') opts.hash = rest.shift();
    else if (a === '--display-name') opts.displayName = rest.shift();
    else if (a === '--font-local') opts.fontLocal = rest.shift();
    else if (a === '--font-file') opts.fontFile = rest.shift();
    else if (a === '--no-font') opts.font = false;
    else if (a === '--no-rtl') opts.rtl = false;
    else if (a === '--all-js') opts.all = true;
    else if (a.startsWith('--')) fail('unknown option ' + a);
    else opts._.push(a);
  }

  return opts;
}

function need(opts, name) {
  if (!opts[name]) fail('missing --' + name.replace(/[A-Z]/g, c => '-' + c.toLowerCase()));

  return opts[name];
}

function run(argv) {
  const command = argv[0];
  const opts = parseArgs(argv.slice(1));
  switch (command) {
    case 'inject':
      return inject(need(opts, 'asar'), need(opts, 'out'), opts);
    case 'strip':
      return strip(need(opts, 'asar'), need(opts, 'out'));
    case 'status':
      return status(need(opts, 'asar'));
    case 'identify':
      return identify(need(opts, 'asar'));
    case 'hash':
      return { headerHash: asar.currentHeaderHash(need(opts, 'asar')) };
    case 'plist-integrity': {
      // Point the app's stored ASAR hash at the patched archive; optional new name.
      const file = need(opts, 'plist');
      let xml = fs.readFileSync(file, 'utf8');
      const key = ['ElectronAsarIntegrity', 'Resources/app.asar', 'hash'];
      const had = plist.getString(xml, key) !== undefined;
      if (had) xml = plist.setString(xml, key, need(opts, 'hash'));
      if (opts.displayName) xml = plist.setString(xml, ['CFBundleDisplayName'], opts.displayName);
      fs.writeFileSync(file, xml);

      return { hadIntegrity: had };
    }
    case 'entitlements': {
      // stdin: an entitlements plist; stdout: the same without team-bound keys.
      const xml = fs.readFileSync(0, 'utf8');
      process.stdout.write(plist.removeKeys(xml, ENTITLEMENT_KEYS_BOUND_TO_TEAM));

      return null;
    }
    case 'list-code': {
      process.stdout.write(listCode(need(opts, 'app')).join('\0') + '\0');

      return null;
    }
    default:
      return fail('usage: patch-app.cjs <inject|strip|status|identify|hash|plist-integrity|entitlements|list-code> [options]');
  }
}

module.exports = { identify, selectTargets, inject, strip, status, listCode, run };

if (require.main === module) {
  try {
    const result = run(process.argv.slice(2));
    if (result !== null) process.stdout.write(JSON.stringify(result) + '\n');
  } catch (e) {
    process.stderr.write('persian-kit: ' + (e.isUser ? e.message : e.stack || e.message) + '\n');
    process.exit(1);
  }
}
