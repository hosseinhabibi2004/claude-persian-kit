'use strict';

// A small ASAR reader/rewriter, written for this project and checked against
// @electron/asar in the tests. It rewrites chosen files inside app.asar and
// leaves every other byte alone: no extract, no repack, no network.
//
// Layout of an archive (all integers little endian):
//   uint32 4 | uint32 headerSize | uint32 headerSize-4 | uint32 jsonSize |
//   json (padded to 4) | file data
// File offsets in the json are strings, counted from the end of the header.
// Electron checks the SHA-256 of the json text (the "header hash") against a
// value stored in the app (Info.plist on macOS, the exe on Windows).
//
// Keep this file ASCII-only.

const fs = require('node:fs');
const crypto = require('node:crypto');

const BLOCK_SIZE = 4 * 1024 * 1024;
const MAX_HEADER = 64 * 1024 * 1024;
const COPY_CHUNK = 4 * 1024 * 1024;

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const align4 = n => Math.ceil(n / 4) * 4;

function readAt(fd, length, position) {
  const buf = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const n = fs.readSync(fd, buf, done, length - done, position + done);
    if (n === 0) throw new Error('unexpected end of archive');
    done += n;
  }

  return buf;
}

function writeAll(fd, buf) {
  let done = 0;
  while (done < buf.length) {
    done += fs.writeSync(fd, buf, done, buf.length - done);
  }
}

function integrityOf(content) {
  const blocks = [];
  for (let at = 0; at < content.length; at += BLOCK_SIZE) {
    blocks.push(sha256(content.subarray(at, at + BLOCK_SIZE)));
  }
  if (content.length === 0) blocks.push(sha256(content));

  return { algorithm: 'SHA256', hash: sha256(content), blockSize: BLOCK_SIZE, blocks: blocks };
}

function readHeader(fd) {
  const size = fs.fstatSync(fd).size;
  if (size < 16) throw new Error('not an ASAR archive');
  const pre = readAt(fd, 16, 0);
  const headerSize = pre.readUInt32LE(4);
  const jsonSize = pre.readUInt32LE(12);
  if (
    pre.readUInt32LE(0) !== 4 ||
    jsonSize === 0 ||
    jsonSize > MAX_HEADER ||
    headerSize !== 8 + align4(jsonSize) ||
    pre.readUInt32LE(8) !== headerSize - 4 ||
    8 + headerSize > size
  ) {
    throw new Error('invalid ASAR header');
  }
  const json = readAt(fd, jsonSize, 16).toString('utf8');

  return { header: JSON.parse(json), json: json, dataStart: 8 + headerSize, size: size };
}

// Every entry of the tree as { path, node }, directories included.
function walk(header) {
  const out = [];
  (function visit(dir, prefix, depth) {
    if (depth > 64 || !dir || typeof dir.files !== 'object' || dir.files === null) {
      throw new Error('invalid ASAR directory: ' + (prefix || '/'));
    }
    Object.keys(dir.files).forEach(name => {
      const node = dir.files[name];
      if (!name || name.includes('/') || !node || typeof node !== 'object') {
        throw new Error('invalid ASAR entry: ' + prefix + name);
      }
      out.push({ path: prefix + name, node: node });
      if (node.files) visit(node, prefix + name + '/', depth + 1);
    });
  })(header, '', 0);

  return out;
}

const isPacked = node => !node.files && !node.link && !node.unpacked && node.size !== undefined;

function headerHash(json) {
  return sha256(Buffer.from(json, 'utf8'));
}

// Lists the packed files: [{ path, size }].
function list(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const { header } = readHeader(fd);

    return walk(header).filter(e => isPacked(e.node)).map(e => ({ path: e.path, size: e.node.size }));
  } finally {
    fs.closeSync(fd);
  }
}

