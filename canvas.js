'use strict';

// ═══════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ═══════════════════════════════════════════════════════
// HIGHLIGHT HELPERS
// ═══════════════════════════════════════════════════════
const EXT_LANG = {
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

function langFromPath(filePath) {
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
const NODE_COLORS = [
  { id: 'blue',   label: 'Blue',   hex: '#388bfd', hexLight: '#79c0ff', bgDark: '#0d1f40', bgMid: '#122040', borderMid: '#1b3f7a', titleBg: 'rgba(56,139,253,0.15)',  glow28: 'rgba(56,139,253,0.28)',  glow42: 'rgba(56,139,253,0.42)' },
  { id: 'green',  label: 'Green',  hex: '#3fb950', hexLight: '#56d364', bgDark: '#162116', bgMid: '#1b2e1b', borderMid: '#2d4a2d', titleBg: 'rgba(63,185,80,0.15)',   glow28: 'rgba(63,185,80,0.28)',   glow42: 'rgba(63,185,80,0.42)' },
  { id: 'purple', label: 'Purple', hex: '#a371f7', hexLight: '#bc8cff', bgDark: '#1a1035', bgMid: '#211444', borderMid: '#3d2870', titleBg: 'rgba(163,113,247,0.15)', glow28: 'rgba(163,113,247,0.28)', glow42: 'rgba(163,113,247,0.42)' },
  { id: 'orange', label: 'Orange', hex: '#f0883e', hexLight: '#ffa657', bgDark: '#291608', bgMid: '#33190a', borderMid: '#5c3612', titleBg: 'rgba(240,136,62,0.15)',  glow28: 'rgba(240,136,62,0.28)',  glow42: 'rgba(240,136,62,0.42)' },
  { id: 'yellow', label: 'Yellow', hex: '#e3b341', hexLight: '#f2c55a', bgDark: '#231a05', bgMid: '#2c2107', borderMid: '#4a3a0e', titleBg: 'rgba(227,179,65,0.15)',  glow28: 'rgba(227,179,65,0.28)',  glow42: 'rgba(227,179,65,0.42)' },
  { id: 'red',    label: 'Red',    hex: '#f85149', hexLight: '#ff7b72', bgDark: '#290d0c', bgMid: '#361110', borderMid: '#6a2020', titleBg: 'rgba(248,81,73,0.15)',   glow28: 'rgba(248,81,73,0.28)',   glow42: 'rgba(248,81,73,0.42)' },
  { id: 'cyan',   label: 'Cyan',   hex: '#39c5cf', hexLight: '#56d4dd', bgDark: '#061a1d', bgMid: '#092227', borderMid: '#144a50', titleBg: 'rgba(57,197,207,0.15)',  glow28: 'rgba(57,197,207,0.28)',  glow42: 'rgba(57,197,207,0.42)' },
  { id: 'pink',   label: 'Pink',   hex: '#f778ba', hexLight: '#ff9ed2', bgDark: '#29091b', bgMid: '#360d24', borderMid: '#6a2050', titleBg: 'rgba(247,120,186,0.15)', glow28: 'rgba(247,120,186,0.28)', glow42: 'rgba(247,120,186,0.42)' },
];

// Replace first occurrence of `rawText` in HTML string, only inside text nodes (outside tags)
function injectAnchor(html, rawText, linkId) {
  const pat = rawText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re  = new RegExp(pat, 'g');
  // split on HTML tags
  const parts = html.split(/(<[^>]*>)/);
  return parts.map((p, i) => {
    if (i % 2 === 1) return p; // tag → pass through
    return p.replace(re, () =>
      `<span class="link-anchor" data-lid="${linkId}">${esc(rawText)}</span>`
    );
  }).join('');
}

// Split highlighted HTML into per-line strings, correctly handling spans that
// cross line boundaries (e.g. highlight.js wraps ")\n{" inside one <span>).
// At each \n we close all currently-open spans and reopen them on the next line.
function splitHtmlLines(html) {
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
function addLineNumbers(html, start) {
  const lines = splitHtmlLines(html);
  // Trim trailing empty line if code ends with \n
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.map((lineHtml, i) =>
    `<span class="code-line"><span class="ln-num" data-li="${i}">${start + i}</span>${lineHtml}</span>`
  ).join('');
}

// ═══════════════════════════════════════════════════════
// GEOMETRY
// ═══════════════════════════════════════════════════════

// Compute the point where a ray from (ocx, ocy) toward (tipX, tipY) first
// intersects the rounded-rect boundary defined by corners bl/br with radius r.
// Returns { x, y, tx, ty } (hit point + tangent direction) or null.
function roundedRectRayHit(ocx, ocy, tipX, tipY, bl, br, r) {
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

// Compute the exit point on the edge of `from` node in the direction of `to` node.
// Both nodes are plain objects with { x, y, w, h } in canvas coordinates.
function edgePoint(from, to) {
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

// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════
const S = {
  nodes: [],
  links: [],
  vp: { x: 0, y: 0, scale: 1 },
  nid: 1,   // next node id
  lid: 1,   // next link id
  sel: null,        // selected node id
  multiSel: new Set(), // multi-selected node ids (Shift+click)
  editing: null,    // editing node id
  drag: null,       // { id, sx, sy, ox, oy, others: [{id, ox, oy}] }
  resize: null,     // { id, sx, sy, ow, oh }
  pan: null,        // { sx, sy }
  zoomDrag: null,   // { lastY, cx, cy }
  spaceDown: false,
  mode: 'select',   // 'select' | 'hand'
  linkMode: false,
  clipboard: [],    // copied node snapshots [{x,y,w,h,code,lang,title,filePath}]
  pending: null,    // { fromId, text }
  gitConfig: { url: '', branch: '', tag: '', commitHash: '' },
  tailDrag: null,   // { id } — bubble tail being dragged
  marquee: null,    // { sx, sy, ex, ey } — rubber-band selection in screen coords
};

// ═══════════════════════════════════════════════════════
// DOM REFS
// ═══════════════════════════════════════════════════════
const wrap        = document.getElementById('wrap');
const canvas      = document.getElementById('canvas');
const svgLinks    = document.getElementById('svg-links');
const linkTip     = document.getElementById('link-tip');
const statusEl    = document.getElementById('status');
const marqueeEl   = document.getElementById('marquee');

// ═══════════════════════════════════════════════════════
// MODE
// ═══════════════════════════════════════════════════════
const modeIndicator = document.getElementById('mode-indicator');

function updateCursor() {
  if (S.linkMode) return;
  if (S.mode === 'hand' || S.spaceDown) {
    wrap.style.cursor = S.pan ? 'grabbing' : 'grab';
  } else {
    wrap.style.cursor = S.pan ? 'grabbing' : '';
  }
}

function setMode(mode) {
  S.mode = mode;
  modeIndicator.textContent = mode === 'hand' ? 'HAND' : 'SELECT';
  modeIndicator.style.color = mode === 'hand' ? '#58a6ff' : '#6e7681';
  updateCursor();
}

// ═══════════════════════════════════════════════════════
// VIEWPORT
// ═══════════════════════════════════════════════════════
function applyVP() {
  const { x, y, scale } = S.vp;
  canvas.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
  // Parallax grid
  const gs = 28 * scale;
  wrap.style.backgroundSize = `${gs}px ${gs}px`;
  wrap.style.backgroundPosition = `${x % gs}px ${y % gs}px`;
  renderLinks();
}

function s2c(sx, sy) {
  return {
    x: (sx - S.vp.x) / S.vp.scale,
    y: (sy - S.vp.y) / S.vp.scale,
  };
}

function zoom(factor, mx, my) {
  const ns = Math.min(4, Math.max(0.08, S.vp.scale * factor));
  const r  = ns / S.vp.scale;
  S.vp.x  = mx - (mx - S.vp.x) * r;
  S.vp.y  = my - (my - S.vp.y) * r;
  S.vp.scale = ns;
  applyVP();
  setStatus(`Zoom: ${Math.round(ns * 100)}%`);
}

// ═══════════════════════════════════════════════════════
// HIGHLIGHT
// ═══════════════════════════════════════════════════════
function highlight(code, filePath) {
  if (!code.trim()) return { html: esc(code), lang: 'text' };
  const extLang = langFromPath(filePath);
  if (extLang) {
    try {
      const res = hljs.highlight(code, { language: extLang });
      return { html: res.value, lang: extLang };
    } catch (_) { /* fallthrough */ }
  }
  const res = hljs.highlightAuto(code);
  return { html: res.value, lang: res.language || 'text' };
}

function buildCodeHTML(code, nodeId) {
  const n = S.nodes.find(n => n.id === nodeId);
  let { html, lang } = highlight(code, n?.filePath);
  const nodeLinks = S.links.filter(l => l.fromId === nodeId);
  for (const lnk of nodeLinks) {
    html = injectAnchor(html, lnk.text, lnk.id);
  }
  return { html, lang };
}

// ═══════════════════════════════════════════════════════
// COLOR HELPERS
// ═══════════════════════════════════════════════════════
function colorSwatchesHTML(currentColor, defaultId) {
  const active = currentColor ?? defaultId;
  return `<div class="color-swatches">${
    NODE_COLORS.map(c =>
      `<span class="color-swatch${c.id === active ? ' active' : ''}" data-color="${c.id}" style="background:${c.hex}" title="${c.label}"></span>`
    ).join('')
  }</div>`;
}

function applyNodeColor(n, el) {
  if (n.type === 'bubble') {
    const c = NODE_COLORS.find(c => c.id === (n.color ?? 'green')) ?? NODE_COLORS.find(c => c.id === 'green');
    el.style.setProperty('--bn-bg',         c.bgDark);
    el.style.setProperty('--bn-border',     c.hex);
    el.style.setProperty('--bn-border-sel', c.hexLight);
    el.style.setProperty('--bn-glow-sel',   c.glow28);
    el.style.setProperty('--bn-glow-msel',  c.glow42);
    el.style.setProperty('--bh-bg',         c.bgMid);
    el.style.setProperty('--bh-border',     c.borderMid);
  } else {
    const c = NODE_COLORS.find(c => c.id === (n.color ?? 'blue')) ?? NODE_COLORS.find(c => c.id === 'blue');
    el.style.setProperty('--na',        c.hex);
    el.style.setProperty('--na-bg',     c.titleBg);
    el.style.setProperty('--nb',        c.borderMid);
    el.style.setProperty('--nb-sel',    c.hex);
    el.style.setProperty('--nb-glow',   c.glow28);
    el.style.setProperty('--nb-glow-m', c.glow42);
  }
}

// ═══════════════════════════════════════════════════════
// NODE RENDERING
// ═══════════════════════════════════════════════════════
function ndEl(id) { return document.getElementById('nd-' + id); }

function addNode(x, y, code) {
  const n = {
    id: S.nid++, x, y, w: 430, h: 270,
    code: code ?? defaultCode(),
    lang: 'javascript',
    title: '', filePath: '',
    showLineNumbers: true, lineNumberStart: 1,
    color: 'blue',
  };
  S.nodes.push(n);
  const el = document.createElement('div');
  el.className = 'node';
  el.id = 'nd-' + n.id;
  canvas.appendChild(el);
  setupNodeEvents(n, el);
  renderNode(n, el);
  scheduleSave();
  return n;
}

function defaultCode() {
  return `// New code block\nfunction greet(name) {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet('World'));`;
}

function renderNode(n, el) {
  el = el || ndEl(n.id);
  if (!el) return;

  el.style.left   = n.x + 'px';
  el.style.top    = n.y + 'px';
  el.style.width  = n.w + 'px';
  el.style.height = n.h + 'px';
  el.classList.toggle('selected', S.sel === n.id);
  el.classList.toggle('multi-selected', S.multiSel.has(n.id));
  applyNodeColor(n, el);

  if (n.type === 'bubble') {
    renderBubbleContent(n, el);
  } else if (S.editing === n.id) {
    el.innerHTML = editHTML(n);
    const ta = el.querySelector('textarea');
    ta.style.height = '100%';
    const updateLangBadge = () => {
      const extLang = langFromPath(n.filePath);
      if (extLang) {
        n.lang = extLang;
      } else {
        const r = hljs.highlightAuto(n.code.slice(0, 500));
        n.lang = r.language || 'text';
      }
      el.querySelector('.lang-badge').textContent = n.lang;
    };
    ta.addEventListener('input', () => { n.code = ta.value; updateLangBadge(); });
    el.querySelector('.inp-title').addEventListener('input', e => { n.title = e.target.value; });
    el.querySelector('.inp-filepath').addEventListener('input', e => { n.filePath = e.target.value; updateLangBadge(); });
    el.querySelector('.btn-done').addEventListener('click', e => {
      e.stopPropagation(); stopEdit();
    });
    el.querySelector('.btn-del').addEventListener('click', e => {
      e.stopPropagation(); removeNode(n.id);
    });
    el.querySelectorAll('.color-swatch').forEach(sw => {
      sw.addEventListener('mousedown', e => e.stopPropagation());
      sw.addEventListener('click', e => {
        e.stopPropagation();
        n.color = sw.dataset.color;
        applyNodeColor(n, el);
        el.querySelectorAll('.color-swatch').forEach(s =>
          s.classList.toggle('active', s.dataset.color === n.color));
        scheduleSave();
      });
    });
    ta.focus();
  } else {
    const { html, lang } = buildCodeHTML(n.code, n.id);
    n.lang = lang;
    el.innerHTML = viewHTML(n, html);
    el.querySelector('.btn-edit').addEventListener('click', e => {
      e.stopPropagation(); startEdit(n.id);
    });
    el.querySelector('.btn-del').addEventListener('click', e => {
      e.stopPropagation(); removeNode(n.id);
    });
    el.querySelectorAll('.link-anchor').forEach(a => {
      a.addEventListener('click', e => {
        e.stopPropagation();
        const lnk = S.links.find(l => l.id === +a.dataset.lid);
        if (!lnk) return;
        if (e.altKey || e.metaKey) {
          if (confirm(`Delete link "${lnk.text}"?`)) removeLink(lnk.id);
        } else {
          jumpTo(lnk.toId);
        }
      });
    });

    // Git snippet fetch button
    const btnFetch = el.querySelector('.btn-fetch-git');
    if (btnFetch) {
      btnFetch.addEventListener('mousedown', e => e.stopPropagation());
      btnFetch.addEventListener('click', e => { e.stopPropagation(); openFetchDialog(n.id); });
    }

    // Codesnippetd button
    const btnCsd = el.querySelector('.btn-codesnippetd');
    if (btnCsd) {
      btnCsd.addEventListener('mousedown', e => e.stopPropagation());
      btnCsd.addEventListener('click', e => { e.stopPropagation(); openCodeSnippetdDialog(n.id); });
    }

    // Inline edit for title / filePath
    el.querySelectorAll('.editable-meta').forEach(span => {
      span.addEventListener('mousedown', e => e.stopPropagation());
      span.addEventListener('click', e => {
        e.stopPropagation();
        const field = span.dataset.field; // 'title' or 'filePath'
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = n[field];
        inp.className = field === 'filePath' ? 'inp-filepath' : 'inp-title';
        inp.placeholder = field === 'filePath' ? 'File path (e.g. src/utils/helper.ts)' : 'Title';
        inp.spellcheck = false;
        span.replaceWith(inp);
        inp.focus(); inp.select();
        let committed = false;
        const commit = () => {
          if (committed) return; committed = true;
          n[field] = inp.value.trim();
          if (field === 'filePath') {
            const extLang = langFromPath(n.filePath);
            if (extLang) n.lang = extLang;
          }
          renderNode(n, el);
          scheduleSave();
        };
        inp.addEventListener('blur', commit);
        inp.addEventListener('keydown', ev => {
          if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); }
          if (ev.key === 'Escape') { committed = true; renderNode(n, el); }
        });
        inp.addEventListener('mousedown', ev => ev.stopPropagation());
      });
    });

    // Line-number checkbox
    const lnCb = el.querySelector('.ln-cb');
    if (lnCb) {
      lnCb.addEventListener('change', e => {
        e.stopPropagation();
        n.showLineNumbers = lnCb.checked;
        renderNode(n, el);
        autoFitNode(n);
        scheduleSave();
      });
      lnCb.addEventListener('mousedown', e => e.stopPropagation());
    }

    // Line-number click → inline edit
    el.querySelectorAll('.ln-num').forEach(span => {
      span.addEventListener('click', e => {
        e.stopPropagation();
        const li = parseInt(span.dataset.li, 10);
        const currentLn = (n.lineNumberStart ?? 1) + li;
        const inp = document.createElement('input');
        inp.type = 'number'; inp.value = currentLn;
        inp.className = 'ln-num-input';
        inp.style.width = Math.max(32, String(currentLn).length * 8 + 12) + 'px';
        span.replaceWith(inp);
        inp.focus(); inp.select();
        let committed = false;
        const commit = () => {
          if (committed) return; committed = true;
          const newLn = parseInt(inp.value, 10);
          if (!isNaN(newLn)) n.lineNumberStart = newLn - li;
          renderNode(n, el);
          scheduleSave();
        };
        inp.addEventListener('blur', commit);
        inp.addEventListener('keydown', ev => {
          if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); }
          if (ev.key === 'Escape') { committed = true; renderNode(n, el); }
        });
        inp.addEventListener('mousedown', ev => ev.stopPropagation());
      });
    });
  }

  const rh = el.querySelector('.resize-handle');
  if (rh) {
    rh.addEventListener('mousedown', e => {
      e.stopPropagation(); e.preventDefault();
      S.resize = { id: n.id, sx: e.clientX, sy: e.clientY, ow: n.w, oh: n.h };
    });
  }
}

// ═══════════════════════════════════════════════════════
// BUBBLE NODE
// ═══════════════════════════════════════════════════════
function bubbleViewHTML(n) {
  const body = n.text
    ? `<div class="bubble-text">${esc(n.text).replace(/\n/g, '<br>')}</div>`
    : `<div class="bubble-text empty">Enter text…</div>`;
  return `
  <div class="bubble-header">
    <div class="node-actions">
      <button class="node-btn btn-edit">Edit</button>
      <button class="node-btn danger btn-del">✕</button>
    </div>
  </div>
  <div class="bubble-body">${body}</div>
  <div class="resize-handle"></div>`;
}

function bubbleEditHTML(n) {
  return `
  <div class="bubble-header">
    <div class="node-actions" style="opacity:1">
      ${colorSwatchesHTML(n.color, 'green')}
      <button class="node-btn btn-done">✓ Done</button>
      <button class="node-btn danger btn-del">Delete</button>
    </div>
  </div>
  <div class="bubble-body">
    <textarea class="bubble-textarea" spellcheck="false">${esc(n.text ?? '')}</textarea>
  </div>
  <div class="resize-handle"></div>`;
}

function renderBubbleContent(n, el) {
  if (S.editing === n.id) {
    el.innerHTML = bubbleEditHTML(n);
    const ta = el.querySelector('textarea');
    ta.style.height = (n.h - 54) + 'px';
    ta.addEventListener('input', () => { n.text = ta.value; });
    el.querySelector('.btn-done').addEventListener('click', e => { e.stopPropagation(); stopEdit(); });
    el.querySelector('.btn-del').addEventListener('click', e => { e.stopPropagation(); removeNode(n.id); });
    el.querySelectorAll('.color-swatch').forEach(sw => {
      sw.addEventListener('mousedown', e => e.stopPropagation());
      sw.addEventListener('click', e => {
        e.stopPropagation();
        n.color = sw.dataset.color;
        applyNodeColor(n, el);
        el.querySelectorAll('.color-swatch').forEach(s =>
          s.classList.toggle('active', s.dataset.color === n.color));
        scheduleSave();
      });
    });
    ta.focus();
  } else {
    el.innerHTML = bubbleViewHTML(n);
    el.querySelector('.btn-edit').addEventListener('click', e => { e.stopPropagation(); startEdit(n.id); });
    el.querySelector('.btn-del').addEventListener('click', e => { e.stopPropagation(); removeNode(n.id); });
    el.querySelector('.bubble-body').addEventListener('dblclick', e => { e.stopPropagation(); startEdit(n.id); });
  }
}

// Draw bubble tail as smooth SVG path + draggable handle (screen coords)
function renderBubbleTail(n) {
  svgLinks.querySelector(`[data-btail="${n.id}"]`)?.remove();

  const bl  = c2s(n.x, n.y);
  const br  = c2s(n.x + n.w, n.y + n.h);
  const cx  = (bl.x + br.x) / 2;
  const cy  = (bl.y + br.y) / 2;
  const tip = c2s(n.tailX, n.tailY);

  // Border radius in screen pixels (CSS: 14px, scaled by viewport)
  const r = Math.min(14 * S.vp.scale, (br.x - bl.x) / 2, (br.y - bl.y) / 2);

  // Exact intersection of center→tip ray with the rounded border + tangent there
  const hit = roundedRectRayHit(cx, cy, tip.x, tip.y, bl, br, r);
  if (!hit) return;

  // Spread p1/p2 along the border tangent so they always stay on the bubble surface
  const hw = 10;
  const p1 = { x: hit.x + hit.tx * hw, y: hit.y + hit.ty * hw };
  const p2 = { x: hit.x - hit.tx * hw, y: hit.y - hit.ty * hw };

  // Bezier control points: curve each side smoothly toward the tip
  const cp1 = { x: (p1.x + tip.x) / 2 + (hit.x - p1.x) * 0.25,
                 y: (p1.y + tip.y) / 2 + (hit.y - p1.y) * 0.25 };
  const cp2 = { x: (p2.x + tip.x) / 2 + (hit.x - p2.x) * 0.25,
                 y: (p2.y + tip.y) / 2 + (hit.y - p2.y) * 0.25 };

  const fillD   = `M ${p1.x},${p1.y} Q ${cp1.x},${cp1.y} ${tip.x},${tip.y} Q ${cp2.x},${cp2.y} ${p2.x},${p2.y} Z`;
  const strokeD = `M ${p1.x},${p1.y} Q ${cp1.x},${cp1.y} ${tip.x},${tip.y} Q ${cp2.x},${cp2.y} ${p2.x},${p2.y}`;

  const isSelected = S.sel === n.id || S.multiSel.has(n.id);
  const _tc = NODE_COLORS.find(c => c.id === (n.color ?? 'green')) ?? NODE_COLORS.find(c => c.id === 'green');
  const stroke = isSelected ? _tc.hexLight : _tc.hex;

  const g = svgE('g', { 'data-btail': n.id });
  g.appendChild(svgE('path', {
    class: 'bubble-tail-poly',
    d: fillD, fill: _tc.bgDark + 'cc', stroke: 'none',
  }));
  g.appendChild(svgE('path', {
    class: 'bubble-tail-poly',
    d: strokeD, fill: 'none', stroke,
    'stroke-width': '1.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }));

  const handle = svgE('circle', {
    class: 'tail-handle',
    cx: tip.x, cy: tip.y, r: '6',
    fill: _tc.hex, stroke: '#0d1117', 'stroke-width': '1.5',
  });
  handle.addEventListener('mousedown', e => {
    e.stopPropagation(); e.preventDefault();
    S.tailDrag = { id: n.id };
  });
  g.appendChild(handle);

  svgLinks.appendChild(g);
}

function addBubble(x, y) {
  const n = {
    id: S.nid++, type: 'bubble',
    x, y, w: 200, h: 100,
    text: '',
    tailX: x + 100, tailY: y + 140,
    color: 'green',
  };
  S.nodes.push(n);
  const el = document.createElement('div');
  el.className = 'node bubble-node';
  el.id = 'nd-' + n.id;
  canvas.appendChild(el);
  setupNodeEvents(n, el);
  renderNode(n, el);
  renderLinks();
  selectNode(n.id);
  startEdit(n.id);
  scheduleSave();
  return n;
}

function editHTML(n) {
  return `
  <div class="node-header">
    <div class="node-meta">
      <input class="inp-title" placeholder="Title" value="${esc(n.title ?? '')}" spellcheck="false">
      <input class="inp-filepath" placeholder="File path (e.g. src/utils/helper.ts)" value="${esc(n.filePath ?? '')}" spellcheck="false">
    </div>
    <div class="node-actions" style="opacity:1">
      ${colorSwatchesHTML(n.color, 'blue')}
      <span class="lang-badge">${esc(n.lang)}</span>
      <button class="node-btn btn-done">✓ Done</button>
      <button class="node-btn danger btn-del">Delete</button>
    </div>
  </div>
  <div class="node-body">
    <textarea spellcheck="false">${esc(n.code)}</textarea>
  </div>
  <div class="resize-handle"></div>`;
}

function viewHTML(n, codeHtml) {
  const titleSpan    = `<span class="node-title editable-meta${n.title ? '' : ' meta-empty'}" data-field="title">${n.title ? esc(n.title) : 'Title…'}</span>`;
  const filepathSpan = `<span class="node-filepath editable-meta${n.filePath ? '' : ' meta-empty'}" data-field="filePath">${n.filePath ? esc(n.filePath) : 'File path…'}</span>`;
  const metaHtml = `<div class="node-meta">${titleSpan}${filepathSpan}</div>`;
  const bodyHtml = n.showLineNumbers
    ? `<pre class="has-ln"><code class="hljs">${addLineNumbers(codeHtml, n.lineNumberStart ?? 1)}</code></pre>`
    : `<pre><code class="hljs">${codeHtml}</code></pre>`;
  return `
  <div class="node-header">
    ${metaHtml}
    <div class="node-actions">
      <button class="node-btn btn-fetch-git">⬇ Fetch</button>
      <button class="node-btn btn-codesnippetd">📦 codesnippetd</button>
      <label class="ln-toggle" title="Show/hide line numbers"><input type="checkbox" class="ln-cb"${n.showLineNumbers ? ' checked' : ''}> Line Nos</label>
      <button class="node-btn btn-edit">Edit</button>
      <button class="node-btn danger btn-del">✕</button>
    </div>
  </div>
  <div class="node-body">
    ${bodyHtml}
  </div>
  <div class="resize-handle"></div>`;
}

function setupNodeEvents(n, el) {
  el.addEventListener('mousedown', e => {
    if (e.button !== 0) return;

    // ── link-mode: clicking a node creates a link ──
    if (S.linkMode) {
      if (S.pending && S.pending.fromId !== n.id) {
        createLink(S.pending.fromId, S.pending.text, n.id);
        exitLinkMode();
      }
      e.stopPropagation();
      return;
    }

    // Ctrl/Cmd + drag = zoom (let it bubble to wrap handler)
    if (e.ctrlKey || e.metaKey) return;

    // Hand mode + Space: pan from node too
    if (S.mode === 'hand' || S.spaceDown) {
      e.preventDefault();
      S.pan = { sx: e.clientX - S.vp.x, sy: e.clientY - S.vp.y };
      wrap.style.cursor = 'grabbing';
      return;
    }

    // Shift+click: toggle multi-selection (anywhere on node except buttons/inputs/textarea)
    if (e.shiftKey) {
      if (!e.target.closest('.node-btn') && !e.target.closest('input') && !e.target.closest('textarea')) {
        e.preventDefault();
        e.stopPropagation();
        // Auto-include the currently selected node (S.sel) into multiSel.
        // This handles the case where the user normal-clicked a node first,
        // then shift-clicked others — S.sel would be set but not in multiSel.
        if (S.sel !== null && !S.multiSel.has(S.sel)) {
          S.multiSel.add(S.sel);
          ndEl(S.sel)?.classList.add('multi-selected');
        }
        toggleMultiSel(n.id);
        const count = S.multiSel.size;
        setStatus(count > 0 ? `${count} block(s) selected — drag header to move all` : 'Ready');
      }
      return;
    }

    const onHeader = e.target.closest('.node-header, .bubble-header') && !e.target.closest('.node-btn') && !e.target.closest('input');

    // If clicking a node already in multi-selection: keep selection, start group drag
    if (S.multiSel.size >= 1 && S.multiSel.has(n.id)) {
      S.sel = n.id;
      if (onHeader) {
        e.preventDefault();
        // Store initial positions for ALL selected nodes (including primary).
        // Also include S.sel as a safety net in case it wasn't added via shift-click.
        const allIds = new Set(S.multiSel);
        if (S.sel !== null) allIds.add(S.sel);
        const multiOrigins = new Map();
        allIds.forEach(id => {
          const mn = S.nodes.find(nn => nn.id === id);
          if (mn) multiOrigins.set(id, { ox: mn.x, oy: mn.y,
            otailX: mn.tailX, otailY: mn.tailY });
        });
        S.drag = { id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, multiOrigins };
        allIds.forEach(id => ndEl(id)?.classList.add('dragging'));
      }
      return;
    }

    // Normal click: clear multi-selection, select this node
    clearMultiSel();
    selectNode(n.id);

    // drag from header
    if (onHeader) {
      e.preventDefault();
      S.drag = { id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y,
                 otailX: n.tailX, otailY: n.tailY };
      el.classList.add('dragging');
    }
  });

  el.addEventListener('dblclick', e => {
    e.stopPropagation();
  });
}

function startEdit(id) {
  if (S.editing === id) return;
  if (S.editing) stopEdit();
  S.editing = id;
  renderNode(S.nodes.find(n => n.id === id));
}

function stopEdit() {
  if (!S.editing) return;
  const id = S.editing;
  S.editing = null;
  const n = S.nodes.find(n => n.id === id);
  if (n) { renderNode(n); autoFitNode(n); }
  renderLinks();
  scheduleSave();
}

// Resize a code node so all content is visible without scrolling.
function autoFitNode(n) {
  const el = ndEl(n.id);
  if (!el) return;
  const header = el.querySelector('.node-header');
  const pre    = el.querySelector('.node-body pre');
  if (!pre) return;

  // Step 1: measure natural (unwrapped) code width.
  // pre has overflow:visible so scrollWidth == clientWidth (container width),
  // not the actual content width.  Switch to inline-block so the element
  // sizes itself to its content; then getBoundingClientRect gives true width.
  const codeLines = pre.querySelectorAll('.code-line');
  pre.style.whiteSpace = 'pre';
  codeLines.forEach(l => { l.style.whiteSpace = 'pre'; });
  pre.style.display = 'inline-block';
  // getBoundingClientRect returns the pre's padding-box width in viewport px.
  // Dividing by scale gives CSS px.  Add the node's border (2px) so the final
  // node width is wide enough to fit the pre at its measured size.
  const codeW = Math.ceil(pre.getBoundingClientRect().width / S.vp.scale) + 2;
  pre.style.display = '';
  pre.style.whiteSpace = '';
  codeLines.forEach(l => { l.style.whiteSpace = ''; });

  // Also keep header fully visible.
  const headW    = header ? Math.ceil(header.getBoundingClientRect().width / S.vp.scale) + 2 : 0;
  const naturalW = Math.max(250, codeW, headW);
  n.w = naturalW;
  el.style.width = naturalW + 'px';

  // Step 2: measure height at the new width (wrap may reflow lines).
  const headerH = header ? header.offsetHeight : 40;
  const newH    = Math.max(120, headerH + pre.scrollHeight + 2);
  n.h = newH;
  el.style.height = newH + 'px';
}

function selectNode(id) {
  const prev = S.sel;
  S.sel = id;
  // only update CSS class — do NOT rebuild innerHTML here
  if (prev && prev !== id) ndEl(prev)?.classList.remove('selected');
  if (id) ndEl(id)?.classList.add('selected');
}

function toggleMultiSel(id) {
  if (S.multiSel.has(id)) {
    S.multiSel.delete(id);
    ndEl(id)?.classList.remove('multi-selected');
  } else {
    S.multiSel.add(id);
    ndEl(id)?.classList.add('multi-selected');
  }
}

function clearMultiSel() {
  S.multiSel.forEach(id => ndEl(id)?.classList.remove('multi-selected'));
  S.multiSel.clear();
}

function removeNode(id) {
  S.nodes = S.nodes.filter(n => n.id !== id);
  S.links = S.links.filter(l => l.fromId !== id && l.toId !== id);
  svgLinks.querySelector(`[data-btail="${id}"]`)?.remove();
  const el = ndEl(id);
  if (el) el.remove();
  if (S.sel === id)     S.sel = null;
  if (S.editing === id) S.editing = null;
  S.multiSel.delete(id);
  renderLinks();
  scheduleSave();
}

// ═══════════════════════════════════════════════════════
// COPY / CUT / PASTE
// ═══════════════════════════════════════════════════════
function getSelectedIds() {
  if (S.multiSel.size > 0) return [...S.multiSel];
  if (S.sel !== null) return [S.sel];
  return [];
}

function copyNodes() {
  const ids = getSelectedIds();
  if (ids.length === 0) return;
  S.clipboard = ids.map(id => {
    const n = S.nodes.find(nn => nn.id === id);
    return n ? { ...n } : null;
  }).filter(Boolean);
  setStatus(`${S.clipboard.length} block(s) copied (Cmd/Ctrl+V to paste)`);
}

function cutNodes() {
  const ids = getSelectedIds();
  if (ids.length === 0) return;
  S.clipboard = ids.map(id => {
    const n = S.nodes.find(nn => nn.id === id);
    return n ? { ...n } : null;
  }).filter(Boolean);
  ids.forEach(id => removeNode(id));
  setStatus(`${S.clipboard.length} block(s) cut (Cmd/Ctrl+V to paste)`);
}

function pasteNodes() {
  if (S.clipboard.length === 0) return;
  clearMultiSel();
  selectNode(null);
  const offset = 30;
  for (const data of S.clipboard) {
    const n = { ...data, id: S.nid++, x: data.x + offset, y: data.y + offset };
    if (n.type === 'bubble') {
      n.tailX = (data.tailX ?? data.x + data.w / 2) + offset;
      n.tailY = (data.tailY ?? data.y + data.h + 50) + offset;
    }
    S.nodes.push(n);
    const el = document.createElement('div');
    el.className = 'node' + (n.type === 'bubble' ? ' bubble-node' : '');
    el.id = 'nd-' + n.id;
    canvas.appendChild(el);
    setupNodeEvents(n, el);
    renderNode(n, el);
    S.multiSel.add(n.id);
    ndEl(n.id)?.classList.add('multi-selected');
  }
  // Shift clipboard so the next paste lands further offset
  S.clipboard = S.clipboard.map(d => ({ ...d, x: d.x + offset, y: d.y + offset }));
  setStatus(`${S.clipboard.length} block(s) pasted`);
  scheduleSave();
}

function jumpTo(id) {
  const n = S.nodes.find(n => n.id === id);
  if (!n) return;
  const vw = wrap.clientWidth, vh = wrap.clientHeight;
  S.vp.x = vw / 2 - (n.x + n.w / 2) * S.vp.scale;
  S.vp.y = vh / 2 - (n.y + n.h / 2) * S.vp.scale;
  applyVP();
  selectNode(id);
}

// ═══════════════════════════════════════════════════════
// LINKS
// ═══════════════════════════════════════════════════════
function createLink(fromId, text, toId) {
  // avoid duplicate
  if (S.links.find(l => l.fromId === fromId && l.text === text && l.toId === toId)) {
    setStatus(`⚠ A link from "${text}" to this block already exists`);
    return;
  }
  S.links.push({ id: S.lid++, fromId, text, toId });
  renderNode(S.nodes.find(n => n.id === fromId));
  renderLinks();
  scheduleSave();
}

function removeLink(id) {
  const lnk = S.links.find(l => l.id === id);
  S.links = S.links.filter(l => l.id !== id);
  if (lnk) renderNode(S.nodes.find(n => n.id === lnk.fromId));
  renderLinks();
  scheduleSave();
}

// canvas coords → screen coords
function c2s(cx, cy) {
  return {
    x: cx * S.vp.scale + S.vp.x,
    y: cy * S.vp.scale + S.vp.y,
  };
}

// End point of arrow: defaults to upper-left area of target node,
// adjusts based on where the start point (fp) is relative to the target.
function targetEntryPoint(fp, tn) {
  const nTL = c2s(tn.x,            tn.y);
  const nBR = c2s(tn.x + tn.w,     tn.y + tn.h);

  // candidate points (screen coords)
  const left   = c2s(tn.x,              tn.y + tn.h * 0.25);
  const top    = c2s(tn.x + tn.w * 0.2, tn.y);
  const right  = c2s(tn.x + tn.w,       tn.y + tn.h * 0.25);
  const bottom = c2s(tn.x + tn.w * 0.2, tn.y + tn.h);

  if (fp.x > nBR.x) return right;   // source clearly to the right
  if (fp.y > nBR.y && fp.x > tn.x) return bottom;  // source clearly below
  if (fp.y < nTL.y && fp.x > tn.x) return top;     // source clearly above
  return left;                       // default: left edge, upper area
}

function renderLinks() {
  svgLinks.querySelectorAll('.lk').forEach(e => e.remove());
  svgLinks.querySelectorAll('[data-btail]').forEach(e => e.remove());
  for (const lnk of S.links) {
    const fn = S.nodes.find(n => n.id === lnk.fromId);
    const tn = S.nodes.find(n => n.id === lnk.toId);
    if (!fn || !tn) continue;

    // Start point: anchor element position if available, else node edge
    const anchorEl = document.querySelector(`.link-anchor[data-lid="${lnk.id}"]`);
    let fp;
    if (anchorEl) {
      const r = anchorEl.getBoundingClientRect();
      fp = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    } else {
      fp = c2s(edgePoint(fn, tn).x, edgePoint(fn, tn).y);
    }

    const tp = targetEntryPoint(fp, tn);

    const dx = tp.x - fp.x;
    const dy = tp.y - fp.y;
    const d = `M${fp.x},${fp.y} C${fp.x + dx * 0.45},${fp.y + dy * 0.1} ${tp.x - dx * 0.45},${tp.y - dy * 0.1} ${tp.x},${tp.y}`;

    const g = svgE('g', { class: 'lk' });
    g.appendChild(svgE('path', {
      d, class: 'link-path', 'marker-end': 'url(#arrow)'
    }));

    const mx = (fp.x + tp.x) / 2;
    const my = (fp.y + tp.y) / 2 - 9;
    const txt = svgE('text', { x: mx, y: my, class: 'link-label', 'text-anchor': 'middle' });
    txt.textContent = `"${lnk.text}"`;
    g.appendChild(txt);

    svgLinks.appendChild(g);
  }
  // Bubble tails
  for (const n of S.nodes) {
    if (n.type === 'bubble') renderBubbleTail(n);
  }
}

function svgE(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// ═══════════════════════════════════════════════════════
// LINK MODE
// ═══════════════════════════════════════════════════════
function enterLinkMode(fromId, text) {
  S.linkMode = true;
  S.pending = { fromId, text };
  document.body.classList.add('link-mode');
  setStatus(`🔗 Click the target block — "${text}" → ? (Esc to cancel)`);
}

function exitLinkMode() {
  S.linkMode = false;
  S.pending = null;
  document.body.classList.remove('link-mode');
  linkTip.style.display = 'none';
  setStatus('Ready');
}

// ═══════════════════════════════════════════════════════
// TEXT SELECTION → LINK
// ═══════════════════════════════════════════════════════
document.addEventListener('mouseup', e => {
  if (S.linkMode) return;

  const sel  = window.getSelection();
  const text = sel?.toString().trim();
  if (!text) { linkTip.style.display = 'none'; return; }

  // find ancestor .node (use commonAncestorContainer to avoid direction-dependent anchorNode)
  const container = sel.getRangeAt(0).commonAncestorContainer;
  let el = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
  while (el && !el.classList?.contains('node')) el = el.parentElement;
  if (!el) { linkTip.style.display = 'none'; return; }

  const fromId = +el.id.replace('nd-', '');

  // selection is inside the textarea of the node being edited → skip
  if (S.editing === fromId) { linkTip.style.display = 'none'; return; }
  const range  = sel.getRangeAt(0);
  const rect   = range.getBoundingClientRect();

  linkTip.style.display = 'block';
  linkTip.style.left    = (rect.left + rect.width / 2) + 'px';
  linkTip.style.top     = Math.max(8, rect.top - 40) + 'px';

  linkTip.onclick = () => {
    sel.removeAllRanges();
    linkTip.style.display = 'none';
    enterLinkMode(fromId, text);
  };
});

// hide tooltip on outside click (but not when starting a text selection in code)
document.addEventListener('mousedown', e => {
  if (e.target === linkTip) return;
  if (e.target.closest('.node-body')) return;
  linkTip.style.display = 'none';
});

// ═══════════════════════════════════════════════════════
// CANVAS INTERACTION
// ═══════════════════════════════════════════════════════
wrap.addEventListener('mousedown', e => {
  const onBg = e.target === wrap || e.target === canvas;

  if (S.linkMode) {
    if (onBg) exitLinkMode();
    return;
  }

  if (onBg) {
    selectNode(null);
    clearMultiSel();
    setStatus('Ready');
    if (S.editing) stopEdit();
  }

  // Middle button always pans
  if (e.button === 1) {
    e.preventDefault();
    S.pan = { sx: e.clientX - S.vp.x, sy: e.clientY - S.vp.y };
    wrap.style.cursor = 'grabbing';
    return;
  }

  if (e.button === 0) {
    // Ctrl/Cmd + drag = zoom
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      S.zoomDrag = { lastY: e.clientY, cx: e.clientX, cy: e.clientY };
      wrap.style.cursor = 'ns-resize';
      return;
    }
    // Hand mode or Space held: drag pans
    if ((S.mode === 'hand' || S.spaceDown) && onBg) {
      e.preventDefault();
      S.pan = { sx: e.clientX - S.vp.x, sy: e.clientY - S.vp.y };
      wrap.style.cursor = 'grabbing';
      return;
    }
    // Select mode + background drag: start marquee selection
    if (S.mode === 'select' && onBg) {
      e.preventDefault();
      S.marquee = { sx: e.clientX, sy: e.clientY, ex: e.clientX, ey: e.clientY };
    }
  }
});

wrap.addEventListener('dblclick', e => {
  if (S.linkMode) return;
  if (e.target !== wrap && e.target !== canvas) return;
  const p = s2c(e.clientX, e.clientY);
  addNode(p.x - 215, p.y - 135);
});

document.addEventListener('mousemove', e => {
  if (S.pan) {
    S.vp.x = e.clientX - S.pan.sx;
    S.vp.y = e.clientY - S.pan.sy;
    applyVP();
  } else if (S.zoomDrag) {
    const dy = e.clientY - S.zoomDrag.lastY;
    if (dy !== 0) {
      const factor = Math.pow(dy > 0 ? 0.97 : 1.03, Math.abs(dy));
      zoom(factor, S.zoomDrag.cx, S.zoomDrag.cy);
    }
    S.zoomDrag.lastY = e.clientY;
  } else if (S.drag) {
    const r = 1 / S.vp.scale;
    const dx = (e.clientX - S.drag.sx) * r;
    const dy = (e.clientY - S.drag.sy) * r;
    if (S.drag.multiOrigins) {
      // Multi-node drag: move all selected nodes together
      S.drag.multiOrigins.forEach(({ ox, oy, otailX, otailY }, id) => {
        const mn = S.nodes.find(nn => nn.id === id);
        if (mn) {
          mn.x = ox + dx;
          mn.y = oy + dy;
          if (mn.type === 'bubble' && otailX !== undefined) {
            mn.tailX = otailX + dx;
            mn.tailY = otailY + dy;
          }
          const mel = ndEl(id);
          if (mel) { mel.style.left = mn.x + 'px'; mel.style.top = mn.y + 'px'; }
        }
      });
    } else {
      // Single-node drag
      const n = S.nodes.find(n => n.id === S.drag.id);
      if (n) {
        n.x = S.drag.ox + dx;
        n.y = S.drag.oy + dy;
        if (n.type === 'bubble' && S.drag.otailX !== undefined) {
          n.tailX = S.drag.otailX + dx;
          n.tailY = S.drag.otailY + dy;
        }
        const el = ndEl(n.id);
        if (el) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; }
      }
    }
    renderLinks();
  } else if (S.tailDrag) {
    const n = S.nodes.find(n => n.id === S.tailDrag.id);
    if (n) {
      const p = s2c(e.clientX, e.clientY);
      n.tailX = p.x; n.tailY = p.y;
      renderBubbleTail(n);
    }
  } else if (S.resize) {
    const r = 1 / S.vp.scale;
    const n = S.nodes.find(n => n.id === S.resize.id);
    if (n) {
      n.w = Math.max(250, S.resize.ow + (e.clientX - S.resize.sx) * r);
      n.h = Math.max(120, S.resize.oh + (e.clientY - S.resize.sy) * r);
      const el = ndEl(n.id);
      if (el) {
        el.style.width  = n.w + 'px';
        el.style.height = n.h + 'px';
        const ta = el.querySelector('textarea');
        if (ta) ta.style.height = (n.h - 42) + 'px';
      }
      renderLinks();
    }
  } else if (S.marquee) {
    S.marquee.ex = e.clientX;
    S.marquee.ey = e.clientY;
    const x = Math.min(S.marquee.sx, S.marquee.ex);
    const y = Math.min(S.marquee.sy, S.marquee.ey);
    const w = Math.abs(S.marquee.ex - S.marquee.sx);
    const h = Math.abs(S.marquee.ey - S.marquee.sy);
    marqueeEl.style.display = 'block';
    marqueeEl.style.left    = x + 'px';
    marqueeEl.style.top     = y + 'px';
    marqueeEl.style.width   = w + 'px';
    marqueeEl.style.height  = h + 'px';
  }
});

document.addEventListener('mouseup', () => {
  if (S.drag) {
    if (S.drag.multiOrigins) {
      S.drag.multiOrigins.forEach((_, id) => ndEl(id)?.classList.remove('dragging'));
    } else {
      ndEl(S.drag.id)?.classList.remove('dragging');
    }
  }
  if (S.tailDrag) { S.tailDrag = null; scheduleSave(); }
  if (S.marquee) {
    marqueeEl.style.display = 'none';
    const mq = S.marquee;
    S.marquee = null;
    // Convert marquee screen rect to canvas coords
    const c0 = s2c(Math.min(mq.sx, mq.ex), Math.min(mq.sy, mq.ey));
    const c1 = s2c(Math.max(mq.sx, mq.ex), Math.max(mq.sy, mq.ey));
    // Only apply if the drag was large enough to be intentional (> 4px)
    if (c1.x - c0.x > 4 / S.vp.scale || c1.y - c0.y > 4 / S.vp.scale) {
      clearMultiSel();
      selectNode(null);
      S.nodes.forEach(n => {
        // Axis-aligned rect overlap: node rect vs marquee rect
        if (n.x < c1.x && n.x + n.w > c0.x && n.y < c1.y && n.y + n.h > c0.y) {
          S.multiSel.add(n.id);
          ndEl(n.id)?.classList.add('multi-selected');
        }
      });
      const count = S.multiSel.size;
      setStatus(count > 0 ? `${count} block(s) selected — drag header to move all` : 'Ready');
    }
  }
  S.drag = null; S.resize = null; S.zoomDrag = null;
  if (S.pan) S.pan = null;
  updateCursor();
});

wrap.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) {
    // Ctrl/Cmd + wheel = zoom
    const rect = wrap.getBoundingClientRect();
    zoom(e.deltaY < 0 ? 1.1 : 0.9, e.clientX - rect.left, e.clientY - rect.top);
  } else {
    // wheel = pan
    S.vp.x -= e.deltaX;
    S.vp.y -= e.deltaY;
    applyVP();
  }
}, { passive: false });

