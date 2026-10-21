/* PERSIAN-KIT:START v1 */
/*
 * persian-rtl.js: the one script claude-persian-kit puts into Claude Desktop's
 * renderer. Part one is pure text logic (no DOM, unit tested on its own); part
 * two is a thin DOM layer that applies what part one decides.
 *
 * Rules the DOM layer keeps:
 *  - It only sets attributes on elements that already exist. It never adds,
 *    moves or removes the page's nodes, so React can keep reconciling them.
 *  - Every element it touches carries data-pk, so a second pass changes
 *    nothing and a block can be released again.
 *  - An element the app already gave dir="rtl" or dir="auto" is native RTL
 *    handling: it is left alone.
 *  - Any failure is swallowed; after a few of them the script stops itself.
 *
 * Settings come from globalThis.__PERSIAN_KIT_CONFIG__, written in front of
 * this script by the installer (see build-payload.js).
 */
(function (root) {
  'use strict';

  var VERSION = 1;
  if (root.__persianKit && root.__persianKit.version >= VERSION) return;

  // ---------------------------------------------------------------------------
  // Part one: pure text logic
  // ---------------------------------------------------------------------------

  // Scripts written right to left. Only letters of these scripts count as RTL.
  var RTL_LETTER = new RegExp(
    '[\\p{Script=Arabic}\\p{Script=Hebrew}\\p{Script=Syriac}\\p{Script=Thaana}' +
      '\\p{Script=Nko}\\p{Script=Samaritan}\\p{Script=Mandaic}\\p{Script=Adlam}]',
    'u'
  );
  var LETTER = /\p{L}/u;
  // A word is a run of letters and marks. ZWNJ and ZWJ keep a Persian word in
  // one piece: «می‌خواهم» is one word, not two.
  var WORD = /[\p{L}\p{M}‌‍]+/gu;

  // Characters in Arabic script that the font covers (and only those).
  var ARABIC_SCRIPT_RANGE =
    'U+0600-06FF,U+0750-077F,U+0870-089F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200D';

  var GENERIC_FAMILIES = {
    serif: 1, 'sans-serif': 1, monospace: 1, cursive: 1, fantasy: 1,
    'system-ui': 1, 'ui-serif': 1, 'ui-sans-serif': 1, 'ui-monospace': 1,
    'ui-rounded': 1, emoji: 1, math: 1, fangsong: 1, inherit: 1, initial: 1,
    unset: 1, revert: 1
  };

  // 'r' for a letter of an RTL script, 'l' for any other letter, null otherwise.
  function letterClass(ch) {
    if (!LETTER.test(ch)) return null;
    return RTL_LETTER.test(ch) ? 'r' : 'l';
  }

  // Direction of the first strong character: explicit marks first, then letters.
  function firstStrong(text) {
    for (var i = 0; i < text.length; ) {
      var cp = text.codePointAt(i);
      var ch = String.fromCodePoint(cp);
      i += ch.length;
      if (cp === 0x200f || cp === 0x202b || cp === 0x202e || cp === 0x2067) return 'rtl';
      if (cp === 0x200e || cp === 0x202a || cp === 0x202d || cp === 0x2066) return 'ltr';
      var cls = letterClass(ch);
      if (cls) return cls === 'r' ? 'rtl' : 'ltr';
    }
    return null;
  }

  function blank(match) {
    return match.replace(/[^\n]/g, ' ');
  }

  // --- math: LaTeX that must stay a left-to-right island -------------------

  var MATH_SIGNAL = /[\\^_{}=<>+]|^\s*[A-Za-z]\s*$/;

  function isEscaped(text, i) {
    var n = 0;
    while (i - 1 - n >= 0 && text.charAt(i - 1 - n) === '\\') n += 1;
    return n % 2 === 1;
  }

  // Ranges [start, end) of LaTeX in plain text. $$..$$, \[..\] and \(..\) always
  // count. A single $..$ counts only if its body looks like math, so prices
  // ("$5 and $10") are not mistaken for it and cannot steal a later closing $.
  function findMath(text) {
    var ranges = [];
    function overlaps(a, b) {
      for (var k = 0; k < ranges.length; k++) {
        if (a < ranges[k][1] && b > ranges[k][0]) return true;
      }
      return false;
    }
    function claim(re) {
      var m;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        if (!overlaps(m.index, m.index + m[0].length)) {
          ranges.push([m.index, m.index + m[0].length]);
        }
      }
    }
    claim(/\$\$[\s\S]+?\$\$/g);
    claim(/\\\[[\s\S]+?\\\]/g);
    claim(/\\\([\s\S]+?\\\)/g);

    for (var i = 0; i < text.length; i++) {
      if (text.charAt(i) !== '$' || isEscaped(text, i) || overlaps(i, i + 1)) continue;
      var prev = text.charAt(i - 1);
      var next = text.charAt(i + 1);
      // An opening $ follows a space or punctuation and hugs its content.
      if (i > 0 && /[\p{L}\p{N}]/u.test(prev)) continue;
      if (next === '' || /\s/.test(next) || next === '$') continue;

      var j = i + 1;
      var close = -1;
      while (j < text.length && text.charAt(j) !== '\n') {
        if (text.charAt(j) === '$' && !isEscaped(text, j) && !overlaps(j, j + 1)) {
          close = j;
          break;
        }
        j += 1;
      }
      if (close < 0) continue;
      var after = text.charAt(close + 1);
      var body = text.slice(i + 1, close);
      if (/\s/.test(text.charAt(close - 1)) || /\d/.test(after)) continue;
      if (!MATH_SIGNAL.test(body)) continue;
      ranges.push([i, close + 1]);
      i = close;
    }
    ranges.sort(function (a, b) { return a[0] - b[0]; });
    return ranges;
  }

  var FILE_EXT =
    'js|jsx|mjs|cjs|ts|tsx|json|md|py|sh|ps1|css|html|yml|yaml|txt|toml|rs|go|java|kt|' +
    'swift|c|h|cpp|cs|rb|php|sql|xml|csv|lock|env|log|woff2|png|svg';

  // Text that is neither Persian nor English prose: code, math, links, paths.
  // Each match is blanked (newlines kept) so it cannot sway a direction vote.
  function stripNoise(text) {
    var out = text;
    out = out.replace(/```[\s\S]*?```/g, blank);
    out = out.replace(/`[^`\n]+`/g, blank);
    var ranges = findMath(out);
    for (var k = ranges.length - 1; k >= 0; k--) {
      out = out.slice(0, ranges[k][0]) + blank(out.slice(ranges[k][0], ranges[k][1])) + out.slice(ranges[k][1]);
    }
    out = out.replace(/\b(?:https?|ftp|file):\/\/[^\s)»"'<>]+/gi, blank);
    out = out.replace(/\bwww\.[^\s)»"'<>]+/gi, blank);
    out = out.replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, blank);
    out = out.replace(/(?:[A-Za-z]:)?(?:[\w.~-]*[\/\\])+[\w.-]*/g, blank);
    out = out.replace(new RegExp('\\b[\\w-]+(?:\\.[\\w-]+)*\\.(?:' + FILE_EXT + ')\\b', 'gi'), blank);
    return out;
  }

  // --- direction -------------------------------------------------------------

  // Count the strong words of a text: {rtl, ltr, first}.
  function countWords(prose) {
    var counts = { rtl: 0, ltr: 0, first: null };
    var words = prose.match(WORD) || [];
    for (var i = 0; i < words.length; i++) {
      var letter = words[i].match(LETTER);
      if (!letter) continue;
      var cls = letterClass(letter[0]);
      if (cls === 'r') counts.rtl += 1;
      else if (cls === 'l') counts.ltr += 1;
      if (counts.first === null && cls) counts.first = cls === 'r' ? 'rtl' : 'ltr';
    }
    return counts;
  }

  function pick(counts) {
    if (counts.rtl === 0 && counts.ltr === 0) return null;
    if (counts.rtl > counts.ltr) return 'rtl';
    if (counts.ltr > counts.rtl) return 'ltr';
    return counts.first;
  }

  // Direction of one run of text: the side with more words wins, the first
  // strong character breaks a tie. dir is null when there is nothing to decide.
  function decideText(text) {
    var counts = countWords(stripNoise(text || ''));
    return { dir: pick(counts), rtl: counts.rtl, ltr: counts.ltr, words: counts.rtl + counts.ltr };
  }

  // Direction of a block that may hold several lines. When its lines disagree
  // the block is "mixed": the browser should resolve each line on its own.
  function decideLines(text) {
    var prose = stripNoise(text || '');
    var whole = countWords(prose);
    var kinds = {};
    prose.split(/\r?\n/).forEach(function (line) {
      var d = pick(countWords(line));
      if (d) kinds[d] = true;
    });
    var isMixed = !!(kinds.rtl && kinds.ltr);
    return {
      dir: pick(whole),
      rtl: whole.rtl,
      ltr: whole.ltr,
      words: whole.rtl + whole.ltr,
      isMixed: isMixed
    };
  }

  // Direction of a group (list items, table cells): the majority of its members,
  // then of their words, then the first member that has a direction.
  function decideGroup(members) {
    var votes = { rtl: 0, ltr: 0 };
    var words = { rtl: 0, ltr: 0 };
    var first = null;
    members.forEach(function (m) {
      if (!m || !m.dir) return;
      votes[m.dir] += 1;
      words[m.dir] += m.words || 0;
      if (first === null) first = m.dir;
    });
    if (votes.rtl === 0 && votes.ltr === 0) return null;
    if (votes.rtl !== votes.ltr) return votes.rtl > votes.ltr ? 'rtl' : 'ltr';
    if (words.rtl !== words.ltr) return words.rtl > words.ltr ? 'rtl' : 'ltr';
    return first;
  }

  // --- fonts -------------------------------------------------------------------

  function splitFamilies(value) {
    var out = [];
    var cur = '';
    var quote = '';
    for (var i = 0; i < value.length; i++) {
      var ch = value.charAt(i);
      if (quote) {
        if (ch === quote) quote = '';
        else cur += ch;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === ',') {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out.filter(Boolean);
  }

  // The named families the app uses for text, minus any it also uses for code.
  // The Persian font is added under those names, for Arabic-script characters
  // only, so Latin text, and everything in code, keeps the app's own font.
  function pickFamilies(textStacks, codeStacks, limit) {
    var skip = {};
    codeStacks.forEach(function (stack) {
      splitFamilies(stack).forEach(function (name) { skip[name.toLowerCase()] = true; });
    });
    var seen = {};
    var out = [];
    textStacks.forEach(function (stack) {
      splitFamilies(stack).forEach(function (name) {
        var key = name.toLowerCase();
        if (GENERIC_FAMILIES[key] || skip[key] || seen[key] || /^var\(/i.test(name)) return;
        seen[key] = true;
        out.push(name);
      });
    });
    return out.slice(0, limit || 12);
  }

  function cssString(value) {
    return '"' + String(value).replace(/[\\"\n\r]/g, '') + '"';
  }

  // FontFace descriptors for the configured font: [{src, weight}].
  function fontFaces(font) {
    if (!font || !font.source) return [];
    var s = font.source;
    if (s.kind === 'data') {
      var mime = s.format === 'woff' ? 'font/woff' : s.format === 'ttf' ? 'font/ttf' : 'font/woff2';
      return [{
        src: 'url(data:' + mime + ';base64,' + s.base64 + ') format("' + (s.format || 'woff2') + '")',
        weight: s.weight || '100 900'
      }];
    }
    if (s.kind === 'local' && s.name) {
      var n = cssString(s.name);
      var bold = cssString(s.name + ' Bold');
      var dashBold = cssString(s.name + '-Bold');
      return [
        { src: 'local(' + n + '), local(' + cssString(s.name + ' Regular') + ')', weight: '400' },
        { src: 'local(' + bold + '), local(' + dashBold + '), local(' + n + ')', weight: '700' }
      ];
    }
    return [];
  }

  // --- style sheet -------------------------------------------------------------

  // Code and math are left-to-right islands inside any paragraph; fields and
  // tables align to the start of their own direction.
  function buildCss() {
    return [
      'pre,code,kbd,samp,math,.katex,.katex-display{direction:ltr;unicode-bidi:isolate}',
      'pre{text-align:left}',
      '[data-pk="mixed"]{unicode-bidi:plaintext;text-align:start}',
      '[data-pk="rtl"],[data-pk="ltr"]{text-align:start}',
      '[data-pk-input],[data-pk-input] p,[data-pk-input] div{unicode-bidi:plaintext;text-align:start}',
      'table[data-pk] :is(td,th):not([style*="text-align"]){text-align:start}'
    ].join('\n');
  }

  var core = {
    firstStrong: firstStrong,
    findMath: findMath,
    stripNoise: stripNoise,
    decideText: decideText,
    decideLines: decideLines,
    decideGroup: decideGroup,
    splitFamilies: splitFamilies,
    pickFamilies: pickFamilies,
    fontFaces: fontFaces,
    buildCss: buildCss,
    ARABIC_SCRIPT_RANGE: ARABIC_SCRIPT_RANGE
  };

  var api = { version: VERSION, core: core, controller: null, running: false };
  root.__persianKit = api;

  if (typeof root.document === 'undefined' || typeof root.MutationObserver === 'undefined') return;

  // ---------------------------------------------------------------------------
  // Part two: the DOM layer
  // ---------------------------------------------------------------------------

  var ATTR = 'data-pk';
  var ATTR_INPUT = 'data-pk-input';
  var STYLE_ID = 'persian-kit-style';

  var DEFAULTS = {
    rtl: true,
    font: { enabled: true, family: 'Vazirmatn', source: null },
    debounceMs: 40
  };

  // Text inside these is never part of a direction decision, and nothing inside
  // them is styled by us.
  var SKIP_SELECTOR =
    'pre,code,kbd,samp,math,svg,script,style,textarea,button,select,' +
    '.katex,.katex-display,[contenteditable="true"],[contenteditable=""],[data-pk-skip]';
  // Blocks that are decided on their own: a block's text stops at these.
  var NESTED_BLOCKS = {
    ul: 1, ol: 1, blockquote: 1, table: 1, pre: 1, p: 1, div: 1,
    h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, li: 1, details: 1
  };
  // A list item or table cell also owns the paragraphs inside it ("loose"
  // markdown lists render <li><p>..</p></li>), but not nested lists or tables.
  var GROUP_NESTED = { ul: 1, ol: 1, blockquote: 1, table: 1, pre: 1 };
  var INLINE_TAGS = {
    span: 1, strong: 1, em: 1, b: 1, i: 1, a: 1, u: 1, s: 1, mark: 1,
    sub: 1, sup: 1, small: 1, br: 1, del: 1, ins: 1
  };
  // Blocks whose own text is decided (p, headings, ...) and the groups around them.
  var BLOCK_SELECTOR = 'p,h1,h2,h3,h4,h5,h6,dt,dd,summary,figcaption';
  var GROUP_SELECTOR = 'ul,ol,table,blockquote';
  var CELL_SELECTOR = 'td,th';
  var INPUT_SELECTOR =
    '[contenteditable="true"],[contenteditable=""],textarea,input[type="text"],input[type="search"],input:not([type])';
  // Plain text blocks (chat bubbles, labels) are only styled when they hold
  // enough prose to be a message, and never inside navigation or controls.
  var CHROME_SELECTOR =
    'nav,aside,header,footer,button,a,[role="button"],[role="tab"],[role="tablist"],' +
    '[role="menu"],[role="menuitem"],[role="navigation"],[role="listbox"],[role="option"],' +
    '[contenteditable],[data-pk-skip]';
  var MANAGED_ANCESTOR = 'p,li,td,th,h1,h2,h3,h4,h5,h6,blockquote,dt,dd,summary,figcaption,pre';
  var FREE_TEXT_MIN_WORDS = 3;
  var LIST_ITEM_OVERRIDE_MIN_WORDS = 3;
  var MAX_ERRORS = 20;

  function mergeConfig(raw) {
    var cfg = raw || {};
    var font = cfg.font || {};
    return {
      rtl: cfg.rtl !== false,
      font: {
        enabled: font.enabled !== false,
        family: font.family || DEFAULTS.font.family,
        source: font.source || null
      },
      debounceMs: typeof cfg.debounceMs === 'number' ? cfg.debounceMs : DEFAULTS.debounceMs
    };
  }

  function createController(win, options) {
    var doc = win.document;
    var config = mergeConfig((options && options.config) || root.__PERSIAN_KIT_CONFIG__);
    var schedule = (options && options.schedule) || function (fn) { return win.setTimeout(fn, config.debounceMs); };
    var cancel = (options && options.cancel) || function (id) { win.clearTimeout(id); };

    var dirty = new Set();
    var timer = null;
    var observer = null;
    var errors = 0;
    var registered = {};
    var lastFontScan = 0;

    function guard(fn) {
      try {
        return fn();
      } catch (e) {
        errors += 1;
        if (errors >= MAX_ERRORS) stop();
        return undefined;
      }
    }

    // --- reading the page ------------------------------------------------------

    function isSkipped(el) {
      return !!(el.closest && el.closest(SKIP_SELECTOR));
    }

    // The text an element owns: its inline content, with <br> as a line break,
    // without code, math or controls, and without the nested blocks named in
    // `stopAt`, which are decided on their own.
    function ownText(el, stopAt) {
      var out = '';
      (function walk(node) {
        var kids = node.childNodes;
        for (var i = 0; i < kids.length; i++) {
          var c = kids[i];
          if (c.nodeType === 3) {
            out += c.data;
          } else if (c.nodeType === 1) {
            var tag = c.localName;
            if (tag === 'br') out += '\n';
            else if (c.matches(SKIP_SELECTOR)) out += ' ';
            else if (stopAt && stopAt[tag]) out += ' ';
            else walk(c);
          }
        }
      })(el);
      return out;
    }

    // --- writing: only ever attributes -----------------------------------------

    function isNative(el) {
      var d = el.getAttribute('dir');
      if (!d || d === 'ltr') return false;
      return el.getAttribute(ATTR) !== d;
    }

    // Take back what we set, and only that: a dir the app has since put there
    // is left in place.
    function release(el) {
      var mark = el.getAttribute(ATTR);
      if (mark === null) return;
      if (el.getAttribute('dir') === mark) el.removeAttribute('dir');
      el.removeAttribute(ATTR);
    }

    function setState(el, state) {
      if (state === null) return release(el);
      if (isNative(el)) return release(el);
      if (state === 'mixed') {
        if (el.hasAttribute('dir')) el.removeAttribute('dir');
      } else if (el.getAttribute('dir') !== state) {
        el.setAttribute('dir', state);
      }
      if (el.getAttribute(ATTR) !== state) el.setAttribute(ATTR, state);
    }

    function stateOf(decision) {
      if (!decision || !decision.dir) return null;
      return decision.isMixed ? 'mixed' : decision.dir;
    }

    // --- element kinds -----------------------------------------------------------

    function processBlock(el) {
      if (isSkipped(el)) return;
      setState(el, stateOf(decideLines(ownText(el, NESTED_BLOCKS))));
    }

    function processList(list) {
      if (isSkipped(list)) return;
      var items = Array.prototype.filter.call(list.children, function (c) { return c.localName === 'li'; });
      var decisions = items.map(function (li) { return decideText(ownText(li, GROUP_NESTED)); });
      var dir = decideGroup(decisions);
      setState(list, dir);
      items.forEach(function (li, i) {
        var d = decisions[i];
        var overrides = d.dir && dir && d.dir !== dir && d.words >= LIST_ITEM_OVERRIDE_MIN_WORDS;
        setState(li, overrides ? d.dir : null);
      });
    }

    function processTable(table) {
      if (isSkipped(table)) return;
      var cells = table.querySelectorAll('td,th');
      var decisions = Array.prototype.map.call(cells, function (cell) {
        return decideText(ownText(cell, GROUP_NESTED));
      });
      var dir = decideGroup(decisions);
      setState(table, dir);
      Array.prototype.forEach.call(cells, function (cell, i) {
        var d = decisions[i].dir;
        setState(cell, d && d !== dir ? d : null);
      });
    }

    function processQuote(quote) {
      if (isSkipped(quote)) return;
      setState(quote, decideText(ownText(quote, null)).dir);
    }

    // Cheap test run on every div: does it hold text of its own at all?
    function hasInlineContent(el) {
      var kids = el.childNodes;
      for (var i = 0; i < kids.length; i++) {
        var c = kids[i];
        if (c.nodeType === 3 && /\S/.test(c.data)) return true;
        if (c.nodeType === 1 && INLINE_TAGS[c.localName]) return true;
      }
      return false;
    }

    function processFreeText(el) {
      if (isSkipped(el) || el.closest(CHROME_SELECTOR) || el.closest(MANAGED_ANCESTOR)) return;
      if (!hasInlineContent(el)) return;
      var d = decideLines(ownText(el, NESTED_BLOCKS));
      setState(el, d.words >= FREE_TEXT_MIN_WORDS ? stateOf(d) : null);
    }

    function processInput(el) {
      if (isNative(el)) return;
      if (el.getAttribute(ATTR_INPUT) === null) el.setAttribute(ATTR_INPUT, '');
      if (el.localName === 'textarea' || el.localName === 'input') {
        if (el.getAttribute('dir') !== 'auto') el.setAttribute('dir', 'auto');
      }
    }

    function processElement(el) {
      var tag = el.localName;
      if (el.matches(INPUT_SELECTOR)) return processInput(el);
      if (tag === 'ul' || tag === 'ol') return processList(el);
      if (tag === 'table') return processTable(el);
      if (tag === 'blockquote') return processQuote(el);
      if (tag === 'td' || tag === 'th') return; // decided with their table
      if (tag === 'li') {
        var parent = el.parentElement;
        if (parent && (parent.localName === 'ul' || parent.localName === 'ol')) return;
        return processBlock(el);
      }
      if (el.matches(BLOCK_SELECTOR)) return processBlock(el);
      if (tag === 'div' || tag === 'section' || tag === 'article') return processFreeText(el);
    }

    var ALL_SELECTOR = [BLOCK_SELECTOR, GROUP_SELECTOR, 'li', CELL_SELECTOR, INPUT_SELECTOR, 'div,section,article'].join(',');

    function scan(node) {
      if (!config.rtl || !node || node.nodeType !== 1) return;
      guard(function () {
        processElement(node);
        var all = node.querySelectorAll(ALL_SELECTOR);
        for (var i = 0; i < all.length; i++) {
          var el = all[i];
          guard(function () { processElement(el); });
        }
        // A change inside a block can change how the blocks around it read:
        // the paragraph, the list item, the list, the table, the quote.
        var up = node.parentElement;
        for (var depth = 0; up && depth < 10; depth++) {
          processElement(up);
          up = up.parentElement;
        }
      });
    }

    // --- fonts ----------------------------------------------------------------

    function stackOf(el) {
      return el ? win.getComputedStyle(el).fontFamily || '' : '';
    }

    function registerFonts(force) {
      var font = config.font;
      if (!font.enabled || !win.FontFace || !doc.fonts) return;
      var now = Date.now();
      if (!force && now - lastFontScan < 3000) return;
      lastFontScan = now;

      var textSamples = ['body', 'p', 'li', 'h1', 'h2', 'td', 'textarea', 'input', '[contenteditable]'];
      var textStacks = textSamples.map(function (sel) { return stackOf(doc.querySelector(sel)); });
      var codeStacks = ['code', 'pre', 'kbd', 'samp'].map(function (sel) { return stackOf(doc.querySelector(sel)); });
      var faces = fontFaces(font);
      if (!faces.length) return;

      pickFamilies(textStacks, codeStacks).forEach(function (family) {
        if (registered[family]) return;
        registered[family] = true;
        faces.forEach(function (spec) {
          var face = new win.FontFace(family, spec.src, {
            unicodeRange: ARABIC_SCRIPT_RANGE,
            weight: spec.weight,
            display: 'swap'
          });
          doc.fonts.add(face);
          if (face.load) face.load().catch(function () {});
        });
      });
    }

    function injectStyle() {
      if (doc.getElementById(STYLE_ID)) return;
      var style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = buildCss();
      (doc.head || doc.documentElement).appendChild(style);
    }

    // --- the loop ---------------------------------------------------------------

    function flush() {
      if (timer !== null) { cancel(timer); timer = null; }
      var nodes = Array.from(dirty);
      dirty.clear();
      nodes.forEach(function (n) { if (n.isConnected) scan(n); });
      guard(function () { registerFonts(false); });
    }

    function enqueue(node) {
      if (!node) return;
      dirty.add(node.nodeType === 1 ? node : node.parentElement);
      if (timer === null) timer = schedule(flush);
    }

    function onMutations(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === 'characterData') {
          enqueue(m.target);
        } else {
          enqueue(m.target);
          for (var j = 0; j < m.addedNodes.length; j++) enqueue(m.addedNodes[j]);
        }
      }
    }

    function start() {
      if (observer) return;
      api.running = true;
      guard(injectStyle);
      var body = doc.body || doc.documentElement;
      scan(body);
      guard(function () { registerFonts(true); });
      observer = new win.MutationObserver(function (m) { guard(function () { onMutations(m); }); });
      observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true });
    }

    function stop() {
      if (observer) observer.disconnect();
      observer = null;
      if (timer !== null) cancel(timer);
      timer = null;
      api.running = false;
    }

    return { start: start, stop: stop, flush: flush, scan: scan, config: config };
  }

  api.createController = createController;

  if (root.__PERSIAN_KIT_NO_AUTOSTART__) return;

  var controller = createController(root);
  api.controller = controller;
  if (root.document.readyState === 'loading') {
    root.document.addEventListener('DOMContentLoaded', function () { controller.start(); });
  } else {
    controller.start();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
/* PERSIAN-KIT:END */