function readFile(file, path) {
  const fd = fs.openSync(file, 'r');
  try {
    const { header, dataStart } = readHeader(fd);
    const hit = walk(header).find(e => e.path === path && isPacked(e.node));
    if (!hit) throw new Error('not in archive: ' + path);

    return readAt(fd, hit.node.size, dataStart + Number(hit.node.offset));
  } finally {
    fs.closeSync(fd);
  }
}

// Rewrites `inFile` to `outFile`. `transform(path, getContent)` is asked about
// every packed file; it returns a Buffer to replace the file, or undefined to
// keep it. Returns { headerHash, changed: [paths] }. The output is created
// exclusively and removed again if anything fails.
function rewrite(inFile, outFile, transform) {
  const src = fs.openSync(inFile, 'r');
  let dst = null;
  try {
    const { header, dataStart } = readHeader(src);
    const files = walk(header)
      .filter(e => isPacked(e.node))
      .sort((a, b) => Number(a.node.offset) - Number(b.node.offset));

    const changed = [];
    const plan = files.map(entry => {
      const getContent = () => readAt(src, entry.node.size, dataStart + Number(entry.node.offset));
      const replacement = transform(entry.path, getContent);
      if (replacement !== undefined && !Buffer.isBuffer(replacement)) {
        throw new Error('transform must return a Buffer or undefined: ' + entry.path);
      }

      return {
        entry: entry,
        replacement: replacement,
        from: dataStart + Number(entry.node.offset),
        length: entry.node.size,
      };
    });

    // New offsets, in the old order.
    let offset = 0;
    plan.forEach(item => {
      const node = item.entry.node;
      if (item.replacement) {
        node.size = item.replacement.length;
        node.integrity = integrityOf(item.replacement);
        changed.push(item.entry.path);
      }
      node.offset = String(offset);
      offset += node.size;
    });

    const json = JSON.stringify(header);
    const jsonBuf = Buffer.from(json, 'utf8');
    const padded = align4(jsonBuf.length);
    const head = Buffer.alloc(16 + padded);
    head.writeUInt32LE(4, 0);
    head.writeUInt32LE(8 + padded, 4);
    head.writeUInt32LE(4 + padded, 8);
    head.writeUInt32LE(jsonBuf.length, 12);
    jsonBuf.copy(head, 16);

    dst = fs.openSync(outFile, 'wx', 0o644);
    writeAll(dst, head);

    plan.forEach(item => {
      if (item.replacement) {
        writeAll(dst, item.replacement);

        return;
      }
      let remaining = item.length;
      let at = item.from;
      while (remaining > 0) {
        const chunk = readAt(src, Math.min(COPY_CHUNK, remaining), at);
        writeAll(dst, chunk);
        at += chunk.length;
        remaining -= chunk.length;
      }
    });

    fs.closeSync(dst);
    dst = null;

    return { headerHash: headerHash(json), changed: changed };
  } catch (e) {
    if (dst !== null) {
      try { fs.closeSync(dst); } catch (ignored) { /* already closed */ }
      try { fs.unlinkSync(outFile); } catch (ignored) { /* never created */ }
    }
    throw e;
  } finally {
    fs.closeSync(src);
  }
}

// Checks every packed file against its integrity record and the header against
// the sizes. Returns the header hash; throws on the first problem.
function verify(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const { header, json, dataStart, size } = readHeader(fd);
    walk(header).filter(e => isPacked(e.node)).forEach(e => {
      const start = dataStart + Number(e.node.offset);
      if (start + e.node.size > size) throw new Error('file runs past the archive: ' + e.path);
      if (!e.node.integrity) return;
      const content = readAt(fd, e.node.size, start);
      const want = integrityOf(content);
      if (want.hash !== e.node.integrity.hash) throw new Error('integrity mismatch: ' + e.path);
    });

    return headerHash(json);
  } finally {
    fs.closeSync(fd);
  }
}

function currentHeaderHash(file) {
  const fd = fs.openSync(file, 'r');
  try {
    return headerHash(readHeader(fd).json);
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { list, readFile, rewrite, verify, currentHeaderHash, integrityOf, headerHash };