// ── Keyboard ──
document.addEventListener('keydown', e => {
  const tag = document.activeElement?.tagName;
  const isInput = tag === 'INPUT' || tag === 'TEXTAREA';

  if (!isInput && (e.code === 'KeyV' || e.code === 'KeyH') && !e.ctrlKey && !e.metaKey) {
    setMode(S.mode === 'hand' ? 'select' : 'hand');
    return;
  }
  if (e.code === 'Space' && !S.editing && !isInput) {
    e.preventDefault();
    S.spaceDown = true;
    if (!S.pan) updateCursor();
  }
  if (e.code === 'Escape') {
    if (S.linkMode) exitLinkMode();
    else if (S.editing) stopEdit();
  }
  if ((e.code === 'Delete' || e.code === 'Backspace') && !isInput && !S.editing) {
    if (S.multiSel.size > 0) {
      e.preventDefault();
      [...S.multiSel].forEach(id => removeNode(id));
    } else if (S.sel) {
      e.preventDefault();
      removeNode(S.sel);
    }
  }
  // Copy / Cut / Paste
  if ((e.metaKey || e.ctrlKey) && !isInput) {
    if (e.key === 'c') {
      // Allow default browser copy if text is selected in code view
      if (!window.getSelection()?.toString().trim()) {
        e.preventDefault();
        copyNodes();
      }
    } else if (e.key === 'x') {
      if (!window.getSelection()?.toString().trim()) {
        e.preventDefault();
        cutNodes();
      }
    } else if (e.key === 'v') {
      e.preventDefault();
      pasteNodes();
    }
  }
  // Ctrl/Cmd + 0: reset zoom
  if ((e.ctrlKey || e.metaKey) && e.key === '0') {
    e.preventDefault();
    S.vp.x = wrap.clientWidth / 2 - 500;
    S.vp.y = wrap.clientHeight / 2 - 200;
    S.vp.scale = 1;
    applyVP();
    setStatus('Zoom reset');
  }
});

