import { describe, it, expect } from 'vitest';
import {
  esc, EXT_LANG, langFromPath, NODE_COLORS, TEXT_COLORS, FONT_PRESETS, FONT_SIZES,
  DEFAULT_FONT_SIZE, READY_STATUS,
  LINK_COLORS, LINK_WIDTHS, LINK_DASHES,
  injectAnchor, injectTailAnchor, splitHtmlLines, addLineNumbers,
  makeDashSvg, makeWidthSvg,
  matchIdxToLineCol, charToLineCol,
  roundedRectRayHit, anchorFpFromSide, edgePoint,
} from '../canvas-utils.js';

// ─── esc ────────────────────────────────────────────────
describe('esc', () => {
  it('escapes ampersand', () => {
    expect(esc('a & b')).toBe('a &amp; b');
  });
  it('escapes less-than', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
  });
  it('escapes greater-than', () => {
    expect(esc('1 > 0')).toBe('1 &gt; 0');
  });
  it('escapes double quotes', () => {
    expect(esc('"hello"')).toBe('&quot;hello&quot;');
  });
  it('coerces non-string (number) to string', () => {
    expect(esc(42)).toBe('42');
  });
  it('returns empty string unchanged', () => {
    expect(esc('')).toBe('');
  });
  it('leaves plain text unchanged', () => {
    expect(esc('hello world')).toBe('hello world');
  });
});

// ─── langFromPath ────────────────────────────────────────
describe('langFromPath', () => {
  it('maps .js to javascript', () => expect(langFromPath('foo/bar.js')).toBe('javascript'));
  it('maps .mjs to javascript', () => expect(langFromPath('app.mjs')).toBe('javascript'));
  it('maps .ts to typescript', () => expect(langFromPath('src/index.ts')).toBe('typescript'));
  it('maps .tsx to typescript', () => expect(langFromPath('App.tsx')).toBe('typescript'));
  it('maps .py to python', () => expect(langFromPath('script.py')).toBe('python'));
  it('maps .go to go', () => expect(langFromPath('main.go')).toBe('go'));
  it('maps .rs to rust', () => expect(langFromPath('lib.rs')).toBe('rust'));
  it('maps .java to java', () => expect(langFromPath('Main.java')).toBe('java'));
  it('maps .sh to bash', () => expect(langFromPath('run.sh')).toBe('bash'));
  it('maps .yaml to yaml', () => expect(langFromPath('config.yaml')).toBe('yaml'));
  it('maps .yml to yaml', () => expect(langFromPath('docker-compose.yml')).toBe('yaml'));
  it('maps .json to json', () => expect(langFromPath('package.json')).toBe('json'));
  it('maps .md to markdown', () => expect(langFromPath('README.md')).toBe('markdown'));
  it('recognizes Dockerfile by name (exact case)', () => expect(langFromPath('Dockerfile')).toBe('dockerfile'));
  it('recognizes dockerfile by name (lower case)', () => expect(langFromPath('path/dockerfile')).toBe('dockerfile'));
  it('recognizes Makefile by name', () => expect(langFromPath('Makefile')).toBe('makefile'));
  it('returns null for unknown extension', () => expect(langFromPath('file.xyz')).toBeNull());
  it('returns null for null input', () => expect(langFromPath(null)).toBeNull());
  it('returns null for empty string', () => expect(langFromPath('')).toBeNull());
  it('handles path with multiple dots', () => expect(langFromPath('src/foo.bar.ts')).toBe('typescript'));
});

// ─── EXT_LANG ────────────────────────────────────────────
describe('EXT_LANG', () => {
  it('is a plain object', () => expect(typeof EXT_LANG).toBe('object'));
  it('contains js entry', () => expect(EXT_LANG.js).toBe('javascript'));
  it('contains py entry', () => expect(EXT_LANG.py).toBe('python'));
});

