// ═══════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════
export const DATA_VERSION = '3.2';

// ═══════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════
// HIGHLIGHT HELPERS
// ═══════════════════════════════════════════════════════
export const EXT_LANG = {
  js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript', mts: 'typescript', cts: 'typescript',
  tsx: 'typescript',
  py: 'python', pyw: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  c: 'cpp', h: 'cpp',
  cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', hxx: 'cpp',
  cs: 'csharp',
  java: 'java',
  kt: 'kotlin', kts: 'kotlin',
  swift: 'swift',
  sh: 'bash', bash: 'bash', zsh: 'bash', fish: 'bash',
  html: 'html', htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  json: 'json',
  yaml: 'yaml', yml: 'yaml',
  toml: 'ini',
  xml: 'xml',
  md: 'markdown', markdown: 'markdown',
  sql: 'sql',
  r: 'r',
  lua: 'lua',
  php: 'php',
  pl: 'perl',
  ex: 'elixir', exs: 'elixir',
  erl: 'erlang',
  hs: 'haskell',
  scala: 'scala',
  dart: 'dart',
  makefile: 'makefile',
  dockerfile: 'dockerfile',
};

export function langFromPath(filePath) {
  if (!filePath) return null;
  const base = filePath.split('/').pop();
  // Files without extension, e.g. Dockerfile, Makefile
  const nameLower = base.toLowerCase();
  if (nameLower === 'dockerfile') return 'dockerfile';
  if (nameLower === 'makefile')   return 'makefile';
  const ext = base.includes('.') ? base.split('.').pop().toLowerCase() : null;
  return ext ? (EXT_LANG[ext] ?? null) : null;
}

// ═══════════════════════════════════════════════════════
// COLOR PALETTE
// ═══════════════════════════════════════════════════════
export const NODE_COLORS = [
  { id: 'blue',   label: 'Blue',   hex: '#388bfd', hexLight: '#79c0ff', bgDark: '#0d1f40', bgMid: '#122040', borderMid: '#1b3f7a', titleBg: 'rgba(56,139,253,0.15)',  glow28: 'rgba(56,139,253,0.28)',  glow42: 'rgba(56,139,253,0.42)' },
  { id: 'green',  label: 'Green',  hex: '#3fb950', hexLight: '#56d364', bgDark: '#162116', bgMid: '#1b2e1b', borderMid: '#2d4a2d', titleBg: 'rgba(63,185,80,0.15)',   glow28: 'rgba(63,185,80,0.28)',   glow42: 'rgba(63,185,80,0.42)' },
  { id: 'purple', label: 'Purple', hex: '#a371f7', hexLight: '#bc8cff', bgDark: '#1a1035', bgMid: '#211444', borderMid: '#3d2870', titleBg: 'rgba(163,113,247,0.15)', glow28: 'rgba(163,113,247,0.28)', glow42: 'rgba(163,113,247,0.42)' },
  { id: 'orange', label: 'Orange', hex: '#f0883e', hexLight: '#ffa657', bgDark: '#291608', bgMid: '#33190a', borderMid: '#5c3612', titleBg: 'rgba(240,136,62,0.15)',  glow28: 'rgba(240,136,62,0.28)',  glow42: 'rgba(240,136,62,0.42)' },
  { id: 'yellow', label: 'Yellow', hex: '#e3b341', hexLight: '#f2c55a', bgDark: '#231a05', bgMid: '#2c2107', borderMid: '#4a3a0e', titleBg: 'rgba(227,179,65,0.15)',  glow28: 'rgba(227,179,65,0.28)',  glow42: 'rgba(227,179,65,0.42)' },
  { id: 'red',    label: 'Red',    hex: '#f85149', hexLight: '#ff7b72', bgDark: '#290d0c', bgMid: '#361110', borderMid: '#6a2020', titleBg: 'rgba(248,81,73,0.15)',   glow28: 'rgba(248,81,73,0.28)',   glow42: 'rgba(248,81,73,0.42)' },
  { id: 'cyan',   label: 'Cyan',   hex: '#39c5cf', hexLight: '#56d4dd', bgDark: '#061a1d', bgMid: '#092227', borderMid: '#144a50', titleBg: 'rgba(57,197,207,0.15)',  glow28: 'rgba(57,197,207,0.28)',  glow42: 'rgba(57,197,207,0.42)' },
  { id: 'pink',   label: 'Pink',   hex: '#f778ba', hexLight: '#ff9ed2', bgDark: '#29091b', bgMid: '#360d24', borderMid: '#6a2050', titleBg: 'rgba(247,120,186,0.15)', glow28: 'rgba(247,120,186,0.28)', glow42: 'rgba(247,120,186,0.42)' },
];