document.addEventListener('keyup', e => {
  if (e.code === 'Space') {
    S.spaceDown = false;
    if (!S.pan) updateCursor();
  }
});

// ── Toolbar button ──
document.getElementById('btn-add').addEventListener('click', () => {
  const p = s2c(wrap.clientWidth / 2, wrap.clientHeight / 2);
  addNode(p.x - 215, p.y - 135);
});

// ═══════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════
function setStatus(msg) { statusEl.textContent = msg; }

// ═══════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════
const STORAGE_KEY = 'code-canvas-v1';

const canvasTitleEl = document.getElementById('canvas-title');
function resizeCanvasTitleInput() {
  canvasTitleEl.style.width = Math.max(80, Math.min(420, canvasTitleEl.value.length * 9 + 16)) + 'px';
}
canvasTitleEl.addEventListener('input', () => {
  document.title = canvasTitleEl.value || '∞ Code Canvas';
  resizeCanvasTitleInput();
  scheduleSave();
});

function saveState() {
  const data = {
    canvasTitle: canvasTitleEl.value,
    nodes: S.nodes.map(n => {
      if (n.type === 'bubble') {
        const { id, type, x, y, w, h, text, tailX, tailY, color } = n;
        return { id, type, x, y, w, h, text, tailX, tailY, color };
      }
      const { id, x, y, w, h, code, lang, title, filePath, showLineNumbers, lineNumberStart, color } = n;
      return { id, x, y, w, h, code, lang, title, filePath, showLineNumbers, lineNumberStart, color };
    }),
    links: S.links.map(({ id, fromId, text, toId }) => ({ id, fromId, text, toId })),
    nid: S.nid,
    lid: S.lid,
    vp: { ...S.vp },
    gitConfig: { ...S.gitConfig },
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    setStatus('⚠ Save failed: ' + e.message);
  }
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 500);
}

