'use strict';

// Just enough XML property-list editing for the macOS installer: read a value
// by key path, set a string, remove top-level keys. Works on XML plists (the
// installer converts a binary one with plutil first). Text in, text out, so
// everything outside the edited value stays byte for byte.
//
// Keep this file ASCII-only.

const SIMPLE = { string: 1, integer: 1, real: 1, date: 1, data: 1, key: 1 };

function escapeXml(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function unescapeXml(text) {
  return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function skipSpace(xml, pos) {
  let i = pos;
  while (i < xml.length && /\s/.test(xml.charAt(i))) i += 1;

  return i;
}

// The tag starting at xml[pos]: { name, end (after '>'), isClosing, isSelfClosing }.
function tagAt(xml, pos) {
  const m = /^<(\/?)([A-Za-z][\w-]*)[^>]*?(\/?)>/.exec(xml.slice(pos, pos + 400));
  if (!m) throw new Error('plist: expected a tag at ' + pos);

  return { name: m[2], end: pos + m[0].length, isClosing: m[1] === '/', isSelfClosing: m[3] === '/' };
}

// Index just after the value element that starts at `pos`.
function skipValue(xml, pos) {
  const start = skipSpace(xml, pos);
  const open = tagAt(xml, start);
  if (open.isClosing) throw new Error('plist: expected a value at ' + start);
  if (open.isSelfClosing) return open.end;
  if (SIMPLE[open.name]) {
    const close = xml.indexOf('</' + open.name + '>', open.end);
    if (close < 0) throw new Error('plist: unclosed <' + open.name + '>');

    return close + open.name.length + 3;
  }
  // array or dict: balance the same tag.
  let depth = 1;
  let i = open.end;
  while (depth > 0) {
    const next = xml.indexOf('<', i);
    if (next < 0) throw new Error('plist: unclosed <' + open.name + '>');
    const t = tagAt(xml, next);
    if (t.name === open.name && !t.isSelfClosing) depth += t.isClosing ? -1 : 1;
    i = t.end;
  }

  return i;
}

// The key/value pairs directly inside the <dict> that opens at `dictStart`.
function entriesOf(xml, dictStart) {
  const open = tagAt(xml, dictStart);
  const list = [];
  let i = open.end;
  for (;;) {
    i = skipSpace(xml, i);
    const t = tagAt(xml, i);
    if (t.isClosing && t.name === 'dict') return { entries: list, innerEnd: i };
    if (t.name !== 'key') throw new Error('plist: expected a key at ' + i);
    const keyClose = xml.indexOf('</key>', t.end);
    const key = unescapeXml(xml.slice(t.end, keyClose));
    const valueStart = skipSpace(xml, keyClose + 6);
    const valueEnd = skipValue(xml, valueStart);
    list.push({ key: key, keyStart: i, valueStart: valueStart, valueEnd: valueEnd });
    i = valueEnd;
  }
}

function rootDict(xml) {
  const at = xml.indexOf('<dict>');
  if (at < 0) throw new Error('plist: no root dict (is it a binary plist?)');

  return at;
}

function locate(xml, path) {
  let dictStart = rootDict(xml);
  let hit = null;
  for (let level = 0; level < path.length; level++) {
    const { entries } = entriesOf(xml, dictStart);
    hit = entries.find(e => e.key === path[level]);
    if (!hit) return null;
    dictStart = hit.valueStart;
  }

  return hit;
}

// The text of a <string> value at a key path, or undefined.
function getString(xml, path) {
  const hit = locate(xml, path);
  if (!hit) return undefined;
  const m = /^<string>([\s\S]*)<\/string>$/.exec(xml.slice(hit.valueStart, hit.valueEnd));

  return m ? unescapeXml(m[1]) : undefined;
}

// Sets a <string> value. An existing value of another type is replaced; a
// missing top-level key is added at the end of the root dict.
function setString(xml, path, value) {
  const hit = locate(xml, path);
  const text = '<string>' + escapeXml(value) + '</string>';
  if (hit) return xml.slice(0, hit.valueStart) + text + xml.slice(hit.valueEnd);
  if (path.length !== 1) throw new Error('plist: ' + path.join('/') + ' does not exist');
  const root = entriesOf(xml, rootDict(xml));
  const at = root.innerEnd;

  return xml.slice(0, at) + '\t<key>' + escapeXml(path[0]) + '</key>\n\t' + text + '\n' + xml.slice(at);
}

// Removes top-level keys (and their values). Missing keys are ignored.
function removeKeys(xml, keys) {
  let out = xml;
  keys.forEach(key => {
    const hit = locate(out, [key]);
    if (!hit) return;
    let from = hit.keyStart;
    while (from > 0 && /[ \t]/.test(out.charAt(from - 1))) from -= 1;
    let to = hit.valueEnd;
    if (out.charAt(to) === '\n') to += 1;
    out = out.slice(0, from) + out.slice(to);
  });

  return out;
}

module.exports = { getString, setString, removeKeys, escapeXml };