// ═══════════════════════════════════════════════════════
// FONT PRESETS
// ═══════════════════════════════════════════════════════
// Flat list shared by all node types.
// mono: true = monospace, false = proportional.
// 'default' (id only) is handled contextually in applyNodeFont — no family here.
export const FONT_PRESETS = [
  // ── Monospace ──────────────────────────────────────────
  { id: 'ui-monospace',   label: 'System Mono',    mono: true,  family: "ui-monospace, 'SF Mono', 'Cascadia Code', 'Menlo', monospace" },
  { id: 'source-code-pro',label: 'Source Code Pro',mono: true,  family: "'Source Code Pro', 'Menlo', 'Cascadia Mono', 'Consolas', 'DejaVu Sans Mono', 'Liberation Mono', 'Ubuntu Mono', monospace" },
  { id: 'jetbrains-mono', label: 'JetBrains Mono', mono: true,  family: "'JetBrains Mono', monospace" },
  { id: 'fira-code',      label: 'Fira Code',      mono: true,  family: "'Fira Code', monospace" },
  { id: 'menlo',          label: 'Menlo',           mono: true,  family: "'Menlo', monospace" },
  { id: 'monaco',         label: 'Monaco',          mono: true,  family: "'Monaco', 'Menlo', monospace" },
  { id: 'cascadia-code',  label: 'Cascadia Code',   mono: true,  family: "'Cascadia Code', 'Cascadia Mono', monospace" },
  { id: 'consolas',       label: 'Consolas',        mono: true,  family: "'Consolas', monospace" },
  { id: 'courier-new',    label: 'Courier New',     mono: true,  family: "'Courier New', Courier, monospace" },
  // ── Proportional ───────────────────────────────────────
  { id: 'system-ui',      label: 'System UI',       mono: false, family: "system-ui, sans-serif" },
  { id: 'inter',          label: 'Inter',           mono: false, family: "'Inter', sans-serif" },
  { id: 'helvetica-neue', label: 'Helvetica Neue',  mono: false, family: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: 'verdana',        label: 'Verdana',         mono: false, family: "'Verdana', sans-serif" },
  { id: 'trebuchet-ms',   label: 'Trebuchet MS',    mono: false, family: "'Trebuchet MS', sans-serif" },
  { id: 'arial',          label: 'Arial',           mono: false, family: "'Arial', sans-serif" },
  { id: 'georgia',        label: 'Georgia',         mono: false, family: "'Georgia', serif" },
];
export const FONT_SIZES = {
  code:   [10, 11, 12, 12.5, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 96, 128, 192, 256, 384, 500],
  bubble: [11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 96, 128, 192, 256, 384, 500],
  frame:  [10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 96, 128, 192, 256, 384, 500],
  text:   [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 56, 64, 72, 96, 128, 192, 256, 384, 500],
};
export const DEFAULT_FONT_SIZE = { code: 12.5, bubble: 13, text: 20, frame: 12 };

// ═══════════════════════════════════════════════════════
// TEXT NODE COLORS
// ═══════════════════════════════════════════════════════
// Bright colors readable on the dark canvas background.
export const TEXT_COLORS = [
  { id: 'white',  label: 'White',  hex: '#e6edf3' },
  { id: 'yellow', label: 'Yellow', hex: '#f2c55a' },
  { id: 'green',  label: 'Green',  hex: '#56d364' },
  { id: 'blue',   label: 'Blue',   hex: '#79c0ff' },
  { id: 'purple', label: 'Purple', hex: '#bc8cff' },
  { id: 'red',    label: 'Red',    hex: '#ff7b72' },
  { id: 'orange', label: 'Orange', hex: '#ffa657' },
  { id: 'cyan',   label: 'Cyan',   hex: '#56d4dd' },
  { id: 'pink',   label: 'Pink',   hex: '#ff9ed2' },
  { id: 'gray',   label: 'Gray',   hex: '#8b949e' },
];