function loadState(data) {
  // clear existing DOM nodes
  S.nodes.forEach(n => ndEl(n.id)?.remove());
  S.nodes = [];
  S.links = [];
  S.sel = null;
  S.editing = null;
  S.multiSel.clear();
  S.clipboard = [];
  svgLinks.querySelectorAll('.lk').forEach(e => e.remove());

  S.nid = data.nid ?? 1;
  S.lid = data.lid ?? 1;
  if (data.vp) Object.assign(S.vp, data.vp);
  if (data.gitConfig) Object.assign(S.gitConfig, data.gitConfig);
  canvasTitleEl.value = data.canvasTitle ?? '';
  document.title = data.canvasTitle || '∞ Code Canvas';
  resizeCanvasTitleInput();

  S.links = data.links ?? [];

  for (const nd of (data.nodes ?? [])) {
    let n;
    if (nd.type === 'bubble') {
      n = { id: nd.id, type: 'bubble', x: nd.x, y: nd.y, w: nd.w, h: nd.h,
            text: nd.text ?? '', tailX: nd.tailX ?? nd.x + nd.w / 2, tailY: nd.tailY ?? nd.y + nd.h + 50,
            color: nd.color ?? 'green' };
    } else {
      n = { id: nd.id, x: nd.x, y: nd.y, w: nd.w, h: nd.h, code: nd.code,
            lang: nd.lang ?? 'text', title: nd.title ?? '', filePath: nd.filePath ?? '',
            showLineNumbers: nd.showLineNumbers ?? true, lineNumberStart: nd.lineNumberStart ?? 1,
            color: nd.color ?? 'blue' };
    }
    S.nodes.push(n);
    const el = document.createElement('div');
    el.className = 'node' + (n.type === 'bubble' ? ' bubble-node' : '');
    el.id = 'nd-' + n.id;
    canvas.appendChild(el);
    setupNodeEvents(n, el);
    renderNode(n, el);
  }
  renderLinks();
  applyVP();
}

