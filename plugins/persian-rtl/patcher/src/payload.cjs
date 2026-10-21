'use strict';

// Builds the text the installers put into Claude Desktop's renderer files, and
// puts it in and takes it out again. Plain Node, no dependencies, the same on
// macOS, Linux and Windows. Keep this file ASCII-only: installers may read it
// with a legacy code page.

const fs = require('node:fs');
const path = require('node:path');

const SCRIPT_FILE = path.join(__dirname, 'persian-rtl.js');
const DEFAULT_FONT_FILE = path.join(__dirname, '..', '..', 'fonts', 'Vazirmatn-Variable.woff2');

const CONFIG_START = '/* PERSIAN-KIT:CONFIG */';
const SCRIPT_START = '/* PERSIAN-KIT:START';
const SCRIPT_END = '/* PERSIAN-KIT:END */';

const FONT_FORMATS = { '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'ttf' };

function fail(message) {
  throw new Error('persian-kit: ' + message);
}

// A family name goes into CSS and JSON. Letters, digits, spaces, dots, dashes
// and underscores are enough for every real font name.
function checkFontName(name) {
  if (typeof name !== 'string' || !/^[\p{L}\p{N} ._-]{1,80}$/u.test(name.trim())) {
    fail('font name "' + String(name) + '" is not a plain font family name');
  }

  return name.trim();
}

// options:
//   rtl        false switches direction fixes off (default true)
//   font       false switches the font off (default: Vazirmatn, embedded)
//   fontLocal  name of an installed font to use instead of the embedded one
//   fontFile   path of a woff2/woff/ttf file to embed instead of Vazirmatn
function buildConfig(options) {
  const opts = options || {};
  const config = { rtl: opts.rtl !== false, font: { enabled: opts.font !== false } };

  if (!config.font.enabled) {
    config.font.family = '';
    config.font.source = null;
  } else if (opts.fontLocal !== undefined && opts.fontLocal !== null) {
    const name = checkFontName(opts.fontLocal);
    config.font.family = name;
    config.font.source = { kind: 'local', name: name };
  } else {
    const file = opts.fontFile || DEFAULT_FONT_FILE;
    const format = FONT_FORMATS[path.extname(file).toLowerCase()];
    if (!format) fail('font file must be .woff2, .woff or .ttf: ' + file);
    let bytes;
    try {
      bytes = fs.readFileSync(file);
    } catch (e) {
      fail('cannot read the font file ' + file + ' (' + e.code + ')');
    }
    config.font.family = opts.fontFile ? path.basename(file, path.extname(file)) : 'Vazirmatn';
    config.font.source = { kind: 'data', format: format, base64: bytes.toString('base64') };
  }

  return config;
}

function buildPayload(options) {
  const config = buildConfig(options);
  const script = fs.readFileSync(SCRIPT_FILE, 'utf8').replace(/\r\n/g, '\n').trimEnd();

  return (
    CONFIG_START + '\n' +
    'globalThis.__PERSIAN_KIT_CONFIG__ = ' + JSON.stringify(config) + ';\n' +
    script + '\n'
  );
}

function hasPayload(source) {
  return source.includes(CONFIG_START) || source.includes(SCRIPT_START);
}

// Removes every payload block, leaving the rest of the file byte for byte.
function stripPayload(source) {
  let out = source;
  for (;;) {
    const first = out.indexOf(CONFIG_START);
    const start = first >= 0 ? first : out.indexOf(SCRIPT_START);
    if (start < 0) return out;
    const end = out.indexOf(SCRIPT_END, start);
    if (end < 0) return out;
    let stop = end + SCRIPT_END.length;
    if (out.charAt(stop) === '\r') stop += 1;
    if (out.charAt(stop) === '\n') stop += 1;
    out = out.slice(0, start) + out.slice(stop);
  }
}

// Puts the payload at the top of a script, after a shebang line and after a
// leading "use strict" directive, which must stay the first statement.
function injectPayload(source, payload) {
  const clean = stripPayload(source);
  let head = 0;
  const bom = clean.charCodeAt(0) === 0xfeff ? 1 : 0;
  head = bom;
  if (clean.startsWith('#!', head)) {
    const nl = clean.indexOf('\n', head);
    head = nl < 0 ? clean.length : nl + 1;
  }
  const strict = /^\s*(["'])use strict\1\s*;?[ \t]*\r?\n?/.exec(clean.slice(head));
  if (strict) head += strict[0].length;
  const lead = head > 0 && !/\n$/.test(clean.slice(0, head)) ? '\n' : '';

  return clean.slice(0, head) + lead + payload + clean.slice(head);
}

module.exports = {
  buildConfig,
  buildPayload,
  hasPayload,
  stripPayload,
  injectPayload,
  DEFAULT_FONT_FILE,
  SCRIPT_FILE,
};

// node payload.cjs build [--out file] [--font-local Name | --font-file path | --no-font] [--no-rtl]
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args.shift();
  const opts = {};
  let out = null;
  while (args.length) {
    const a = args.shift();
    if (a === '--out') out = args.shift();
    else if (a === '--font-local') opts.fontLocal = args.shift();
    else if (a === '--font-file') opts.fontFile = args.shift();
    else if (a === '--no-font') opts.font = false;
    else if (a === '--no-rtl') opts.rtl = false;
    else fail('unknown option ' + a);
  }
  if (command !== 'build') fail('usage: payload.cjs build [--out file] [options]');
  const text = buildPayload(opts);
  if (out) fs.writeFileSync(out, text);
  else process.stdout.write(text);
}