// Shared core for injectAnchor and injectTailAnchor.
// Walks `html` split on HTML tags, tracking anchor nesting via `insidePattern`.
// `buildSpan(idx)` returns the replacement HTML string for the idx-th match.
// When `targetIdx >= 0`, only the occurrence at that index is wrapped; all
// others are emitted as plain text. Pass -1 to wrap every occurrence.
function _injectSpans(html, re, insidePattern, buildSpan, targetIdx = -1) {
  const parts = html.split(/(<[^>]*>)/);
  let insideAnchor = false;
  let matchCount = 0;

  // Count matches without replacing — keeps matchCount in sync with raw-code
  // occurrence indices even for text inside already-anchored spans.
  function countSegment(str) {
    const cre = new RegExp(re.source, re.flags);
    while (cre.exec(str) !== null) matchCount++;
  }

  function replaceSegment(str) {
    const cre = new RegExp(re.source, re.flags);
    let out = '', last = 0, m;
    while ((m = cre.exec(str)) !== null) {
      out += str.slice(last, m.index);
      if (targetIdx < 0 || matchCount === targetIdx) {
        out += buildSpan(matchCount);
      } else {
        out += m[0]; // emit original text unchanged
      }
      matchCount++;
      last = m.index + m[0].length;
    }
    return out + str.slice(last);
  }

  return parts.map((p, i) => {
    if (i % 2 === 1) { // tag segment
      if (insidePattern.test(p)) insideAnchor = true;
      else if (p === '</span>' && insideAnchor) insideAnchor = false;
      return p;
    }
    if (insideAnchor) { countSegment(p); return p; }
    return replaceSegment(p);
  }).join('');
}

// Converts a 0-based occurrence index of rawText in code to {line, col}.
// Uses the same word-boundary rules as injectAnchor/injectTailAnchor.
// Returns {line: -1, col: -1} if matchIdx is out of range.
export function matchIdxToLineCol(code, rawText, matchIdx) {
  if (matchIdx < 0 || !code || !rawText) return { line: -1, col: -1 };
  const pat = rawText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefix = /\w/.test(rawText[0])                   ? '\\b' : '';
  const suffix = /\w/.test(rawText[rawText.length - 1])  ? '\\b' : '';
  const re = new RegExp(prefix + pat + suffix, 'g');
  let idx = 0, m;
  while ((m = re.exec(code)) !== null) {
    if (idx === matchIdx) return charToLineCol(code, m.index);
    idx++;
  }
  return { line: -1, col: -1 };
}

// Returns {line, col} (1-based line, 0-based col within the line) for
// the character at charIdx in code.
export function charToLineCol(code, charIdx) {
  let line = 1, col = 0;
  for (let i = 0; i < charIdx; i++) {
    if (code[i] === '\n') { line++; col = 0; }
    else { col++; }
  }
  return { line, col };
}

// Converts (1-based line, 0-based col) in raw code to the 0-based occurrence
// index of rawText starting at exactly that position. Uses the same
// word-boundary rules as injectAnchor/injectTailAnchor. Returns -1 if not found.
function _lineColToMatchIdx(code, rawText, targetLine, targetCol) {
  if (targetLine < 0) return -1;
  const pat = rawText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefix = /\w/.test(rawText[0])                   ? '\\b' : '';
  const suffix = /\w/.test(rawText[rawText.length - 1])  ? '\\b' : '';
  const re = new RegExp(prefix + pat + suffix, 'g');
  let idx = 0, m;
  while ((m = re.exec(code)) !== null) {
    const { line, col } = charToLineCol(code, m.index);
    if (line === targetLine && col === targetCol) return idx;
    idx++;
  }
  return -1;
}