function restoreFromStorage() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  try {
    loadState(JSON.parse(raw));
    return true;
  } catch (e) {
    console.warn('Restore failed:', e);
    return false;
  }
}

// save on drag/resize end
document.addEventListener('mouseup', () => {
  if (S.drag || S.resize) scheduleSave();
}, true);

// save on pan end
document.addEventListener('mouseup', () => {
  if (S.pan) scheduleSave();
}, true);

// ═══════════════════════════════════════════════════════
// GIT UTILITIES
// ═══════════════════════════════════════════════════════
function parseGitHubUrl(url) {
  const m = url.trim().match(/github\.com[:/]([^/]+)\/([^/.?\s]+)/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

// ═══════════════════════════════════════════════════════
// GIT CONFIG DIALOG
// ═══════════════════════════════════════════════════════
(function () {
  const overlay   = document.getElementById('git-dialog-overlay');
  const urlEl     = document.getElementById('git-url');
  const branchEl  = document.getElementById('git-branch');
  const tagEl     = document.getElementById('git-tag');
  const commitEl  = document.getElementById('git-commit');
  const noteEl    = document.getElementById('git-resolve-note');
  const saveBtn   = document.getElementById('git-save');
  const cancelBtn = document.getElementById('git-cancel');

  function openDialog() {
    urlEl.value    = S.gitConfig.url;
    branchEl.value = S.gitConfig.branch;
    tagEl.value    = S.gitConfig.tag;
    commitEl.value = S.gitConfig.commitHash;
    setNote('', '');
    overlay.style.display = 'flex';
    urlEl.focus();
  }

  function closeDialog() {
    overlay.style.display = 'none';
  }

  function setNote(msg, type) {
    noteEl.textContent = msg;
    noteEl.className = 'git-form-note' + (type ? ' ' + type : '');
  }

  // Resolve branch HEAD commit hash via GitHub API
  async function resolveBranch(owner, repo, branch) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`
    );
    if (!res.ok) throw new Error(`branch not found (HTTP ${res.status})`);
    const data = await res.json();
    return data.commit?.sha ?? null;
  }

  // Resolve tag → commit hash via GitHub API (handles annotated tags)
  async function resolveTag(owner, repo, tag) {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/ref/tags/${encodeURIComponent(tag)}`
    );
    if (!res.ok) throw new Error(`tag not found (HTTP ${res.status})`);
    const data = await res.json();
    if (!data.object) throw new Error('unexpected API response');
    if (data.object.type === 'commit') return data.object.sha;
    // annotated tag → dereference the tag object
    if (data.object.type === 'tag') {
      const res2 = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/tags/${data.object.sha}`
      );
      if (!res2.ok) throw new Error(`tag object not found (HTTP ${res2.status})`);
      const data2 = await res2.json();
      return data2.object?.sha ?? null;
    }
    return null;
  }

  saveBtn.addEventListener('click', async () => {
    const url    = urlEl.value.trim();
    const branch = branchEl.value.trim();
    const tag    = tagEl.value.trim();
    let   commit = commitEl.value.trim();

    // Warn if both branch and tag are filled
    if (branch && tag) {
      setNote('⚠ Both branch and tag are filled. Please specify only one.', 'warn');
      return;
    }

    const needResolve = (branch || tag) && !commit;
    if (needResolve) {
      const gh = parseGitHubUrl(url);
      if (!gh) {
        // Not a GitHub URL — save without hash
        setNote('Not a GitHub URL — skipping commit hash auto-resolution.', 'warn');
        applyAndSave(url, branch, tag, '');
        return;
      }
      saveBtn.disabled = true;
      setNote('⏳ Resolving commit hash...', '');
      try {
        if (branch) {
          commit = await resolveBranch(gh.owner, gh.repo, branch);
          setNote(`✓ HEAD of ${branch}: ${commit.slice(0, 12)}…`, 'ok');
        } else {
          commit = await resolveTag(gh.owner, gh.repo, tag);
          setNote(`✓ Commit for ${tag}: ${commit.slice(0, 12)}…`, 'ok');
        }
      } catch (e) {
        setNote(`✗ Resolution failed: ${e.message}`, 'err');
        saveBtn.disabled = false;
        return;
      }
      saveBtn.disabled = false;
    }

    applyAndSave(url, branch, tag, commit);
  });

  function applyAndSave(url, branch, tag, commitHash) {
    S.gitConfig = { url, branch, tag, commitHash };
    saveState();
    closeDialog();
    setStatus('Git settings saved');
  }

  cancelBtn.addEventListener('click', closeDialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDialog(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') closeDialog();
  });

  document.getElementById('btn-add-bubble').addEventListener('click', () => {
  const vw = wrap.clientWidth, vh = wrap.clientHeight;
  const p = s2c(vw / 2, vh / 2);
  addBubble(p.x - 100, p.y - 50);
});

document.getElementById('btn-git-config').addEventListener('click', openDialog);
})();

// ═══════════════════════════════════════════════════════
// GIT SNIPPET FETCH DIALOG
// ═══════════════════════════════════════════════════════
(function () {
  const overlay   = document.getElementById('fetch-dialog-overlay');
  const infoEl    = document.getElementById('fetch-git-info');
  const pathEl    = document.getElementById('fetch-path');
  const startEl   = document.getElementById('fetch-start');
  const endEl     = document.getElementById('fetch-end');
  const noteEl    = document.getElementById('fetch-note');
  const okBtn     = document.getElementById('fetch-ok');
  const cancelBtn = document.getElementById('fetch-cancel');
  let targetNodeId = null;

  function setNote(msg, type) {
    noteEl.textContent = msg;
    noteEl.className = 'git-form-note' + (type ? ' ' + type : '');
  }

  function close() { overlay.style.display = 'none'; }

  window.openFetchDialog = function (nodeId) {
    targetNodeId = nodeId;
    const n = S.nodes.find(n => n.id === nodeId);
    pathEl.value  = n?.filePath ?? '';
    startEl.value = '';
    endEl.value   = '';
    setNote('', '');

    const gc = S.gitConfig;
    if (gc.url) {
      const ref = gc.commitHash ? gc.commitHash.slice(0, 12) + '…'
                : gc.branch     ? `branch: ${gc.branch}`
                : gc.tag        ? `tag: ${gc.tag}`
                : '(no ref set)';
      infoEl.textContent = `${gc.url}  /  ${ref}`;
      infoEl.className = 'git-form-note ok';
    } else {
      infoEl.textContent = '⚠ Git settings not configured. Please set them via "⎇ Git Config" in the toolbar first.';
      infoEl.className = 'git-form-note warn';
    }

    overlay.style.display = 'flex';
    pathEl.focus();
  };

  okBtn.addEventListener('click', async () => {
    const gc = S.gitConfig;
    if (!gc.url) { setNote('⚠ Please set a repository URL in Git Config.', 'err'); return; }
    const gh = parseGitHubUrl(gc.url);
    if (!gh) { setNote('⚠ Only GitHub URLs are supported.', 'err'); return; }
    const ref = gc.commitHash || gc.branch || gc.tag;
    if (!ref) { setNote('⚠ Please set a branch, tag, or commit hash in Git Config.', 'err'); return; }

    const filePath  = pathEl.value.trim();
    const startLine = parseInt(startEl.value, 10);
    const endLine   = parseInt(endEl.value, 10);
    if (!filePath)                          { setNote('⚠ Please enter a relative path.', 'err'); return; }
    if (isNaN(startLine) || startLine < 1)  { setNote('⚠ Please enter a valid start line number.', 'err'); return; }
    if (isNaN(endLine) || endLine < startLine) { setNote('⚠ End line must be ≥ start line.', 'err'); return; }

    okBtn.disabled = true;
    setNote('⏳ Fetching…', '');
    try {
      const cleanPath = filePath.replace(/^\//, '');
      const rawUrl = `https://raw.githubusercontent.com/${gh.owner}/${gh.repo}/${ref}/${cleanPath}`;
      const res = await fetch(rawUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const text  = await res.text();
      const lines = text.split('\n');
      const sliced = lines.slice(startLine - 1, endLine);
      // Trim trailing empty line if the file ends with \n
      if (sliced.length > 0 && sliced[sliced.length - 1] === '') sliced.pop();
      const code = sliced.join('\n');

      const n = S.nodes.find(n => n.id === targetNodeId);
      if (!n) { setNote('⚠ Node not found.', 'err'); okBtn.disabled = false; return; }
      n.code            = code;
      n.filePath        = filePath;
      n.lineNumberStart = startLine;
      n.showLineNumbers = true;
      renderNode(n, ndEl(n.id));
      autoFitNode(n);
      scheduleSave();
      setNote(`✓ Fetched ${sliced.length} line(s).`, 'ok');
      setTimeout(close, 900);
    } catch (e) {
      setNote(`✗ Fetch failed: ${e.message}`, 'err');
    }
    okBtn.disabled = false;
  });

  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') close();
  });
})();