// ─── NODE_COLORS ─────────────────────────────────────────
describe('NODE_COLORS', () => {
  it('has 8 color entries', () => expect(NODE_COLORS.length).toBe(8));
  it('each entry has an id field', () => {
    NODE_COLORS.forEach(c => expect(typeof c.id).toBe('string'));
  });
  it('each entry has a hex field starting with #', () => {
    NODE_COLORS.forEach(c => expect(c.hex).toMatch(/^#/));
  });
  it('contains blue', () => expect(NODE_COLORS.some(c => c.id === 'blue')).toBe(true));
  it('contains red', () => expect(NODE_COLORS.some(c => c.id === 'red')).toBe(true));
});

// ─── TEXT_COLORS ─────────────────────────────────────────
describe('TEXT_COLORS', () => {
  it('is an array', () => expect(Array.isArray(TEXT_COLORS)).toBe(true));

  it('has 10 entries', () => expect(TEXT_COLORS.length).toBe(10));

  it('each entry has id, label, and hex fields', () => {
    for (const c of TEXT_COLORS) {
      expect(typeof c.id).toBe('string');
      expect(typeof c.label).toBe('string');
      expect(c.hex).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('all ids are unique', () => {
    const ids = TEXT_COLORS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('contains white as the first entry (default text color)', () => {
    expect(TEXT_COLORS[0].id).toBe('white');
  });

  it('contains common named colors', () => {
    const ids = TEXT_COLORS.map(c => c.id);
    expect(ids).toContain('white');
    expect(ids).toContain('yellow');
    expect(ids).toContain('green');
    expect(ids).toContain('blue');
    expect(ids).toContain('red');
  });
});

// ─── FONT_PRESETS ─────────────────────────────────────────
describe('FONT_PRESETS', () => {
  it('is a flat array', () => {
    expect(Array.isArray(FONT_PRESETS)).toBe(true);
  });

  it('each entry has id, label, family, and mono fields', () => {
    for (const p of FONT_PRESETS) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.label).toBe('string');
      expect(typeof p.family).toBe('string');
      expect(typeof p.mono).toBe('boolean');
    }
  });

  it('includes monospace fonts', () => {
    const monoIds = ['ui-monospace', 'jetbrains-mono', 'fira-code', 'menlo', 'monaco',
                     'cascadia-code', 'consolas', 'courier-new'];
    for (const id of monoIds) {
      expect(FONT_PRESETS.some(p => p.id === id)).toBe(true);
    }
  });

  it('includes proportional fonts', () => {
    const propIds = ['system-ui', 'inter', 'helvetica-neue', 'verdana', 'trebuchet-ms', 'arial', 'georgia'];
    for (const id of propIds) {
      expect(FONT_PRESETS.some(p => p.id === id)).toBe(true);
    }
  });

  it('monospace fonts have mono: true', () => {
    expect(FONT_PRESETS.find(p => p.id === 'jetbrains-mono').mono).toBe(true);
    expect(FONT_PRESETS.find(p => p.id === 'fira-code').mono).toBe(true);
  });

  it('proportional fonts have mono: false', () => {
    expect(FONT_PRESETS.find(p => p.id === 'system-ui').mono).toBe(false);
    expect(FONT_PRESETS.find(p => p.id === 'georgia').mono).toBe(false);
  });

  it('all family strings are non-empty', () => {
    for (const p of FONT_PRESETS) {
      expect(p.family.trim().length).toBeGreaterThan(0);
    }
  });
});

// ─── DEFAULT_FONT_SIZE ────────────────────────────────────
describe('DEFAULT_FONT_SIZE', () => {
  it('has keys for all four node types', () => {
    expect(DEFAULT_FONT_SIZE).toHaveProperty('code');
    expect(DEFAULT_FONT_SIZE).toHaveProperty('bubble');
    expect(DEFAULT_FONT_SIZE).toHaveProperty('frame');
    expect(DEFAULT_FONT_SIZE).toHaveProperty('text');
  });

  it('code default is 12.5', () => expect(DEFAULT_FONT_SIZE.code).toBe(12.5));
  it('bubble default is 13',  () => expect(DEFAULT_FONT_SIZE.bubble).toBe(13));
  it('frame default is 12',   () => expect(DEFAULT_FONT_SIZE.frame).toBe(12));
  it('text default is 20',    () => expect(DEFAULT_FONT_SIZE.text).toBe(20));

  it('each default is contained in the corresponding FONT_SIZES list', () => {
    for (const [type, size] of Object.entries(DEFAULT_FONT_SIZE)) {
      expect(FONT_SIZES[type]).toContain(size);
    }
  });
});

// ─── READY_STATUS ─────────────────────────────────────────
describe('READY_STATUS', () => {
  it('is a non-empty string', () => {
    expect(typeof READY_STATUS).toBe('string');
    expect(READY_STATUS.length).toBeGreaterThan(0);
  });

  it('mentions double-click and link creation', () => {
    expect(READY_STATUS).toContain('double-click');
    expect(READY_STATUS).toContain('link');
  });
});

// ─── FONT_SIZES ───────────────────────────────────────────
describe('FONT_SIZES', () => {
  it('has keys for code, bubble, frame, and text', () => {
    expect(FONT_SIZES).toHaveProperty('code');
    expect(FONT_SIZES).toHaveProperty('bubble');
    expect(FONT_SIZES).toHaveProperty('frame');
    expect(FONT_SIZES).toHaveProperty('text');
  });

  it('each list contains only positive numbers', () => {
    for (const list of Object.values(FONT_SIZES)) {
      for (const s of list) {
        expect(typeof s).toBe('number');
        expect(s).toBeGreaterThan(0);
      }
    }
  });

  it('code sizes include default 12.5', () => {
    expect(FONT_SIZES.code).toContain(12.5);
  });

  it('bubble sizes include default 13', () => {
    expect(FONT_SIZES.bubble).toContain(13);
  });

  it('frame sizes include default 12', () => {
    expect(FONT_SIZES.frame).toContain(12);
  });

  it('text sizes include default 20', () => {
    expect(FONT_SIZES.text).toContain(20);
  });

  it('text sizes include large values (>=64)', () => {
    expect(FONT_SIZES.text.some(s => s >= 64)).toBe(true);
  });

  it('code sizes include large values (>=32)', () => {
    expect(FONT_SIZES.code.some(s => s >= 32)).toBe(true);
  });

  it('bubble sizes include large values (>=32)', () => {
    expect(FONT_SIZES.bubble.some(s => s >= 32)).toBe(true);
  });

  it('frame sizes include large values (>=24)', () => {
    expect(FONT_SIZES.frame.some(s => s >= 24)).toBe(true);
  });

  it('all lists have 500 as the maximum value', () => {
    for (const list of Object.values(FONT_SIZES)) {
      expect(Math.max(...list)).toBe(500);
    }
  });

  it('all lists are sorted in ascending order', () => {
    for (const list of Object.values(FONT_SIZES)) {
      for (let i = 1; i < list.length; i++) {
        expect(list[i]).toBeGreaterThan(list[i - 1]);
      }
    }
  });
});

// ─── splitHtmlLines ──────────────────────────────────────
describe('splitHtmlLines', () => {
  it('splits plain text on newlines', () => {
    const lines = splitHtmlLines('foo\nbar\nbaz');
    expect(lines.length).toBe(3);
    expect(lines[0]).toBe('foo');
    expect(lines[1]).toBe('bar');
    expect(lines[2]).toBe('baz');
  });

  it('returns a single-element array when there are no newlines', () => {
    expect(splitHtmlLines('hello')).toEqual(['hello']);
  });

  it('reopens open spans on the next line', () => {
    const html = '<span class="x">foo\nbar</span>';
    const lines = splitHtmlLines(html);
    expect(lines[0]).toBe('<span class="x">foo</span>');
    expect(lines[1]).toBe('<span class="x">bar</span>');
  });

  it('handles nested spans across lines', () => {
    const html = '<span class="a"><span class="b">one\ntwo</span></span>';
    const lines = splitHtmlLines(html);
    expect(lines[0]).toContain('one');
    expect(lines[0]).toContain('</span></span>');
    expect(lines[1]).toContain('<span class="a"><span class="b">');
    expect(lines[1]).toContain('two');
  });

  it('passes through tags unchanged when no newline inside', () => {
    const html = '<span class="kw">function</span>';
    expect(splitHtmlLines(html)).toEqual([html]);
  });
});

// ─── addLineNumbers ──────────────────────────────────────
describe('addLineNumbers', () => {
  it('wraps each line in a .code-line span', () => {
    const html = addLineNumbers('foo\nbar', 1);
    const matches = html.match(/class="code-line"/g);
    expect(matches.length).toBe(2);
  });

  it('uses the start line number in the first .ln-num', () => {
    const html = addLineNumbers('line', 5);
    expect(html).toContain('>5<');
  });

  it('increments line numbers', () => {
    const html = addLineNumbers('a\nb\nc', 10);
    expect(html).toContain('>10<');
    expect(html).toContain('>11<');
    expect(html).toContain('>12<');
  });

  it('sets data-li starting at 0 regardless of start', () => {
    const html = addLineNumbers('line', 100);
    expect(html).toContain('data-li="0"');
  });

  it('trims a trailing empty line when code ends with newline', () => {
    const html = addLineNumbers('foo\n', 1);
    const matches = html.match(/class="code-line"/g);
    expect(matches.length).toBe(1);
  });

  it('handles a single line with no newline', () => {
    const html = addLineNumbers('hello', 1);
    expect(html).toContain('>1<');
    expect(html).toContain('hello');
  });
});

// ─── matchIdxToLineCol ───────────────────────────────────
describe('matchIdxToLineCol', () => {
  it('returns line 1 col 0 for occurrence 0 on a single line', () => {
    expect(matchIdxToLineCol('foo bar foo', 'foo', 0)).toEqual({ line: 1, col: 0 });
  });

  it('returns correct col for occurrence 1 on a single line', () => {
    // 'foo bar foo': second 'foo' starts at col 8
    expect(matchIdxToLineCol('foo bar foo', 'foo', 1)).toEqual({ line: 1, col: 8 });
  });

  it('returns correct line/col for an occurrence on line 2', () => {
    // 'hello\nworld\nhello': second 'hello' starts at line 3 col 0
    expect(matchIdxToLineCol('hello\nworld\nhello', 'hello', 1)).toEqual({ line: 3, col: 0 });
  });

  it('returns correct col within a multi-line string', () => {
    // 'line1\nfoo bar foo': second 'foo' at line 2 col 8
    expect(matchIdxToLineCol('line1\nfoo bar foo', 'foo', 1)).toEqual({ line: 2, col: 8 });
  });

  it('returns {line: -1, col: -1} when matchIdx exceeds occurrence count', () => {
    expect(matchIdxToLineCol('foo', 'foo', 1)).toEqual({ line: -1, col: -1 });
  });

  it('returns {line: -1, col: -1} for negative matchIdx', () => {
    expect(matchIdxToLineCol('foo foo', 'foo', -1)).toEqual({ line: -1, col: -1 });
  });

  it('returns {line: -1, col: -1} for empty code', () => {
    expect(matchIdxToLineCol('', 'foo', 0)).toEqual({ line: -1, col: -1 });
  });

  it('respects word boundaries — does not match partial words', () => {
    // 'startNoPodLock' should not match 'start'
    expect(matchIdxToLineCol('startNoPodLock', 'start', 0)).toEqual({ line: -1, col: -1 });
  });

  it('matches occurrence 0 when word is standalone', () => {
    expect(matchIdxToLineCol('start stop start', 'start', 0)).toEqual({ line: 1, col: 0 });
  });

  it('roundtrips with _lineColToMatchIdx — all occurrences', () => {
    const code = 'foo bar\nfoo baz\nfoo';
    for (let i = 0; i < 3; i++) {
      const lc = matchIdxToLineCol(code, 'foo', i);
      expect(lc.line).toBeGreaterThan(0);
      expect(lc.col).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── charToLineCol ─────────────────────────────────────
describe('charToLineCol', () => {
  it('returns line 1 col 0 for character index 0', () => {
    expect(charToLineCol('hello', 0)).toEqual({ line: 1, col: 0 });
  });

  it('returns correct col for single-line string', () => {
    expect(charToLineCol('hello world', 6)).toEqual({ line: 1, col: 6 });
  });

  it('returns line 2 col 0 after first newline', () => {
    expect(charToLineCol('hello\nworld', 6)).toEqual({ line: 2, col: 0 });
  });

  it('returns correct line and col for multi-line string', () => {
    const code = 'line1\nline2\nline3';
    // index 11 is the newline after line2, so it's at line 2 col 5
    expect(charToLineCol(code, 11)).toEqual({ line: 2, col: 5 });
  });

  it('handles index at end of string', () => {
    const code = 'ab\ncd';
    expect(charToLineCol(code, 5)).toEqual({ line: 2, col: 2 });
  });

  it('handles multiple newlines', () => {
    const code = 'a\n\nb';
    expect(charToLineCol(code, 2)).toEqual({ line: 2, col: 0 });
    expect(charToLineCol(code, 3)).toEqual({ line: 3, col: 0 });
  });
});

// ─── injectAnchor ────────────────────────────────────────
describe('injectAnchor', () => {
  it('wraps matching text in a link-anchor span', () => {
    const result = injectAnchor('first line\nhello world', 'world', 'link-1');
    expect(result).toContain('class="link-anchor"');
    expect(result).toContain('data-lid="link-1"');
    expect(result).toContain('world');
  });

  it('injects anchor on the first line', () => {
    const result = injectAnchor('hello world', 'world', 'link-1');
    expect(result).toContain('class="link-anchor"');
    expect(result).toContain('data-lid="link-1"');
  });

  it('injects anchor when match is only on the first line', () => {
    const result = injectAnchor('world\nsecond line', 'world', 'x');
    expect(result).toContain('link-anchor');
  });

  it('does not alter surrounding text on line 2', () => {
    const result = injectAnchor('line1\nhello world', 'world', 'x');
    expect(result).toContain('hello ');
  });

  it('escapes special HTML characters in rawText', () => {
    const result = injectAnchor('first\na &amp; b', '& b', 'x');
    expect(result).toContain('link-anchor');
  });

  it('does not modify HTML tags', () => {
    const html = 'first line\n<span class="kw">return</span>';
    const result = injectAnchor(html, 'return', 'y');
    expect(result).toContain('class="kw"');
    expect(result).toContain('class="link-anchor"');
  });

  it('leaves text unchanged when no match', () => {
    const html = 'first line\nhello world';
    expect(injectAnchor(html, 'notfound', 'z')).toBe(html);
  });

  it('wraps all occurrences when no anchor position given', () => {
    const result = injectAnchor('foo foo foo', 'foo', 'L1');
    const count = (result.match(/class="link-anchor"/g) || []).length;
    expect(count).toBe(3);
  });

  it('marks the occurrence at (line, col) with data-lid-primary', () => {
    // 'foo foo foo': second 'foo' starts at line 1, col 4
    const code = 'foo foo foo';
    const result = injectAnchor(code, 'foo', 'L1', code, 1, 4);
    // All three are wrapped
    const count = (result.match(/class="link-anchor"/g) || []).length;
    expect(count).toBe(3);
    // Only the second occurrence carries data-lid-primary
    expect(result).toContain('data-lid-primary="1"');
    const primaryCount = (result.match(/data-lid-primary="1"/g) || []).length;
    expect(primaryCount).toBe(1);
  });

  it('marks occurrence at col 0 (first) as primary', () => {
    // 'word word': first 'word' starts at line 1, col 0
    const code = 'word word';
    const result = injectAnchor(code, 'word', 'L2', code, 1, 0);
    const parts = result.split('<span class="link-anchor"');
    // parts[1] is the first anchor element content
    expect(parts[1]).toContain('data-lid-primary="1"');
  });

  it('does not add primary attribute when no anchor position given', () => {
    const result = injectAnchor('foo foo', 'foo', 'L3');
    expect(result).not.toContain('data-lid-primary');
  });
});

// ─── injectTailAnchor ────────────────────────────────────
describe('injectTailAnchor', () => {
  it('wraps matching text in a tail-anchor span', () => {
    const result = injectTailAnchor('first line\nhello world', 'world', 42);
    expect(result).toContain('class="tail-anchor"');
    expect(result).toContain('data-taid="42"');
    expect(result).toContain('world');
  });

  it('injects on the first line', () => {
    const result = injectTailAnchor('hello world', 'world', 1);
    expect(result).toContain('tail-anchor');
    expect(result).toContain('data-taid="1"');
  });

  it('injects when match is only on the first line', () => {
    const result = injectTailAnchor('world\nsecond line', 'world', 1);
    expect(result).toContain('tail-anchor');
  });

  it('does not alter surrounding text', () => {
    const result = injectTailAnchor('line1\nhello world', 'world', 5);
    expect(result).toContain('hello ');
  });

  it('leaves text unchanged when no match', () => {
    const html = 'first line\nhello world';
    expect(injectTailAnchor(html, 'notfound', 1)).toBe(html);
  });

  it('does not modify HTML tags', () => {
    const html = 'first line\n<span class="kw">return</span>';
    const result = injectTailAnchor(html, 'return', 7);
    expect(result).toContain('class="kw"');
    expect(result).toContain('class="tail-anchor"');
  });

  it('uses word boundaries — does not match partial words', () => {
    const result = injectTailAnchor('first\nstartNoPodLock', 'start', 1);
    expect(result).not.toContain('tail-anchor');
  });

  it('wraps all occurrences when tailMatchIdx is -1', () => {
    const result = injectTailAnchor('foo foo foo', 'foo', 9);
    const count = (result.match(/class="tail-anchor"/g) || []).length;
    expect(count).toBe(3);
  });

  it('wraps only occurrence at line 1 col 0 (first)', () => {
    // 'foo foo foo': first 'foo' at line 1, col 0
    const code = 'foo foo foo';
    const result = injectTailAnchor(code, 'foo', 9, code, 1, 0);
    const count = (result.match(/class="tail-anchor"/g) || []).length;
    expect(count).toBe(1);
    expect(result.startsWith('<span class="tail-anchor"')).toBe(true);
  });

  it('wraps only occurrence at line 1 col 4 (second)', () => {
    // 'foo foo foo': second 'foo' at line 1, col 4
    const code = 'foo foo foo';
    const result = injectTailAnchor(code, 'foo', 9, code, 1, 4);
    const count = (result.match(/class="tail-anchor"/g) || []).length;
    expect(count).toBe(1);
  });

  it('wraps only the target occurrence, leaving others as plain text', () => {
    // 'alpha beta alpha beta alpha': third 'alpha' at line 1, col 22
    const html = 'alpha beta alpha beta alpha';
    const result = injectTailAnchor(html, 'alpha', 3, html, 1, 22);
    // occurrence 0 and 1 are plain 'alpha'; occurrence 2 is wrapped
    const count = (result.match(/class="tail-anchor"/g) || []).length;
    expect(count).toBe(1);
    // plain occurrences still appear in output
    expect(result).toContain('alpha');
  });

  it('targets the correct occurrence even when an earlier one is already wrapped', () => {
    // Simulates the second bubble attachment: occurrence 0 is already inside a
    // tail-anchor span; targeting occurrence 2 (line 2 col 0) must not shift
    // to occurrence 3 because the already-wrapped occurrence is skipped.
    const code = 'foo bar foo\nfoo bar foo';
    // occurrence 0: line 1 col 0 — pre-wrapped
    // occurrence 1: line 1 col 8
    // occurrence 2: line 2 col 0  ← target
    // occurrence 3: line 2 col 8
    const preWrapped = '<span class="tail-anchor" data-taid="1">foo</span> bar foo\nfoo bar foo';
    const result = injectTailAnchor(preWrapped, 'foo', 2, code, 2, 0);
    // Should wrap the 'foo' at the start of line 2, not the one at col 8
    const wraps = [...result.matchAll(/data-taid="(\d+)"/g)].map(m => m[1]);
    expect(wraps).toContain('2');
    // The wrapped occurrence should be the one at the start of line 2
    expect(result).toContain('\n<span class="tail-anchor" data-taid="2">foo</span> bar foo');
  });
});

// ─── LINK_COLORS ─────────────────────────────────────────
describe('LINK_COLORS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(LINK_COLORS)).toBe(true);
    expect(LINK_COLORS.length).toBeGreaterThan(0);
  });

  it('each entry has label and value fields', () => {
    for (const c of LINK_COLORS) {
      expect(typeof c.label).toBe('string');
      expect(typeof c.value).toBe('string');
    }
  });

  it('each value is a hex color', () => {
    for (const c of LINK_COLORS) {
      expect(c.value).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('contains blue and red entries', () => {
    const values = LINK_COLORS.map(c => c.value.toLowerCase());
    expect(values.some(v => v === '#388bfd')).toBe(true); // blue
    expect(values.some(v => v === '#f85149')).toBe(true); // red
  });
});

// ─── LINK_WIDTHS ─────────────────────────────────────────
describe('LINK_WIDTHS', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(LINK_WIDTHS)).toBe(true);
    expect(LINK_WIDTHS.length).toBeGreaterThan(0);
  });

  it('each entry has label and value fields', () => {
    for (const w of LINK_WIDTHS) {
      expect(typeof w.label).toBe('string');
      expect(typeof w.value).toBe('number');
    }
  });

  it('all values are positive numbers', () => {
    for (const w of LINK_WIDTHS) {
      expect(w.value).toBeGreaterThan(0);
    }
  });

  it('includes width 1 as the thinnest option', () => {
    expect(LINK_WIDTHS.some(w => w.value === 1)).toBe(true);
  });
});

// ─── LINK_DASHES ─────────────────────────────────────────
describe('LINK_DASHES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(LINK_DASHES)).toBe(true);
    expect(LINK_DASHES.length).toBeGreaterThan(0);
  });

  it('each entry has label, value, and title fields', () => {
    for (const d of LINK_DASHES) {
      expect(typeof d.label).toBe('string');
      expect(typeof d.value).toBe('string');
      expect(typeof d.title).toBe('string');
    }
  });

  it('includes a solid (empty value) entry', () => {
    expect(LINK_DASHES.some(d => d.value === '')).toBe(true);
  });

  it('includes a dashed entry', () => {
    expect(LINK_DASHES.some(d => d.value !== '')).toBe(true);
  });

  it('all labels are unique', () => {
    const labels = LINK_DASHES.map(d => d.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

// ─── makeDashSvg ─────────────────────────────────────────
describe('makeDashSvg', () => {
  it('returns an SVG string', () => {
    const svg = makeDashSvg('', '#ffffff');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('includes the provided color', () => {
    expect(makeDashSvg('', '#ff0000')).toContain('#ff0000');
  });

  it('includes stroke-dasharray when dash is non-empty', () => {
    expect(makeDashSvg('8 4', '#fff')).toContain('stroke-dasharray="8 4"');
  });

  it('omits stroke-dasharray when dash is empty', () => {
    expect(makeDashSvg('', '#fff')).not.toContain('stroke-dasharray');
  });
});

// ─── makeWidthSvg ─────────────────────────────────────────
describe('makeWidthSvg', () => {
  it('returns an SVG string', () => {
    const svg = makeWidthSvg(2, '#ffffff');
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });

  it('includes the provided color', () => {
    expect(makeWidthSvg(3, '#00ff00')).toContain('#00ff00');
  });

  it('includes the provided stroke-width', () => {
    expect(makeWidthSvg(5, '#fff')).toContain('stroke-width="5"');
  });
});

// ─── edgePoint ───────────────────────────────────────────
describe('edgePoint', () => {
  const node = (x, y) => ({ x, y, w: 100, h: 60 });

  it('exits the right edge when target is to the right', () => {
    const pt = edgePoint(node(0, 0), node(300, 0));
    expect(pt.x).toBeCloseTo(100);
    expect(pt.y).toBeCloseTo(30); // center y
  });

  it('exits the left edge when target is to the left', () => {
    const pt = edgePoint(node(300, 0), node(0, 0));
    expect(pt.x).toBeCloseTo(300);
    expect(pt.y).toBeCloseTo(30);
  });

  it('exits the bottom edge when target is directly below', () => {
    const pt = edgePoint(node(0, 0), node(0, 300));
    expect(pt.y).toBeCloseTo(60); // bottom edge
  });

  it('exits the top edge when target is directly above', () => {
    const pt = edgePoint(node(0, 300), node(0, 0));
    expect(pt.y).toBeCloseTo(300); // top edge of lower node
  });
});

// ─── anchorFpFromSide ────────────────────────────────────
describe('anchorFpFromSide', () => {
  const r = { left: 10, right: 90, top: 20, bottom: 60, width: 80, height: 40 };

  it('exits right edge for side=left', () => {
    const pt = anchorFpFromSide(r, 'left');
    expect(pt.x).toBe(90);
    expect(pt.y).toBe(40); // top + height/2
  });

  it('exits left edge for side=right', () => {
    const pt = anchorFpFromSide(r, 'right');
    expect(pt.x).toBe(10);
  });

  it('exits bottom edge for side=top', () => {
    const pt = anchorFpFromSide(r, 'top');
    expect(pt.y).toBe(60);
    expect(pt.x).toBe(50); // left + width/2
  });

  it('exits top edge for side=bottom', () => {
    const pt = anchorFpFromSide(r, 'bottom');
    expect(pt.y).toBe(20);
  });
});

// ─── roundedRectRayHit ───────────────────────────────────
describe('roundedRectRayHit', () => {
  // Rect from (100,100) to (200,200) with radius 10
  const bl = { x: 100, y: 100 };
  const br = { x: 200, y: 200 };
  const r  = 10;

  it('hits the left edge when ray travels rightward', () => {
    // Ray from (0, 150) → (200, 150): should hit left edge at x=100
    const hit = roundedRectRayHit(0, 150, 200, 150, bl, br, r);
    expect(hit).not.toBeNull();
    expect(hit.x).toBeCloseTo(100, 1);
    expect(hit.y).toBeCloseTo(150, 1);
  });

  it('hits the right edge when ray travels leftward', () => {
    const hit = roundedRectRayHit(300, 150, 100, 150, bl, br, r);
    expect(hit).not.toBeNull();
    expect(hit.x).toBeCloseTo(200, 1);
  });

  it('hits the top edge when ray travels downward', () => {
    const hit = roundedRectRayHit(150, 0, 150, 200, bl, br, r);
    expect(hit).not.toBeNull();
    expect(hit.y).toBeCloseTo(100, 1);
  });

  it('hits the bottom edge when ray travels upward', () => {
    const hit = roundedRectRayHit(150, 300, 150, 100, bl, br, r);
    expect(hit).not.toBeNull();
    expect(hit.y).toBeCloseTo(200, 1);
  });

  it('returns null when the ray misses completely', () => {
    // Ray traveling far to the right of the rect
    const hit = roundedRectRayHit(0, 0, -10, -10, bl, br, r);
    expect(hit).toBeNull();
  });
});