// Inject link-anchor spans around all occurrences of rawText in highlighted HTML.
// code is the raw (un-highlighted) source; anchorLine/anchorCol (1-based line,
// 0-based col) identify the primary occurrence to mark with data-lid-primary.
// Pass code=null or anchorLine=-1 to skip primary marking.
export function injectAnchor(html, rawText, linkId, code = null, anchorLine = -1, anchorCol = -1) {
  const anchorMatchIdx = (code != null && anchorLine >= 0)
    ? _lineColToMatchIdx(code, rawText, anchorLine, anchorCol)
    : -1;
  const escapedText = esc(rawText);
  const pat = escapedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Word-boundary assertions prevent "start" from matching inside "startNoPodLock".
  const prefix = /\w/.test(rawText[0])                  ? '\\b' : '';
  const suffix = /\w/.test(rawText[rawText.length - 1]) ? '\\b' : '';
  const re = new RegExp(prefix + pat + suffix, 'g');
  return _injectSpans(html, re,
    /^<span[^>]+class="[^"]*\blink-anchor\b/,
    idx => {
      const primary = anchorMatchIdx >= 0 && idx === anchorMatchIdx ? ' data-lid-primary="1"' : '';
      return `<span class="link-anchor" data-lid="${linkId}"${primary}>${escapedText}</span>`;
    },
  );
}

// Inject a tail-anchor span for the occurrence of rawText at (tailLine, tailCol).
// code is the raw source used to locate the target occurrence.
// When code=null or tailLine=-1, all occurrences are wrapped (backward compat).
// Uses class="tail-anchor" / data-taid.
export function injectTailAnchor(html, rawText, taid, code = null, tailLine = -1, tailCol = -1) {
  const tailMatchIdx = (code != null && tailLine >= 0)
    ? _lineColToMatchIdx(code, rawText, tailLine, tailCol)
    : -1;
  const escapedText = esc(rawText);
  const pat = escapedText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefix = /\w/.test(rawText[0])                  ? '\\b' : '';
  const suffix = /\w/.test(rawText[rawText.length - 1]) ? '\\b' : '';
  const re = new RegExp(prefix + pat + suffix, 'g');
  return _injectSpans(html, re,
    /^<span[^>]+class="[^"]*\btail-anchor\b/,
    () => `<span class="tail-anchor" data-taid="${taid}">${escapedText}</span>`,
    tailMatchIdx,
  );
}

// Split highlighted HTML into per-line strings, correctly handling spans that
// cross line boundaries (e.g. highlight.js wraps ")\n{" inside one <span>).
// At each \n we close all currently-open spans and reopen them on the next line.
export function splitHtmlLines(html) {
  const lines = [];
  let cur = '';
  const openTags = []; // stack of opening tag strings, e.g. '<span class="hljs-function">'
  let i = 0;
  while (i < html.length) {
    if (html[i] === '<') {
      const end = html.indexOf('>', i);
      if (end === -1) { cur += html.slice(i); break; }
      const tag = html.slice(i, end + 1);
      i = end + 1;
      cur += tag;
      if (tag.startsWith('</')) {
        openTags.pop();
      } else {
        openTags.push(tag);
      }
    } else if (html[i] === '\n') {
      // Close all open spans, emit this line, then reopen them for the next line
      lines.push(cur + '</span>'.repeat(openTags.length));
      cur = openTags.join('');
      i++;
    } else {
      cur += html[i];
      i++;
    }
  }
  lines.push(cur);
  return lines;
}

// Wrap highlighted HTML lines with line-number spans
export function addLineNumbers(html, start) {
  const lines = splitHtmlLines(html);
  // Trim trailing empty line if code ends with \n
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.map((lineHtml, i) =>
    `<span class="code-line"><span class="ln-num" data-li="${i}">${start + i}</span>${lineHtml}</span>`
  ).join('');
}

// ═══════════════════════════════════════════════════════
// LINK / LINE STYLE CONSTANTS
// ═══════════════════════════════════════════════════════
// Shared by canvas-links.js (link context menu) and canvas-free-lines.js (line context menu).
export const LINK_COLORS = [
  { label: 'Blue',   value: '#388bfd' },
  { label: 'Green',  value: '#3fb950' },
  { label: 'Yellow', value: '#d29922' },
  { label: 'Red',    value: '#f85149' },
  { label: 'Purple', value: '#bc8cff' },
  { label: 'Gray',   value: '#8b949e' },
  { label: 'White',  value: '#e6edf3' },
];

export const LINK_WIDTHS = [
  { label: '1',   value: 1   },
  { label: '2',   value: 2   },
  { label: '3',   value: 3.5 },
  { label: '5',   value: 5   },
];