// Export
document.getElementById('btn-export').addEventListener('click', () => {
  saveState();
  const raw = localStorage.getItem(STORAGE_KEY) ?? '{}';
  const data = JSON.stringify(JSON.parse(raw), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `code-canvas-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus('Exported');
});

// Import
document.getElementById('btn-import').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      loadState(data);
      localStorage.setItem(STORAGE_KEY, ev.target.result);
      setStatus('Imported');
    } catch (err) {
      alert('Failed to load JSON: ' + err.message);
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});

// Clear
document.getElementById('btn-clear').addEventListener('click', () => {
  if (!confirm('Clear the entire canvas?')) return;
  localStorage.removeItem(STORAGE_KEY);
  S.nodes.forEach(n => ndEl(n.id)?.remove());
  S.nodes = []; S.links = []; S.nid = 1; S.lid = 1;
  S.sel = null; S.editing = null;
  S.multiSel.clear(); S.clipboard = [];
  S.gitConfig = { url: '', branch: '', tag: '', commitHash: '' };
  svgLinks.querySelectorAll('.lk').forEach(e => e.remove());
  svgLinks.querySelectorAll('[data-btail]').forEach(e => e.remove());
  setStatus('Cleared');
});

// ═══════════════════════════════════════════════════════
// CODESNIPPETD DIALOG
// ═══════════════════════════════════════════════════════
(function () {
  const overlay          = document.getElementById('codesnippetd-dialog-overlay');
  const endpointEl       = document.getElementById('csd-endpoint');
  const apiTabsEl        = document.getElementById('csd-api-tabs');
  const useCtagsEl       = document.getElementById('csd-use-ctags');
  let   currentApiType   = 'snippets';
  const contextEl        = document.getElementById('csd-context');
  const keywordEl        = document.getElementById('csd-keyword');
  const noteEl           = document.getElementById('csd-note');
  const fetchBtn         = document.getElementById('csd-fetch');
  const cancelBtn        = document.getElementById('csd-cancel');
  const mainForm         = document.getElementById('codesnippetd-main-form');
  const resultsDiv       = document.getElementById('codesnippetd-results');
  const tableWrap        = document.getElementById('csd-table-wrap');
  const resultsNoteEl    = document.getElementById('csd-results-note');
  const backBtn          = document.getElementById('csd-results-back');
  const resultsCancelBtn = document.getElementById('csd-results-cancel');
  const wasmResultsDiv   = document.getElementById('codesnippetd-wasm-results');
  const wasmStatusEl     = document.getElementById('csd-wasm-status');
  const wasmTableWrap    = document.getElementById('csd-wasm-table-wrap');
  const wasmBackBtn      = document.getElementById('csd-wasm-back');
  const wasmCancelBtn    = document.getElementById('csd-wasm-cancel');
  const wasmOkBtn        = document.getElementById('csd-wasm-ok');

  let targetNodeId       = null;
  let pendingFetch       = null; // { endpoint, keyword }
  let pendingPipeItem    = null; // /pipe response
  let pendingCtagsName   = null; // first tag name from ctags

  // ── ctags-wasm integration ──────────────────────────────────────────
  let _ctagsCaptured = '';
  let _ctagsModule   = null;
  let _ctagsInitProm = null;

  function ensureCtags() {
    if (_ctagsModule)   return Promise.resolve(_ctagsModule);
    if (_ctagsInitProm) return _ctagsInitProm;
    if (typeof CTagsModule === 'undefined') return Promise.resolve(null);
    _ctagsInitProm = CTagsModule({
      print:    line => { _ctagsCaptured += line + '\n'; },
      printErr: ()   => {},
    }).then(m => {
      m._ctags_init();
      _ctagsModule = m;
      return m;
    }).catch(() => null);
    return _ctagsInitProm;
  }

  async function runCtagsFull(code, filename) {
    const m = await ensureCtags();
    if (!m) return { firstTagName: null, tags: [] };
    m.ccall('ctags_set_output_format', null, ['string'], ['json']);
    _ctagsCaptured = '';
    const enc = new TextEncoder().encode(code);
    m.ccall('ctags_parse_buffer', null, ['string', 'array', 'number'], [filename, enc, enc.length]);
    const tags = [];
    let firstTagName = null;
    for (const line of _ctagsCaptured.trim().split('\n')) {
      try {
        const t = JSON.parse(line);
        if (t._type === 'tag' && t.name) {
          if (!firstTagName) firstTagName = t.name;
          tags.push(t);
        }
      } catch (_) {}
    }
    return { firstTagName, tags };
  }
  // ───────────────────────────────────────────────────────────────────

  function updateApiTypeUI() {
    const isPipe = currentApiType === 'pipe';
    contextEl.disabled = isPipe;
    keywordEl.disabled = isPipe;
    contextEl.closest('.git-form-row').style.opacity = isPipe ? '0.4' : '';
    keywordEl.closest('.git-form-row').style.opacity = isPipe ? '0.4' : '';
    useCtagsEl.disabled = !isPipe;
    useCtagsEl.parentElement.style.opacity = isPipe ? '' : '0.4';
    fetchBtn.disabled = false;
  }

  apiTabsEl.addEventListener('click', e => {
    const tab = e.target.closest('.csd-tab');
    if (!tab) return;
    currentApiType = tab.dataset.value;
    apiTabsEl.querySelectorAll('.csd-tab').forEach(t => t.classList.toggle('active', t === tab));
    updateApiTypeUI();
  });

  function setNote(msg, type) {
    noteEl.textContent = msg;
    noteEl.className = 'git-form-note' + (type ? ' ' + type : '');
  }

  function setResultsNote(msg, type) {
    resultsNoteEl.textContent = msg;
    resultsNoteEl.className = 'git-form-note' + (type ? ' ' + type : '');
  }

  function close() {
    overlay.style.display = 'none';
    showMain();
  }

  function showMain() {
    mainForm.style.display       = '';
    resultsDiv.style.display     = 'none';
    wasmResultsDiv.style.display = 'none';
  }

  function showResults() {
    mainForm.style.display       = 'none';
    resultsDiv.style.display     = '';
    wasmResultsDiv.style.display = 'none';
  }

  function showWasmResults() {
    mainForm.style.display       = 'none';
    resultsDiv.style.display     = 'none';
    wasmResultsDiv.style.display = '';
  }

  function setWasmStatus(msg, type) {
    wasmStatusEl.textContent = msg;
    wasmStatusEl.className = 'git-form-note' + (type ? ' ' + type : '');
  }

  function buildWasmTable(tags) {
    if (tags.length === 0) {
      wasmTableWrap.innerHTML = '<div style="font-size:12px;color:#8b949e;padding:8px;">No tags found</div>';
      return;
    }
    const FIXED = ['name', 'kind', 'line', 'pattern'];
    const keys  = FIXED.filter(k => tags.some(t => t[k] != null));
    const header = '<tr><th>#</th>' + keys.map(k => `<th>${esc(k)}</th>`).join('') + '</tr>';
    const rows = tags.map((t, i) => {
      const cells = keys.map(k => {
        let val = t[k] != null ? String(t[k]) : '';
        if (k === 'pattern') val = val.replace(/^\/\^?/, '').replace(/\$?\/$/, '').trim();
        return `<td>${esc(val)}</td>`;
      }).join('');
      return `<tr class="csd-wasm-row"><td>${i + 1}</td>${cells}</tr>`;
    }).join('');
    wasmTableWrap.innerHTML =
      `<table class="csd-table"><thead>${header}</thead><tbody>${rows}</tbody></table>`;
  }

  window.openCodeSnippetdDialog = function (nodeId) {
    targetNodeId = nodeId;
    pendingFetch = null;
    setNote('', '');
    updateApiTypeUI();
    showMain();
    overlay.style.display = 'flex';
    if (currentApiType !== 'pipe') keywordEl.focus();
  };

  async function fetchAndInsert(endpoint, keyword, index) {
    const url = `http://${endpoint}/snippets/${encodeURIComponent(keyword)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0) throw new Error('Empty snippets response');
    const item = list[index];
    if (!item || typeof item.code !== 'string') throw new Error('Invalid snippet at index ' + index);
    const n = S.nodes.find(n => n.id === targetNodeId);
    if (!n) throw new Error('Node not found');
    n.code = item.code;
    n.title = keyword;
    if (typeof item.path === 'string' && item.path) n.filePath = item.path;
    if (typeof item.start === 'number' && item.start > 0) {
      n.lineNumberStart = item.start;
      n.showLineNumbers = true;
    }
    renderNode(n, ndEl(n.id));
    autoFitNode(n);
    scheduleSave();
    close();
    setStatus('Snippet inserted');
  }

  function buildResultsTable(tags) {
    // Collect all unique keys across every row (excluding internal _type field).
    const keySet = new Set();
    tags.forEach(tag => {
      if (typeof tag === 'object' && tag !== null) {
        Object.keys(tag).forEach(k => { if (k !== '_type') keySet.add(k); });
      }
    });
    const FIXED = ['name', 'path', 'pattern', 'kind'];
    const rest  = Array.from(keySet).filter(k => !FIXED.includes(k)).sort();
    const keys  = [...FIXED.filter(k => keySet.has(k)), ...rest];

    const headerCells = keys.map(k => `<th>${esc(k)}</th>`).join('');

    const tbody = tags.map((tag, i) => {
      const cells = typeof tag === 'object' && tag !== null
        ? keys.map(k => `<td>${tag[k] !== undefined ? esc(String(tag[k])) : ''}</td>`).join('')
        : `<td colspan="${keys.length || 1}">${esc(String(tag))}</td>`;
      return `<tr class="csd-result-row" data-index="${i}"><td>${i + 1}</td>${cells}</tr>`;
    }).join('');

    tableWrap.innerHTML = `
      <table class="csd-table">
        <thead><tr><th>#</th>${headerCells}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>`;

    tableWrap.querySelectorAll('.csd-result-row').forEach(row => {
      row.addEventListener('click', async () => {
        const index = parseInt(row.dataset.index, 10);
        setResultsNote('⏳ Fetching snippet…', '');
        try {
          await fetchAndInsert(pendingFetch.endpoint, pendingFetch.keyword, index);
        } catch (e) {
          setResultsNote(`✗ Failed: ${e.message}`, 'err');
        }
      });
    });
  }

  fetchBtn.addEventListener('click', async () => {
    const endpoint = endpointEl.value.trim();
    if (!endpoint) { setNote('⚠ API Endpoint is required.', 'err'); return; }

    if (currentApiType === 'pipe') {
      fetchBtn.disabled = true;
      setNote('⏳ Fetching…', '');
      try {
        const res = await fetch(`http://${endpoint}/pipe`);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const item = await res.json();
        if (!item || typeof item.code !== 'string') throw new Error('Invalid /pipe response');

        pendingPipeItem  = item;
        pendingCtagsName = null;
        setNote('', '');

        if (useCtagsEl.checked) {
          // Switch to wasm results pane
          wasmOkBtn.disabled = true;
          wasmTableWrap.innerHTML = '';
          setWasmStatus('⏳ Running ctags-wasm…', '');
          showWasmResults();

          const { firstTagName, tags } = await runCtagsFull(item.code, item.path || 'input');
          pendingCtagsName = firstTagName;
          setWasmStatus('✓ Ctags-wasm complete', 'ok');
          buildWasmTable(tags);
          wasmOkBtn.disabled = false;
        } else {
          // Apply immediately without ctags
          applyPipeItem();
        }
      } catch (e) {
        showMain();
        setNote(`✗ Fetch failed: ${e.message}`, 'err');
      }
      fetchBtn.disabled = false;
      return;
    }

    // /snippets mode
    const context  = contextEl.value.trim();
    const keyword  = keywordEl.value.trim();
    if (!keyword) { setNote('⚠ Keyword is required.', 'err'); return; }

    let tagsUrl = `http://${endpoint}/tags/${encodeURIComponent(keyword)}`;
    if (context) tagsUrl += `?context=${encodeURIComponent(context)}`;

    fetchBtn.disabled = true;
    setNote('⏳ Fetching…', '');
    try {
      const res = await fetch(tagsUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const tags = await res.json();
      if (!Array.isArray(tags)) throw new Error('Expected a JSON array from /tags');

      if (tags.length === 0) {
        setNote('⚠ No snippets found for this keyword.', 'warn');
        fetchBtn.disabled = false;
        return;
      }

      if (tags.length === 1) {
        await fetchAndInsert(endpoint, keyword, 0);
      } else {
        pendingFetch = { endpoint, keyword };
        setResultsNote('', '');
        buildResultsTable(tags);
        showResults();
      }
    } catch (e) {
      setNote(`✗ Fetch failed: ${e.message}`, 'err');
    }
    fetchBtn.disabled = false;
  });

  function applyPipeItem() {
    const item = pendingPipeItem;
    if (!item) return;
    const n = S.nodes.find(n => n.id === targetNodeId);
    if (!n) { close(); return; }
    n.code = item.code;
    if (typeof item.title === 'string' && item.title) n.title = item.title;
    if (typeof item.lang  === 'string' && item.lang)  n.lang  = item.lang;
    if (typeof item.path  === 'string' && item.path)  n.filePath = item.path;
    if (typeof item.start === 'number' && item.start > 0) {
      n.lineNumberStart = item.start;
      n.showLineNumbers = true;
    }
    if (pendingCtagsName) n.title = pendingCtagsName;
    renderNode(n, ndEl(n.id));
    autoFitNode(n);
    scheduleSave();
    close();
    setStatus('Snippet inserted via /pipe');
  }

  wasmOkBtn.addEventListener('click', applyPipeItem);

  wasmBackBtn.addEventListener('click', () => { showMain(); });
  wasmCancelBtn.addEventListener('click', close);
  backBtn.addEventListener('click', showMain);
  resultsCancelBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') { close(); return; }
    if (e.key === 'Enter' && mainForm.style.display !== 'none') fetchBtn.click();
  });
})();

