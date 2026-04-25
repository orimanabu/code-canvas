import { describe, it, expect } from 'vitest';
import {
  esc, EXT_LANG, langFromPath, NODE_COLORS, FONT_PRESETS, FONT_SIZES,
  injectAnchor, splitHtmlLines, addLineNumbers,
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

// ─── FONT_PRESETS ─────────────────────────────────────────
describe('FONT_PRESETS', () => {
  it('has keys for code, bubble, and frame', () => {
    expect(FONT_PRESETS).toHaveProperty('code');
    expect(FONT_PRESETS).toHaveProperty('bubble');
    expect(FONT_PRESETS).toHaveProperty('frame');
  });

  it('each preset entry has id, label, and family fields', () => {
    for (const list of Object.values(FONT_PRESETS)) {
      for (const p of list) {
        expect(typeof p.id).toBe('string');
        expect(typeof p.label).toBe('string');
        expect(typeof p.family).toBe('string');
      }
    }
  });

  it('first code preset has id "default"', () => {
    expect(FONT_PRESETS.code[0].id).toBe('default');
  });

  it('first bubble preset has id "default"', () => {
    expect(FONT_PRESETS.bubble[0].id).toBe('default');
  });

  it('first frame preset has id "default"', () => {
    expect(FONT_PRESETS.frame[0].id).toBe('default');
  });

  it('code presets include JetBrains Mono', () => {
    expect(FONT_PRESETS.code.some(p => p.id === 'jetbrains-mono')).toBe(true);
  });

  it('code presets include Fira Code', () => {
    expect(FONT_PRESETS.code.some(p => p.id === 'fira-code')).toBe(true);
  });

  it('all family strings are non-empty', () => {
    for (const list of Object.values(FONT_PRESETS)) {
      for (const p of list) {
        expect(p.family.trim().length).toBeGreaterThan(0);
      }
    }
  });
});

// ─── FONT_SIZES ───────────────────────────────────────────
describe('FONT_SIZES', () => {
  it('has keys for code, bubble, and frame', () => {
    expect(FONT_SIZES).toHaveProperty('code');
    expect(FONT_SIZES).toHaveProperty('bubble');
    expect(FONT_SIZES).toHaveProperty('frame');
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

  it('code sizes include large values (>=32)', () => {
    expect(FONT_SIZES.code.some(s => s >= 32)).toBe(true);
  });

  it('bubble sizes include large values (>=32)', () => {
    expect(FONT_SIZES.bubble.some(s => s >= 32)).toBe(true);
  });

  it('frame sizes include large values (>=24)', () => {
    expect(FONT_SIZES.frame.some(s => s >= 24)).toBe(true);
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

// ─── injectAnchor ────────────────────────────────────────
describe('injectAnchor', () => {
  it('wraps matching text on line 2+ in a link-anchor span', () => {
    const result = injectAnchor('first line\nhello world', 'world', 'link-1');
    expect(result).toContain('class="link-anchor"');
    expect(result).toContain('data-lid="link-1"');
    expect(result).toContain('world');
  });

  it('does not inject anchor on the first line', () => {
    const result = injectAnchor('hello world', 'world', 'link-1');
    expect(result).not.toContain('class="link-anchor"');
    expect(result).toBe('hello world');
  });

  it('does not inject anchor when match is only on the first line', () => {
    const result = injectAnchor('world\nsecond line', 'world', 'x');
    expect(result).not.toContain('link-anchor');
    expect(result.startsWith('world\n')).toBe(true);
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