export const LINK_DASHES = [
  { label: 'solid',  value: '',       title: 'Solid' },
  { label: 'dash',   value: '8 4',    title: 'Dashed' },
  { label: 'dot',    value: '2 4',    title: 'Dotted' },
  { label: 'ldash',  value: '16 6',   title: 'Long dash' },
  { label: 'ddot',   value: '8 4 2 4',title: 'Dash-dot' },
];

export const READY_STATUS = 'Ready — double-click to add block | select text to create link | right-click link to delete';

// ═══════════════════════════════════════════════════════
// SVG HELPER
// ═══════════════════════════════════════════════════════
// Shared by canvas-links.js and canvas-free-lines.js.
export function svgE(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// ═══════════════════════════════════════════════════════
// DOM HELPERS
// ═══════════════════════════════════════════════════════

// Populate `container` with one element per item.
// Marks the element whose item.value === curValue with class 'active'.
// On click: toggles 'active' within the container, then calls onSelect(item.value).
// Options:
//   tag        — element tag to create (default 'button')
//   baseClass  — CSS class applied to every item element
//   setContent — (el, item) => void  set innerHTML/style/title etc.
//   onSelect   — (value) => void  called after active-class toggle
export function buildMenuItems(container, items, curValue, { tag = 'button', baseClass, setContent, onSelect }) {
  container.innerHTML = '';
  for (const item of items) {
    const el = document.createElement(tag);
    el.className = baseClass + (item.value === curValue ? ' active' : '');
    setContent(el, item);
    el.addEventListener('click', () => {
      container.querySelectorAll('.' + baseClass).forEach(e => e.classList.remove('active'));
      el.classList.add('active');
      onSelect(item.value);
    });
    container.appendChild(el);
  }
}

// Attach mousedown (stopPropagation) and click (stopPropagation + handler) to el.
// Prevents canvas drag/selection from starting when the user clicks a button inside a node.
export function onClickStop(el, handler) {
  el.addEventListener('mousedown', e => e.stopPropagation());
  el.addEventListener('click', e => { e.stopPropagation(); handler(e); });
}

// ═══════════════════════════════════════════════════════
// CONTEXT MENU HELPER
// ═══════════════════════════════════════════════════════
// Show `el` at (x,y), clamped to stay inside the viewport.
export function positionCtxMenu(el, x, y) {
  el.style.display = 'block';
  const cw = el.offsetWidth;
  const ch = el.offsetHeight;
  el.style.left = Math.min(x, window.innerWidth  - cw - 8) + 'px';
  el.style.top  = Math.min(y, window.innerHeight - ch - 8) + 'px';
}

// ═══════════════════════════════════════════════════════
// CONTEXT MENU SVG SNIPPETS
// ═══════════════════════════════════════════════════════
// Shared by canvas-links.js and canvas-free-lines.js.
export function makeDashSvg(dash, color) {
  const sw = 2, w = 36, h = 12;
  const attrs = `stroke="${color}" stroke-width="${sw}" fill="none"` +
    (dash ? ` stroke-dasharray="${dash}"` : '');
  return `<svg width="${w}" height="${h}"><line x1="2" y1="${h/2}" x2="${w-2}" y2="${h/2}" ${attrs}/></svg>`;
}

export function makeWidthSvg(width, color) {
  const w = 28, h = 16;
  return `<svg width="${w}" height="${h}"><line x1="2" y1="${h/2}" x2="${w-2}" y2="${h/2}" stroke="${color}" stroke-width="${width}" fill="none" stroke-linecap="round"/></svg>`;
}

// ═══════════════════════════════════════════════════════
// GEOMETRY
// ═══════════════════════════════════════════════════════

// Compute the point where a ray from (ocx, ocy) toward (tipX, tipY) first
// intersects the rounded-rect boundary defined by corners bl/br with radius r.
// Returns { x, y, tx, ty } (hit point + tangent direction) or null.
export function roundedRectRayHit(ocx, ocy, tipX, tipY, bl, br, r) {
  const left = bl.x, right = br.x, top = bl.y, bottom = br.y;
  const dx = tipX - ocx, dy = tipY - ocy;
  let bestT = Infinity, bestX, bestY, bestTx, bestTy;

  function tryT(t, px, py, tx, ty) {
    if (t > 1e-9 && t < bestT) { bestT = t; bestX = px; bestY = py; bestTx = tx; bestTy = ty; }
  }

  // Four straight edges (only the non-corner segments)
  if (Math.abs(dx) > 1e-9) {
    const tl = (left  - ocx) / dx;
    if (tl > 1e-9) { const py = ocy + tl * dy; if (py >= top + r && py <= bottom - r) tryT(tl, left,  py, 0, 1); }
    const tr = (right - ocx) / dx;
    if (tr > 1e-9) { const py = ocy + tr * dy; if (py >= top + r && py <= bottom - r) tryT(tr, right, py, 0, 1); }
  }
  if (Math.abs(dy) > 1e-9) {
    const tt = (top    - ocy) / dy;
    if (tt > 1e-9) { const px = ocx + tt * dx; if (px >= left + r && px <= right - r) tryT(tt, px, top,    1, 0); }
    const tb = (bottom - ocy) / dy;
    if (tb > 1e-9) { const px = ocx + tb * dx; if (px >= left + r && px <= right - r) tryT(tb, px, bottom, 1, 0); }
  }

  // Four corner arcs — each constrained to its quadrant
  const arcs = [
    { cx: left  + r, cy: top    + r, xMin: left,    xMax: left  + r, yMin: top,      yMax: top    + r },
    { cx: right - r, cy: top    + r, xMin: right- r, xMax: right,    yMin: top,      yMax: top    + r },
    { cx: left  + r, cy: bottom - r, xMin: left,    xMax: left  + r, yMin: bottom- r, yMax: bottom    },
    { cx: right - r, cy: bottom - r, xMin: right- r, xMax: right,    yMin: bottom- r, yMax: bottom    },
  ];
  for (const arc of arcs) {
    const fx = ocx - arc.cx, fy = ocy - arc.cy;
    const a  = dx * dx + dy * dy;
    const b  = 2 * (fx * dx + fy * dy);
    const c  = fx * fx + fy * fy - r * r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    for (const sign of [1, -1]) {
      const t = (-b + sign * sq) / (2 * a);
      if (t <= 1e-9 || t >= bestT) continue;
      const px = ocx + t * dx, py = ocy + t * dy;
      if (px < arc.xMin || px > arc.xMax || py < arc.yMin || py > arc.yMax) continue;
      // Tangent = radius vector rotated 90° CCW
      const rx = px - arc.cx, ry = py - arc.cy;
      tryT(t, px, py, -ry / r, rx / r);
    }
  }

  return bestT < Infinity ? { x: bestX, y: bestY, tx: bestTx, ty: bestTy } : null;
}

// Given a bounding rect r (screen coords) and the side the arrow enters the target node,
// return the fp that exits from the opposite side of the anchor element.
export function anchorFpFromSide(r, side) {
  if (side === 'left')   return { x: r.right,              y: r.top + r.height / 2 };
  if (side === 'right')  return { x: r.left,               y: r.top + r.height / 2 };
  if (side === 'top')    return { x: r.left + r.width / 2, y: r.bottom };
  /* bottom */           return { x: r.left + r.width / 2, y: r.top };
}

// Compute the exit point on the edge of `from` node in the direction of `to` node.
// Both nodes are plain objects with { x, y, w, h } in canvas coordinates.
export function edgePoint(from, to) {
  const fcx = from.x + from.w / 2, fcy = from.y + from.h / 2;
  const tcx = to.x + to.w / 2,   tcy = to.y + to.h / 2;
  const dx = tcx - fcx, dy = tcy - fcy;
  const hw = from.w / 2, hh = from.h / 2;
  if (Math.abs(dx) * hh > Math.abs(dy) * hw) {
    const x = fcx + (dx > 0 ? hw : -hw);
    const y = fcy + dy / (Math.abs(dx) || 1) * hw;
    return { x, y };
  } else {
    const y = fcy + (dy > 0 ? hh : -hh);
    const x = fcx + dx / (Math.abs(dy) || 1) * hh;
    return { x, y };
  }
}

/**
 * Returns the appropriate CSS class name for a given node type.
 * @param {string} type - Node type: 'frame', 'arrow', 'text', 'bubble', or default (code)
 * @returns {string} CSS class name
 */
export function nodeClassForType(type) {
  if (type === 'frame') return 'frame-node';
  if (type === 'arrow') return 'arrow-node';
  if (type === 'text')  return 'text-node';
  return 'node' + (type === 'bubble' ? ' bubble-node' : '');
}