// ═══════════════════════════════════════════════════════
// HELP DIALOG
// ═══════════════════════════════════════════════════════
(function () {
  const overlay = document.getElementById('help-dialog-overlay');
  const closeBtn = document.getElementById('help-close');

  document.getElementById('btn-help').addEventListener('click', () => {
    overlay.style.display = 'flex';
  });
  closeBtn.addEventListener('click', () => { overlay.style.display = 'none'; });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') overlay.style.display = 'none';
  });
})();

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
(async () => {
  const dataUrl = new URLSearchParams(location.search).get('data');
  if (dataUrl) {
    setStatus('Loading data from URL…');
    try {
      const res = await fetch(dataUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      loadState(data);
      saveState();
      setStatus('Imported from URL');
    } catch (e) {
      setStatus('⚠ Failed to load data from URL: ' + e.message);
      restoreFromStorage();
    }
  } else if (window.__initialData && !sessionStorage.getItem('canvas-initial-loaded')) {
    sessionStorage.setItem('canvas-initial-loaded', '1');
    loadState(window.__initialData);
    saveState();
  } else {
    restoreFromStorage();
  }
})()

setStatus('Ready — double-click to add block | select text to create link | Alt+click to delete link');

// ═══════════════════════════════════════════════════════
// TEST EXPORTS (Node.js / Vitest only — not used in browser)
// ═══════════════════════════════════════════════════════
if (typeof globalThis !== 'undefined' && typeof process !== 'undefined') {
  globalThis.__canvasApp = { S, addNode, removeNode, selectNode, addBubble, loadState,
    saveState, restoreFromStorage,
    createLink, removeLink,
    copyNodes, cutNodes, pasteNodes, toggleMultiSel };
}
