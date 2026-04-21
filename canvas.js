import { DATA_VERSION, esc, EXT_LANG, langFromPath, NODE_COLORS,
         injectAnchor, splitHtmlLines, addLineNumbers,
         roundedRectRayHit, anchorFpFromSide, edgePoint } from './canvas-utils.js';
import { initDialogs, showAlert } from './canvas-dialogs.js';

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
  clipboard: [],    // copied items: node or freeline snapshots (tagged with _clipType)
  pending: null,    // { fromId, text }
  globalConfig: { description: '', repositories: [] },
  tailDrag: null,   // { id, otailX, otailY } — bubble tail being dragged
  marquee: null,    // { sx, sy, ex, ey } — rubber-band selection in screen coords
  freeLines: [],    // standalone line objects
  flid: 1,          // next free-line id
  lineDrawMode: false,
  drawingLine: null, // { points: [{x,y}...], cursorPt: {x,y} } — line being drawn
  selLine: null,    // selected free-line id
  lineDrag: null,   // { id, sx, sy, origPoints } — line being dragged
  ptDrag: null,     // { lineId, ptIndex, sx, sy, origPt } — single point being dragged
  undoStack: [],    // undo history (up to 10 snapshots)
};

// ═══════════════════════════════════════════════════════
// DOM REFS
// ═══════════════════════════════════════════════════════
const wrap        = document.getElementById('wrap');
const canvas      = document.getElementById('canvas');
const svgLinks    = document.getElementById('svg-links');
const svgTails    = document.getElementById('svg-tails');
const linkTip        = document.getElementById('link-tip');
const linkTipLink    = document.getElementById('link-tip-link');
const linkTipNewBlock = document.getElementById('link-tip-newblock');
const linkCtx        = document.getElementById('link-ctx');
const linkCtxDel     = document.getElementById('link-ctx-del');
const linkCtxColors  = document.getElementById('link-ctx-colors');
const linkCtxWidths  = document.getElementById('link-ctx-widths');
const linkCtxDashes  = document.getElementById('link-ctx-dashes');
const linkPreviewEl  = document.getElementById('link-preview');
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
  renderFreeLines();
  const zi = document.getElementById('zoom-input');
  if (zi && document.activeElement !== zi) zi.value = Math.round(scale * 100) + '%';
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
  // Sort by descending text length so longer anchors are injected first.
  // This prevents a shorter substring (e.g. "newContainerEvent") from being
  // wrapped before a longer string that contains it
  // (e.g. "newContainerEventWithInspectData"), which would cause the longer
  // string's injection to fail because its text no longer forms a contiguous
  // run in the HTML.
  const nodeLinks = S.links.filter(l => l.fromId === nodeId)
                            .sort((a, b) => b.text.length - a.text.length);
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
  } else if (n.type === 'frame') {
    const c = NODE_COLORS.find(c => c.id === (n.color ?? 'blue')) ?? NODE_COLORS.find(c => c.id === 'blue');
    el.style.setProperty('--fn-bg',         c.bgDark + 'cc');
    el.style.setProperty('--fn-border',     c.hex + '55');
    el.style.setProperty('--fn-border-sel', c.hex);
    el.style.setProperty('--fn-glow',       c.glow28);
    el.style.setProperty('--fn-label',      c.hexLight);
    el.style.setProperty('--fn-header-bg',  c.bgMid + 'aa');
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
  pushUndo();
  const n = {
    id: S.nid++, x, y, w: 430, h: 270,
    code: code ?? '',
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
  renderLinks();
  selectNode(n.id);
  _suppressUndo = true;
  startEdit(n.id);
  _suppressUndo = false;
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

  if (n.type === 'frame') {
    renderFrameContent(n, el);
  } else if (n.type === 'bubble') {
    renderBubbleContent(n, el);
    renderBubbleTail(n);
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

    // Edit menu toggle (⚙)
    const menuWrap = el.querySelector('.edit-menu-wrap');
    const menuBtn  = el.querySelector('.btn-edit-menu');
    if (menuBtn) {
      menuBtn.addEventListener('mousedown', e => e.stopPropagation());
      menuBtn.addEventListener('click', e => {
        e.stopPropagation();
        menuWrap.classList.toggle('open');
      });
    }
    const btnFetchEdit = el.querySelector('.btn-fetch-git');
    if (btnFetchEdit) {
      btnFetchEdit.addEventListener('mousedown', e => e.stopPropagation());
      btnFetchEdit.addEventListener('click', e => {
        e.stopPropagation(); menuWrap.classList.remove('open'); openFetchDialog(n.id);
      });
    }
    const btnCsdEdit = el.querySelector('.btn-codesnippetd');
    if (btnCsdEdit) {
      btnCsdEdit.addEventListener('mousedown', e => e.stopPropagation());
      btnCsdEdit.addEventListener('click', e => {
        e.stopPropagation(); menuWrap.classList.remove('open'); openCodeSnippetdDialog(n.id);
      });
    }
    bindZOrderButtons(n, el);

    ta.focus();
  } else {
    const { html, lang } = n.code
      ? buildCodeHTML(n.code, n.id)
      : highlight(defaultCode(), n.filePath);
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
      pushUndo();
      S.resize = { id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, ow: n.w, oh: n.h, edge: 'se' };
    });
  }
  setupEdgeResizeHandles(n, el);
}

function setupEdgeResizeHandles(n, el) {
  el.querySelectorAll('.resize-edge').forEach(h => h.remove());
  for (const edge of ['n', 's', 'e', 'w']) {
    const h = document.createElement('div');
    h.className = `resize-edge resize-edge-${edge}`;
    h.addEventListener('mousedown', e => {
      e.stopPropagation(); e.preventDefault();
      pushUndo();
      S.resize = { id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, ow: n.w, oh: n.h, edge };
    });
    el.appendChild(h);
  }
}

// ═══════════════════════════════════════════════════════
// BUBBLE NODE
// ═══════════════════════════════════════════════════════
function bubbleViewHTML(n) {
  const body = n.text
    ? `<div class="bubble-text">${esc(n.text).replace(/\n/g, '<br>')}</div>`
    : `<div class="bubble-text empty">Enter text…</div>`;
  const tailChecked = n.showTail !== false ? 'checked' : '';
  return `
  <div class="bubble-header">
    <div class="node-actions">
      <label class="bubble-tail-toggle"><input type="checkbox" class="chk-show-tail" ${tailChecked}> Tail</label>
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
      <div class="edit-menu-wrap">
        <button class="node-btn btn-edit-menu" title="More options">•••</button>
        <div class="edit-menu">
          ${colorSwatchesHTML(n.color, 'green')}
          ${zOrderMenuHTML()}
        </div>
      </div>
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
  el.classList.toggle('is-editing', S.editing === n.id);
  if (S.editing === n.id) {
    el.innerHTML = bubbleEditHTML(n);
    const ta = el.querySelector('textarea');
    ta.style.height = (n.h - 24) + 'px';
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
    const menuWrap = el.querySelector('.edit-menu-wrap');
    const menuBtn  = el.querySelector('.btn-edit-menu');
    if (menuBtn) {
      menuBtn.addEventListener('mousedown', e => e.stopPropagation());
      menuBtn.addEventListener('click', e => { e.stopPropagation(); menuWrap.classList.toggle('open'); });
    }
    bindZOrderButtons(n, el);
    ta.focus();
  } else {
    el.innerHTML = bubbleViewHTML(n);
    el.querySelector('.btn-edit').addEventListener('click', e => { e.stopPropagation(); startEdit(n.id); });
    el.querySelector('.btn-del').addEventListener('click', e => { e.stopPropagation(); removeNode(n.id); });
    el.querySelector('.bubble-body').addEventListener('dblclick', e => { e.stopPropagation(); startEdit(n.id); });
    const chk = el.querySelector('.chk-show-tail');
    chk.addEventListener('mousedown', e => e.stopPropagation());
    chk.addEventListener('change', e => {
      e.stopPropagation();
      n.showTail = chk.checked;
      renderBubbleTail(n);
      scheduleSave();
    });
  }
}

// Draw bubble tail as smooth SVG path + draggable handle (canvas coords, inline in bubble div)
function renderBubbleTail(n) {
  const el = ndEl(n.id);
  if (!el) return;

  // Remove existing SVG and bail if tail is hidden
  const existing = el.querySelector('.bubble-tail-svg');
  if (n.showTail === false) {
    if (existing) existing.remove();
    return;
  }

  // Find or create the inline SVG inside the bubble div
  let svg = existing;
  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'bubble-tail-svg');
    el.appendChild(svg);
  }
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  // The SVG is position:absolute inside the bubble div, so its coordinate origin
  // is the padding-box top-left (= inner edge of the 3px border), not the outer corner.
  // Convert all geometry to SVG coords by subtracting the border width.
  const bord = 3; // must match CSS border-width on .bubble-node
  const cx  = n.w / 2 - bord;
  const cy  = n.h / 2 - bord;
  const bl  = { x: -bord,        y: -bord        }; // outer top-left in SVG coords
  const br  = { x: n.w - bord,   y: n.h - bord   }; // outer bottom-right in SVG coords
  const tip = { x: n.tailX - n.x - bord, y: n.tailY - n.y - bord };
  const r   = Math.min(14, n.w / 2, n.h / 2);

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

  // Size the SVG viewport to exactly cover all drawn elements (no reliance on overflow:visible)
  const pad = 10;
  const vbMinX = Math.min(bl.x, br.x, tip.x, p1.x, p2.x) - pad;
  const vbMinY = Math.min(bl.y, br.y, tip.y, p1.y, p2.y) - pad;
  const vbMaxX = Math.max(bl.x, br.x, tip.x, p1.x, p2.x) + pad;
  const vbMaxY = Math.max(bl.y, br.y, tip.y, p1.y, p2.y) + pad;
  svg.style.left   = vbMinX + 'px';
  svg.style.top    = vbMinY + 'px';
  svg.style.width  = (vbMaxX - vbMinX) + 'px';
  svg.style.height = (vbMaxY - vbMinY) + 'px';
  svg.setAttribute('viewBox', `${vbMinX} ${vbMinY} ${vbMaxX - vbMinX} ${vbMaxY - vbMinY}`);

  const fillD   = `M ${p1.x},${p1.y} Q ${cp1.x},${cp1.y} ${tip.x},${tip.y} Q ${cp2.x},${cp2.y} ${p2.x},${p2.y} Z`;
  const strokeD = `M ${p1.x},${p1.y} Q ${cp1.x},${cp1.y} ${tip.x},${tip.y} Q ${cp2.x},${cp2.y} ${p2.x},${p2.y}`;

  const isSelected = S.sel === n.id || S.multiSel.has(n.id);
  const _tc = NODE_COLORS.find(c => c.id === (n.color ?? 'green')) ?? NODE_COLORS.find(c => c.id === 'green');
  const stroke = isSelected ? _tc.hexLight : _tc.hex;

  const g = svgE('g');
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
    pushUndo();
    S.tailDrag = { id: n.id, otailX: n.tailX, otailY: n.tailY };
  });
  g.appendChild(handle);

  svg.appendChild(g);
}

function addBubble(x, y) {
  pushUndo();
  const n = {
    id: S.nid++, type: 'bubble',
    x, y, w: 200, h: 100,
    text: '',
    tailX: x + 100, tailY: y + 140,
    color: 'green',
    showTail: true,
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
  _suppressUndo = true;
  startEdit(n.id);
  _suppressUndo = false;
  scheduleSave();
  return n;
}

// ═══════════════════════════════════════════════════════
// FRAME NODE
// ═══════════════════════════════════════════════════════
function renderFrameContent(n, el) {
  if (S.editing === n.id) {
    el.innerHTML = `
    <div class="frame-header">
      <input class="inp-title" placeholder="Label" value="${esc(n.label ?? '')}" spellcheck="false">
      <div class="node-actions" style="opacity:1">
        <div class="edit-menu-wrap">
          <button class="node-btn btn-edit-menu" title="More options">•••</button>
          <div class="edit-menu">
            ${colorSwatchesHTML(n.color, 'blue')}
            ${zOrderMenuHTML()}
          </div>
        </div>
        <button class="node-btn btn-done">&#x2713; Done</button>
        <button class="node-btn danger btn-del">Delete</button>
      </div>
    </div>
    <div class="resize-handle"></div>`;
    const inp = el.querySelector('.inp-title');
    inp.addEventListener('input', e => { n.label = e.target.value; });
    inp.addEventListener('mousedown', e => e.stopPropagation());
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
    const menuWrap = el.querySelector('.edit-menu-wrap');
    const menuBtn  = el.querySelector('.btn-edit-menu');
    if (menuBtn) {
      menuBtn.addEventListener('mousedown', e => e.stopPropagation());
      menuBtn.addEventListener('click', e => { e.stopPropagation(); menuWrap.classList.toggle('open'); });
    }
    bindZOrderButtons(n, el);
    inp.focus(); inp.select();
  } else {
    const labelHtml = n.label
      ? `<span class="frame-label">${esc(n.label)}</span>`
      : `<span class="frame-label" style="opacity:0.35">Frame</span>`;
    el.innerHTML = `
    <div class="frame-header">
      ${labelHtml}
      <div class="node-actions">
        <button class="node-btn btn-edit">Edit</button>
        <button class="node-btn danger btn-del">&#x2715;</button>
      </div>
    </div>
    <div class="resize-handle"></div>`;
    el.querySelector('.btn-edit').addEventListener('click', e => { e.stopPropagation(); startEdit(n.id); });
    el.querySelector('.btn-del').addEventListener('click', e => { e.stopPropagation(); removeNode(n.id); });
  }
}

function setupFrameEvents(n, el) {
  el.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    if (e.ctrlKey || e.metaKey) return;
    if (S.mode === 'hand' || S.spaceDown) {
      e.preventDefault();
      S.pan = { sx: e.clientX - S.vp.x, sy: e.clientY - S.vp.y };
      wrap.style.cursor = 'grabbing';
      return;
    }
    if (e.shiftKey) {
      if (!e.target.closest('.node-btn') && !e.target.closest('input')) {
        e.preventDefault();
        e.stopPropagation();
        if (S.sel !== null && !S.multiSel.has(S.sel)) {
          S.multiSel.add(S.sel);
          ndEl(S.sel)?.classList.add('multi-selected');
        }
        toggleMultiSel(n.id);
        const count = S.multiSel.size;
        setStatus(count > 0 ? `${count} block(s) selected` : 'Ready');
      }
      return;
    }
    const onHeader = e.target.closest('.frame-header') && !e.target.closest('.node-btn') && !e.target.closest('input');
    if (S.multiSel.size >= 1 && S.multiSel.has(n.id)) {
      S.sel = n.id;
      if (onHeader) {
        e.preventDefault();
        const allIds = new Set(S.multiSel);
        if (S.sel !== null) allIds.add(S.sel);
        const multiOrigins = new Map();
        allIds.forEach(id => {
          const mn = S.nodes.find(nn => nn.id === id);
          if (mn) multiOrigins.set(id, { ox: mn.x, oy: mn.y, otailX: mn.tailX, otailY: mn.tailY });
        });
        pushUndo();
        S.drag = { id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, multiOrigins };
        allIds.forEach(id => ndEl(id)?.classList.add('dragging'));
      }
      return;
    }
    clearMultiSel();
    selectNode(n.id);
    if (onHeader) {
      e.preventDefault();
      pushUndo();
      S.drag = { id: n.id, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y };
      el.classList.add('dragging');
    }
  });
  el.addEventListener('dblclick', e => {
    e.stopPropagation();
    if (!e.target.closest('.node-btn') && !e.target.closest('input')) {
      startEdit(n.id);
    }
  });
}

function addFrame(x, y, w, h, label, color) {
  pushUndo();
  const n = {
    id: S.nid++, type: 'frame',
    x, y, w, h,
    label: label ?? '',
    color: color ?? 'blue',
  };
  S.nodes.push(n);
  const el = document.createElement('div');
  el.className = 'frame-node';
  el.id = 'nd-' + n.id;
  canvas.appendChild(el);
  setupFrameEvents(n, el);
  renderNode(n, el);
  renderLinks();
  selectNode(n.id);
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
      <span class="lang-badge">${esc(n.lang)}</span>
      <div class="edit-menu-wrap">
        <button class="node-btn btn-edit-menu" title="More options">•••</button>
        <div class="edit-menu">
          ${colorSwatchesHTML(n.color, 'blue')}
          <button class="node-btn btn-fetch-git">⬇ Fetch</button>
          <button class="node-btn btn-codesnippetd">📦 codesnippetd</button>
          ${zOrderMenuHTML()}
        </div>
      </div>
      <button class="node-btn btn-done">✓ Done</button>
      <button class="node-btn danger btn-del">Delete</button>
    </div>
  </div>
  <div class="node-body">
    <textarea spellcheck="false" placeholder="${esc(defaultCode())}">${esc(n.code)}</textarea>
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
      <label class="ln-toggle" title="Show/hide line numbers"><input type="checkbox" class="ln-cb"${n.showLineNumbers ? ' checked' : ''}> Line No</label>
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
        setStatus(count > 0 ? `${count} block(s) selected — drag header to move all` : 'Ready — double-click to add block | select text to create link | right-click link to delete');
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
        pushUndo();
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
      pushUndo();
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
  pushUndo();
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
  // Dividing by scale gives CSS px.  Add the node's left+right borders so the
  // final node width is wide enough to fit the pre at its measured size.
  const cs = getComputedStyle(el);
  const borderH = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
  const borderV = parseFloat(cs.borderTopWidth)  + parseFloat(cs.borderBottomWidth);
  const codeW = Math.ceil(pre.getBoundingClientRect().width / S.vp.scale) + borderH;
  pre.style.display = '';
  pre.style.whiteSpace = '';
  codeLines.forEach(l => { l.style.whiteSpace = ''; });

  // Also keep header fully visible.
  const headW    = header ? Math.ceil(header.getBoundingClientRect().width / S.vp.scale) + borderH : 0;
  const naturalW = Math.max(250, codeW, headW);
  n.w = naturalW;
  el.style.width = naturalW + 'px';

  // Step 2: measure height at the new width (wrap may reflow lines).
  const headerH = header ? header.offsetHeight : 40;
  const newH    = Math.max(120, headerH + pre.scrollHeight + borderV);
  n.h = newH;
  el.style.height = newH + 'px';
}

function selectNode(id) {
  if (S.selLine !== null) {
    S.selLine = null;
    renderFreeLines();
  }
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
  pushUndo();
  // Collect source nodes whose link-anchor spans must be cleared
  const affectedFromIds = S.links
    .filter(l => l.toId === id)
    .map(l => l.fromId);

  S.nodes = S.nodes.filter(n => n.id !== id);
  S.links = S.links.filter(l => l.fromId !== id && l.toId !== id);
  const el = ndEl(id);
  if (el) el.remove();
  if (S.sel === id)     S.sel = null;
  if (S.editing === id) S.editing = null;
  S.multiSel.delete(id);

  // Re-render source nodes to remove stale link-anchor spans
  affectedFromIds.forEach(fromId => {
    const fn = S.nodes.find(n => n.id === fromId);
    if (fn) renderNode(fn);
  });

  renderLinks();
  scheduleSave();
}

// ═══════════════════════════════════════════════════════
// Z-ORDER
// ═══════════════════════════════════════════════════════
function zOrderMenuHTML() {
  return `
  <div class="menu-sep"></div>
  <button class="node-btn btn-zorder" data-dir="front">↑↑ Bring to Front</button>
  <button class="node-btn btn-zorder" data-dir="forward">↑ Bring Forward</button>
  <button class="node-btn btn-zorder" data-dir="backward">↓ Send Backward</button>
  <button class="node-btn btn-zorder" data-dir="back">↓↓ Send to Back</button>`;
}

function bindZOrderButtons(n, el) {
  el.querySelectorAll('.btn-zorder').forEach(btn => {
    btn.addEventListener('mousedown', e => e.stopPropagation());
    btn.addEventListener('click', e => {
      e.stopPropagation();
      el.querySelector('.edit-menu-wrap')?.classList.remove('open');
      reorderNode(n.id, btn.dataset.dir);
    });
  });
}

function reorderNode(id, dir) {
  const idx = S.nodes.findIndex(n => n.id === id);
  if (idx < 0) return;
  const el = ndEl(id);
  if (!el) return;

  if (dir === 'front') {
    S.nodes.push(S.nodes.splice(idx, 1)[0]);
    canvas.appendChild(el);
  } else if (dir === 'back') {
    S.nodes.unshift(S.nodes.splice(idx, 1)[0]);
    canvas.insertBefore(el, canvas.firstElementChild);
  } else if (dir === 'forward' && idx < S.nodes.length - 1) {
    const tmp = S.nodes[idx]; S.nodes[idx] = S.nodes[idx + 1]; S.nodes[idx + 1] = tmp;
    canvas.insertBefore(ndEl(S.nodes[idx].id), el);
  } else if (dir === 'backward' && idx > 0) {
    const tmp = S.nodes[idx]; S.nodes[idx] = S.nodes[idx - 1]; S.nodes[idx - 1] = tmp;
    canvas.insertBefore(el, ndEl(S.nodes[idx].id));
  } else {
    return;
  }
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
  const items = [];
  for (const id of getSelectedIds()) {
    const n = S.nodes.find(nn => nn.id === id);
    if (n) items.push({ _clipType: 'node', ...n });
  }
  if (S.selLine !== null) {
    const line = S.freeLines.find(l => l.id === S.selLine);
    if (line) items.push({ _clipType: 'freeline', ...line, points: line.points.map(p => ({ ...p })) });
  }
  if (items.length === 0) return;
  S.clipboard = items;
  setStatus(`${S.clipboard.length} object(s) copied (Cmd/Ctrl+V to paste)`);
}

function cutNodes() {
  pushUndo();
  const items = [];
  const ids = getSelectedIds();
  for (const id of ids) {
    const n = S.nodes.find(nn => nn.id === id);
    if (n) items.push({ _clipType: 'node', ...n });
  }
  _suppressUndo = true;
  ids.forEach(id => removeNode(id));
  if (S.selLine !== null) {
    const line = S.freeLines.find(l => l.id === S.selLine);
    if (line) items.push({ _clipType: 'freeline', ...line, points: line.points.map(p => ({ ...p })) });
    removeFreeLine(S.selLine);
  }
  _suppressUndo = false;
  if (items.length === 0) return;
  S.clipboard = items;
  setStatus(`${S.clipboard.length} object(s) cut (Cmd/Ctrl+V to paste)`);
}

function pasteNodes() {
  if (S.clipboard.length === 0) return;
  pushUndo();
  clearMultiSel();
  selectNode(null);
  const offset = 30;
  let pastedLineId = null;

  for (const data of S.clipboard) {
    if (data._clipType === 'freeline') {
      const line = {
        id: S.flid++,
        points: data.points.map(p => ({ x: p.x + offset, y: p.y + offset })),
        lineStyle: data.lineStyle || 'polyline',
        stroke: data.stroke || '#e6edf3',
        strokeWidth: data.strokeWidth || 2,
        dash: data.dash || '',
      };
      S.freeLines.push(line);
      pastedLineId = line.id;
    } else {
      // node (code block, bubble, frame) — _clipType may be 'node' or absent (legacy)
      const n = { ...data, id: S.nid++, x: data.x + offset, y: data.y + offset };
      delete n._clipType;
      if (n.type === 'bubble') {
        n.tailX = (data.tailX ?? data.x + data.w / 2) + offset;
        n.tailY = (data.tailY ?? data.y + data.h + 50) + offset;
      }
      S.nodes.push(n);
      const el = document.createElement('div');
      el.className = n.type === 'frame' ? 'frame-node'
                   : 'node' + (n.type === 'bubble' ? ' bubble-node' : '');
      el.id = 'nd-' + n.id;
      canvas.appendChild(el);
      if (n.type === 'frame') setupFrameEvents(n, el);
      else setupNodeEvents(n, el);
      renderNode(n, el);
      S.multiSel.add(n.id);
      ndEl(n.id)?.classList.add('multi-selected');
    }
  }

  if (pastedLineId !== null) {
    // Show pasted line; select it only when no nodes were pasted alongside
    renderFreeLines();
    if (S.multiSel.size === 0) {
      S.selLine = pastedLineId;
      renderFreeLines();
    }
  }

  // Shift clipboard so the next paste lands further offset
  S.clipboard = S.clipboard.map(d => {
    if (d._clipType === 'freeline') {
      return { ...d, points: d.points.map(p => ({ x: p.x + offset, y: p.y + offset })) };
    }
    return { ...d, x: d.x + offset, y: d.y + offset };
  });
  setStatus(`${S.clipboard.length} object(s) pasted`);
  scheduleSave();
}

function fitAll() {
  if (!S.nodes.length) return;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of S.nodes) {
    minX = Math.min(minX, n.x);
    minY = Math.min(minY, n.y);
    maxX = Math.max(maxX, n.x + n.w);
    maxY = Math.max(maxY, n.y + n.h);
    if (n.type === 'bubble') {
      minX = Math.min(minX, n.tailX);
      minY = Math.min(minY, n.tailY);
      maxX = Math.max(maxX, n.tailX);
      maxY = Math.max(maxY, n.tailY);
    }
  }
  const pad = 40;
  const tb = document.getElementById('toolbar');
  const tbBottom = tb ? tb.getBoundingClientRect().bottom : 0;
  const topPad = tbBottom + pad;
  const vw = wrap.clientWidth, vh = wrap.clientHeight;
  const availW = vw - pad * 2;
  const availH = vh - topPad - pad;
  const bw = maxX - minX, bh = maxY - minY;
  const ns = Math.min(4, Math.max(0.08, Math.min(availW / bw, availH / bh)));
  S.vp.scale = ns;
  const cx = pad + availW / 2;
  const cy = topPad + availH / 2;
  S.vp.x = cx - (minX + bw / 2) * ns;
  S.vp.y = cy - (minY + bh / 2) * ns;
  applyVP();
  setStatus(`Fit: ${Math.round(ns * 100)}%`);
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
  pushUndo();
  S.links.push({ id: S.lid++, fromId, text, toId, stroke: '#388bfd', strokeWidth: 1.5, dash: '' });
  renderNode(S.nodes.find(n => n.id === fromId));
  renderLinks();
  scheduleSave();
}

function removeLink(id) {
  pushUndo();
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

  if (fp.x > nBR.x) return { point: right,  side: 'right' };
  if (fp.y > nBR.y && fp.x > nTL.x) return { point: bottom, side: 'bottom' };
  if (fp.y < nTL.y && fp.x > nTL.x) return { point: top,    side: 'top' };
  return { point: left, side: 'left' };  // default: left edge, upper area
}

function renderLinks() {
  svgLinks.querySelectorAll('.lk').forEach(e => e.remove());
  for (const lnk of S.links) {
    const fn = S.nodes.find(n => n.id === lnk.fromId);
    const tn = S.nodes.find(n => n.id === lnk.toId);
    if (!fn || !tn) continue;

    // Start point: anchor element position if available, else node edge
    const anchorEl = document.querySelector(`.link-anchor[data-lid="${lnk.id}"]`);
    let fp, anchorRect;
    if (anchorEl) {
      anchorRect = anchorEl.getBoundingClientRect();
      fp = { x: anchorRect.left + anchorRect.width / 2, y: anchorRect.top + anchorRect.height / 2 };
    } else {
      fp = c2s(edgePoint(fn, tn).x, edgePoint(fn, tn).y);
    }

    const { point: tp, side } = targetEntryPoint(fp, tn);
    if (anchorEl) fp = anchorFpFromSide(anchorRect, side);

    const dx = tp.x - fp.x;
    const dy = tp.y - fp.y;
    const d = `M${fp.x},${fp.y} C${fp.x + dx * 0.45},${fp.y + dy * 0.1} ${tp.x - dx * 0.45},${tp.y - dy * 0.1} ${tp.x},${tp.y}`;

    const stroke = lnk.stroke || '#388bfd';
    const strokeWidth = lnk.strokeWidth || 1.5;
    const dash = lnk.dash || '';

    const g = svgE('g', { class: 'lk' });
    const pathEl = svgE('path', { d, class: 'link-path', 'marker-end': 'url(#arrow)' });
    pathEl.style.stroke = stroke;
    pathEl.style.strokeWidth = strokeWidth + 'px';
    if (dash) pathEl.style.strokeDasharray = dash;
    g.appendChild(pathEl);
    const hit = svgE('path', { d, class: 'link-hit' });
    hit.addEventListener('contextmenu', e => {
      e.preventDefault();
      showLinkCtx(lnk.id, e.clientX, e.clientY);
    });
    g.appendChild(hit);

    const mx = (fp.x + tp.x) / 2;
    const my = (fp.y + tp.y) / 2 - 9;
    const txt = svgE('text', { x: mx, y: my, class: 'link-label', 'text-anchor': 'middle' });
    txt.textContent = `"${lnk.text}"`;
    g.appendChild(txt);

    svgLinks.appendChild(g);
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
function enterLinkMode(fromId, text, anchorRect = null) {
  S.linkMode = true;
  S.pending = { fromId, text, anchorRect };
  document.body.classList.add('link-mode');
  setStatus(`🔗 Click the target block — "${text}" → ? (Esc to cancel)`);
}

function exitLinkMode() {
  S.linkMode = false;
  S.pending = null;
  document.body.classList.remove('link-mode');
  linkTip.style.display = 'none';
  linkPreviewEl.style.display = 'none';
  setStatus('Ready — double-click to add block | select text to create link | right-click link to delete');
}

// ═══════════════════════════════════════════════════════
// LINK CONTEXT MENU
// ═══════════════════════════════════════════════════════
const LINK_COLORS = [
  { label: 'Blue',   value: '#388bfd' },
  { label: 'Green',  value: '#3fb950' },
  { label: 'Yellow', value: '#d29922' },
  { label: 'Red',    value: '#f85149' },
  { label: 'Purple', value: '#bc8cff' },
  { label: 'Gray',   value: '#8b949e' },
  { label: 'White',  value: '#e6edf3' },
];

const LINK_WIDTHS = [
  { label: '1',   value: 1   },
  { label: '2',   value: 2   },
  { label: '3',   value: 3.5 },
  { label: '5',   value: 5   },
];

const LINK_DASHES = [
  { label: 'solid',  value: '',       title: 'Solid' },
  { label: 'dash',   value: '8 4',    title: 'Dashed' },
  { label: 'dot',    value: '2 4',    title: 'Dotted' },
  { label: 'ldash',  value: '16 6',   title: 'Long dash' },
  { label: 'ddot',   value: '8 4 2 4',title: 'Dash-dot' },
];

function makeDashSvg(dash, color) {
  const sw = 2;
  const w = 36, h = 12;
  const attrs = `stroke="${color}" stroke-width="${sw}" fill="none"` +
    (dash ? ` stroke-dasharray="${dash}"` : '');
  return `<svg width="${w}" height="${h}"><line x1="2" y1="${h/2}" x2="${w-2}" y2="${h/2}" ${attrs}/></svg>`;
}

function makeWidthSvg(width, color) {
  const w = 28, h = 16;
  return `<svg width="${w}" height="${h}"><line x1="2" y1="${h/2}" x2="${w-2}" y2="${h/2}" stroke="${color}" stroke-width="${width}" fill="none" stroke-linecap="round"/></svg>`;
}

function showLinkCtx(linkId, x, y) {
  const lnk = S.links.find(l => l.id === linkId);
  if (!lnk) return;

  const curStroke = lnk.stroke || '#388bfd';
  const curWidth  = lnk.strokeWidth || 1.5;
  const curDash   = lnk.dash || '';

  // --- Color swatches ---
  linkCtxColors.innerHTML = '';
  for (const c of LINK_COLORS) {
    const sw = document.createElement('div');
    sw.className = 'lk-color-swatch' + (curStroke === c.value ? ' active' : '');
    sw.style.background = c.value;
    sw.title = c.label;
    sw.addEventListener('click', () => {
      lnk.stroke = c.value;
      renderLinks();
      scheduleSave();
      linkCtxColors.querySelectorAll('.lk-color-swatch').forEach(el => el.classList.remove('active'));
      sw.classList.add('active');
      // refresh width/dash svgs with new color
      showLinkCtx(linkId, x, y);
    });
    linkCtxColors.appendChild(sw);
  }

  // --- Width buttons ---
  linkCtxWidths.innerHTML = '';
  for (const w of LINK_WIDTHS) {
    const btn = document.createElement('button');
    btn.className = 'lk-width-btn' + (curWidth === w.value ? ' active' : '');
    btn.innerHTML = makeWidthSvg(Math.min(w.value, 5), curStroke);
    btn.title = `${w.value}px`;
    btn.addEventListener('click', () => {
      lnk.strokeWidth = w.value;
      renderLinks();
      scheduleSave();
      linkCtxWidths.querySelectorAll('.lk-width-btn').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
    });
    linkCtxWidths.appendChild(btn);
  }

  // --- Dash buttons ---
  linkCtxDashes.innerHTML = '';
  for (const d of LINK_DASHES) {
    const btn = document.createElement('button');
    btn.className = 'lk-dash-btn' + (curDash === d.value ? ' active' : '');
    btn.innerHTML = makeDashSvg(d.value, curStroke);
    btn.title = d.title;
    btn.addEventListener('click', () => {
      lnk.dash = d.value;
      renderLinks();
      scheduleSave();
      linkCtxDashes.querySelectorAll('.lk-dash-btn').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
    });
    linkCtxDashes.appendChild(btn);
  }

  // --- Delete ---
  linkCtxDel.onclick = () => {
    hideLinkCtx();
    removeLink(linkId);
  };

  // Position (keep on screen)
  linkCtx.style.display = 'block';
  const cw = linkCtx.offsetWidth || 210;
  const ch = linkCtx.offsetHeight || 160;
  linkCtx.style.left = Math.min(x, window.innerWidth  - cw - 8) + 'px';
  linkCtx.style.top  = Math.min(y, window.innerHeight - ch - 8) + 'px';
}

function hideLinkCtx() {
  linkCtx.style.display = 'none';
}

document.addEventListener('mousedown', e => {
  if (!e.target.closest('#link-ctx')) hideLinkCtx();
});

// ═══════════════════════════════════════════════════════
// FREE LINES
// ═══════════════════════════════════════════════════════

function catmullRomSvg(sPts) {
  if (sPts.length === 2) {
    return `M${sPts[0].x},${sPts[0].y} L${sPts[1].x},${sPts[1].y}`;
  }
  const pts = [sPts[0], ...sPts, sPts[sPts.length - 1]];
  let d = `M${sPts[0].x},${sPts[0].y}`;
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x},${p2.y}`;
  }
  return d;
}

function freeLinePathD(line, extraPt) {
  const cPts = extraPt ? [...line.points, extraPt] : line.points;
  if (cPts.length < 2) return null;
  const sPts = cPts.map(p => c2s(p.x, p.y));
  if (line.lineStyle === 'straight') {
    const a = sPts[0], b = sPts[sPts.length - 1];
    return `M${a.x},${a.y} L${b.x},${b.y}`;
  }
  if (line.lineStyle === 'curve') return catmullRomSvg(sPts);
  return `M${sPts[0].x},${sPts[0].y}` + sPts.slice(1).map(p => ` L${p.x},${p.y}`).join('');
}

function renderFreeLines() {
  const freeLayer = document.getElementById('free-lines-layer');
  if (!freeLayer) return;
  while (freeLayer.firstChild) freeLayer.removeChild(freeLayer.firstChild);

  for (const line of S.freeLines) {
    const d = freeLinePathD(line, null);
    if (!d) continue;
    const isSelected = S.selLine === line.id;
    const stroke = line.stroke || '#e6edf3';
    const sw = line.strokeWidth || 2;
    const dash = line.dash || '';

    const g = svgE('g', { class: 'fl' });

    const path = svgE('path', { d, class: 'fl-path', fill: 'none' });
    path.style.stroke = isSelected ? '#58a6ff' : stroke;
    path.style.strokeWidth = sw + 'px';
    if (dash) path.style.strokeDasharray = dash;
    if (isSelected) path.style.filter = 'drop-shadow(0 0 5px #388bfd99)';
    g.appendChild(path);

    // Hit path for whole-line drag (rendered before point handles so handles are on top)
    const hit = svgE('path', { d, class: 'fl-hit', fill: 'none' });
    hit.addEventListener('click', e => {
      e.stopPropagation();
      selectFreeLine(line.id);
    });
    hit.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      selectFreeLine(line.id);
      showLineCtx(line.id, e.clientX, e.clientY);
    });
    hit.addEventListener('mousedown', e => {
      if (e.button !== 0 || S.lineDrawMode) return;
      e.stopPropagation();
      selectFreeLine(line.id);
      pushUndo();
      S.lineDrag = {
        id: line.id,
        sx: e.clientX, sy: e.clientY,
        origPoints: line.points.map(p => ({ ...p })),
      };
    });
    g.appendChild(hit);

    // Point handles rendered on top — each intercepts drag for individual point movement
    if (isSelected) {
      for (let i = 0; i < line.points.length; i++) {
        const p = line.points[i];
        const sp = c2s(p.x, p.y);
        const circ = svgE('circle', {
          cx: sp.x, cy: sp.y, r: '6',
          fill: '#388bfd', stroke: '#0d1117', 'stroke-width': '1.5',
          class: 'fl-pt-handle',
        });
        circ.style.pointerEvents = 'all';
        circ.style.cursor = 'move';
        circ.addEventListener('mousedown', e => {
          if (e.button !== 0 || S.lineDrawMode) return;
          e.stopPropagation();
          pushUndo();
          S.ptDrag = { lineId: line.id, ptIndex: i, sx: e.clientX, sy: e.clientY, origPt: { ...p } };
        });
        g.appendChild(circ);
      }
    }

    freeLayer.appendChild(g);
  }

  if (S.drawingLine) {
    const dl = S.drawingLine;
    if (dl.points.length > 0) {
      const drawG = svgE('g', { class: 'fl' });

      if (dl.points.length >= 2) {
        const placedD = freeLinePathD({ points: dl.points, lineStyle: 'polyline' }, null);
        if (placedD) {
          const placed = svgE('path', { d: placedD, fill: 'none' });
          placed.style.stroke = '#e6edf3';
          placed.style.strokeWidth = '2px';
          placed.style.opacity = '0.9';
          drawG.appendChild(placed);
        }
      }

      if (dl.cursorPt && dl.points.length >= 1) {
        const lastSp = c2s(dl.points[dl.points.length - 1].x, dl.points[dl.points.length - 1].y);
        const curSp  = c2s(dl.cursorPt.x, dl.cursorPt.y);
        const preview = svgE('path', {
          d: `M${lastSp.x},${lastSp.y} L${curSp.x},${curSp.y}`, fill: 'none',
        });
        preview.style.stroke = '#e6edf3';
        preview.style.strokeWidth = '1.5px';
        preview.style.strokeDasharray = '6 4';
        preview.style.opacity = '0.55';
        drawG.appendChild(preview);
      }

      for (const p of dl.points) {
        const sp = c2s(p.x, p.y);
        drawG.appendChild(svgE('circle', {
          cx: sp.x, cy: sp.y, r: '4',
          fill: '#e6edf3', stroke: '#0d1117', 'stroke-width': '1.5',
        }));
      }

      freeLayer.appendChild(drawG);
    }
  }
}

function selectFreeLine(id) {
  if (S.selLine === id) return;
  if (S.sel !== null) { ndEl(S.sel)?.classList.remove('selected'); S.sel = null; }
  clearMultiSel();
  S.selLine = id;
  renderFreeLines();
  setStatus('Line selected — drag to move | right-click for options | Del to delete');
}

function addFreeLine(points, lineStyle, stroke, strokeWidth, dash) {
  pushUndo();
  const line = {
    id: S.flid++,
    points: points.map(p => ({ x: p.x, y: p.y })),
    lineStyle: lineStyle || 'polyline',
    stroke: stroke || '#e6edf3',
    strokeWidth: strokeWidth || 2,
    dash: dash || '',
  };
  S.freeLines.push(line);
  renderFreeLines();
  selectFreeLine(line.id);
  scheduleSave();
  return line;
}

function removeFreeLine(id) {
  pushUndo();
  S.freeLines = S.freeLines.filter(l => l.id !== id);
  if (S.selLine === id) S.selLine = null;
  renderFreeLines();
  scheduleSave();
}

function enterLineDrawMode() {
  S.lineDrawMode = true;
  S.drawingLine = null;
  document.body.classList.add('line-draw-mode');
  selectNode(null);
  setStatus('Line draw: click to add points, double-click or Enter to finish, Esc to cancel');
  document.getElementById('btn-add-line').classList.add('active');
}

function exitLineDrawMode() {
  S.lineDrawMode = false;
  S.drawingLine = null;
  document.body.classList.remove('line-draw-mode');
  renderFreeLines();
  document.getElementById('btn-add-line').classList.remove('active');
  setStatus('Ready — double-click to add block | select text to create link | right-click link to delete');
}

function finishDrawingLine() {
  const dl = S.drawingLine;
  if (!dl || dl.points.length < 2) { exitLineDrawMode(); return; }
  addFreeLine(dl.points, 'polyline', '#e6edf3', 2, '');
  exitLineDrawMode();
}

function showLineCtx(lineId, x, y) {
  const line = S.freeLines.find(l => l.id === lineId);
  if (!line) return;

  const lineCtxEl     = document.getElementById('line-ctx');
  const lineCtxColors = document.getElementById('line-ctx-colors');
  const lineCtxWidths = document.getElementById('line-ctx-widths');
  const lineCtxDashes = document.getElementById('line-ctx-dashes');
  const lineCtxShapes = document.getElementById('line-ctx-shapes');
  const lineCtxDel    = document.getElementById('line-ctx-del');

  const curStroke = line.stroke || '#e6edf3';
  const curWidth  = line.strokeWidth || 2;
  const curDash   = line.dash || '';
  const curShape  = line.lineStyle || 'polyline';

  lineCtxColors.innerHTML = '';
  for (const c of LINK_COLORS) {
    const sw = document.createElement('div');
    sw.className = 'lk-color-swatch' + (curStroke === c.value ? ' active' : '');
    sw.style.background = c.value;
    sw.title = c.label;
    sw.addEventListener('click', () => {
      line.stroke = c.value;
      renderFreeLines(); scheduleSave();
      lineCtxColors.querySelectorAll('.lk-color-swatch').forEach(el => el.classList.remove('active'));
      sw.classList.add('active');
      showLineCtx(lineId, x, y);
    });
    lineCtxColors.appendChild(sw);
  }

  lineCtxWidths.innerHTML = '';
  for (const w of LINK_WIDTHS) {
    const btn = document.createElement('button');
    btn.className = 'lk-width-btn' + (curWidth === w.value ? ' active' : '');
    btn.innerHTML = makeWidthSvg(Math.min(w.value, 5), curStroke);
    btn.title = `${w.value}px`;
    btn.addEventListener('click', () => {
      line.strokeWidth = w.value;
      renderFreeLines(); scheduleSave();
      lineCtxWidths.querySelectorAll('.lk-width-btn').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
    });
    lineCtxWidths.appendChild(btn);
  }

  lineCtxDashes.innerHTML = '';
  for (const d of LINK_DASHES) {
    const btn = document.createElement('button');
    btn.className = 'lk-dash-btn' + (curDash === d.value ? ' active' : '');
    btn.innerHTML = makeDashSvg(d.value, curStroke);
    btn.title = d.title;
    btn.addEventListener('click', () => {
      line.dash = d.value;
      renderFreeLines(); scheduleSave();
      lineCtxDashes.querySelectorAll('.lk-dash-btn').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
    });
    lineCtxDashes.appendChild(btn);
  }

  lineCtxShapes.innerHTML = '';
  const SHAPES = [
    { label: 'Straight', value: 'straight' },
    { label: 'Polyline', value: 'polyline' },
    { label: 'Curve',    value: 'curve'    },
  ];
  for (const sh of SHAPES) {
    const btn = document.createElement('button');
    btn.className = 'fl-shape-btn' + (curShape === sh.value ? ' active' : '');
    btn.textContent = sh.label;
    btn.addEventListener('click', () => {
      line.lineStyle = sh.value;
      renderFreeLines(); scheduleSave();
      lineCtxShapes.querySelectorAll('.fl-shape-btn').forEach(el => el.classList.remove('active'));
      btn.classList.add('active');
    });
    lineCtxShapes.appendChild(btn);
  }

  lineCtxDel.onclick = () => { hideLineCtx(); removeFreeLine(lineId); };

  lineCtxEl.style.display = 'block';
  const cw = lineCtxEl.offsetWidth || 220;
  const ch = lineCtxEl.offsetHeight || 200;
  lineCtxEl.style.left = Math.min(x, window.innerWidth  - cw - 8) + 'px';
  lineCtxEl.style.top  = Math.min(y, window.innerHeight - ch - 8) + 'px';
}

function hideLineCtx() {
  document.getElementById('line-ctx').style.display = 'none';
}

document.addEventListener('mousedown', e => {
  if (!e.target.closest('#line-ctx')) hideLineCtx();
});

// ═══════════════════════════════════════════════════════
// LINK PREVIEW (link-mode hover)
// ═══════════════════════════════════════════════════════
wrap.addEventListener('mousemove', e => {
  if (!S.linkMode || !S.pending) return;

  const fn = S.nodes.find(n => n.id === S.pending.fromId);
  if (!fn) return;

  // Find which node the cursor is over
  const el = e.target.closest('.node, .bubble-node');
  const hovId = el ? +el.id.replace('nd-', '') : null;
  const tn = hovId !== null ? S.nodes.find(n => n.id === hovId) : null;

  if (!tn || tn.id === fn.id) {
    linkPreviewEl.style.display = 'none';
    return;
  }

  const ar = S.pending.anchorRect;
  let fp = ar
    ? { x: ar.left + ar.width / 2, y: ar.top + ar.height / 2 }
    : c2s(edgePoint(fn, tn).x, edgePoint(fn, tn).y);
  const { point: tp, side } = targetEntryPoint(fp, tn);
  if (ar) fp = anchorFpFromSide(ar, side);
  const dx = tp.x - fp.x;
  const dy = tp.y - fp.y;
  const d = `M${fp.x},${fp.y} C${fp.x + dx * 0.45},${fp.y + dy * 0.1} ${tp.x - dx * 0.45},${tp.y - dy * 0.1} ${tp.x},${tp.y}`;

  linkPreviewEl.setAttribute('d', d);
  linkPreviewEl.setAttribute('marker-end', 'url(#arrow-preview)');
  linkPreviewEl.style.display = '';
});

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

  const tipHeight = 80; // approximate height of two-button tip
  linkTip.style.display = 'block';
  linkTip.style.left    = (rect.left + rect.width / 2) + 'px';
  linkTip.style.top     = Math.max(8, rect.top - tipHeight - 8) + 'px';

  const anchorRect = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };

  linkTipLink.onclick = () => {
    sel.removeAllRanges();
    linkTip.style.display = 'none';
    enterLinkMode(fromId, text, anchorRect);
  };

  linkTipNewBlock.onclick = () => {
    sel.removeAllRanges();
    linkTip.style.display = 'none';
    const fn = S.nodes.find(n => n.id === fromId);
    const nx = fn ? fn.x + fn.w + 60 : 100;
    const ny = s2c(anchorRect.left + anchorRect.width / 2, anchorRect.top + anchorRect.height / 2).y;
    const newNode = addNode(nx, ny);
    createLink(fromId, text, newNode.id);
    renderLinks();
    selectNode(newNode.id);
    startEdit(newNode.id);
  };
});

// hide tooltip on outside click (but not when starting a text selection in code)
document.addEventListener('mousedown', e => {
  if (e.target.closest('#link-tip')) return;
  if (e.target.closest('.node-body')) return;
  linkTip.style.display = 'none';
  window.getSelection()?.removeAllRanges();
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
    setStatus('Ready — double-click to add block | select text to create link | right-click link to delete');
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

// Capture-phase handlers for line draw mode (intercept before node handlers)
wrap.addEventListener('mousedown', e => {
  if (!S.lineDrawMode || e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const p = s2c(e.clientX, e.clientY);
  if (!S.drawingLine) {
    S.drawingLine = { points: [p], cursorPt: p };
  } else {
    S.drawingLine.points.push(p);
  }
  renderFreeLines();
}, true);

wrap.addEventListener('dblclick', e => {
  if (!S.lineDrawMode) return;
  e.preventDefault();
  e.stopPropagation();
  if (!S.drawingLine) { exitLineDrawMode(); return; }
  // Pop duplicate point added by the 2nd mousedown of the double-click
  if (S.drawingLine.points.length > 1) S.drawingLine.points.pop();
  finishDrawingLine();
}, true);

document.addEventListener('mousemove', e => {
  if (S.lineDrawMode && S.drawingLine) {
    S.drawingLine.cursorPt = s2c(e.clientX, e.clientY);
    renderFreeLines();
  }
  if (S.ptDrag) {
    const r = 1 / S.vp.scale;
    const dx = (e.clientX - S.ptDrag.sx) * r;
    const dy = (e.clientY - S.ptDrag.sy) * r;
    const line = S.freeLines.find(l => l.id === S.ptDrag.lineId);
    if (line) {
      line.points[S.ptDrag.ptIndex] = { x: S.ptDrag.origPt.x + dx, y: S.ptDrag.origPt.y + dy };
      renderFreeLines();
    }
    return;
  }
  if (S.lineDrag) {
    const r = 1 / S.vp.scale;
    const dx = (e.clientX - S.lineDrag.sx) * r;
    const dy = (e.clientY - S.lineDrag.sy) * r;
    const line = S.freeLines.find(l => l.id === S.lineDrag.id);
    if (line) {
      line.points = S.lineDrag.origPoints.map(p => ({ x: p.x + dx, y: p.y + dy }));
      renderFreeLines();
    }
    return;
  }
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
      const dx   = (e.clientX - S.resize.sx) * r;
      const dy   = (e.clientY - S.resize.sy) * r;
      const edge = S.resize.edge;
      const minW = (n.type === 'frame' || n.type === 'bubble') ? 120 : 250;
      const minH = (n.type === 'frame' || n.type === 'bubble') ? 60  : 120;
      if (edge === 'n') {
        const newH = Math.max(minH, S.resize.oh - dy);
        n.y = S.resize.oy + S.resize.oh - newH;
        n.h = newH;
      } else if (edge === 's') {
        n.h = Math.max(minH, S.resize.oh + dy);
      } else if (edge === 'e') {
        n.w = Math.max(minW, S.resize.ow + dx);
      } else if (edge === 'w') {
        const newW = Math.max(minW, S.resize.ow - dx);
        n.x = S.resize.ox + S.resize.ow - newW;
        n.w = newW;
      } else {
        // se corner handle
        n.w = Math.max(minW, S.resize.ow + dx);
        n.h = Math.max(minH, S.resize.oh + dy);
      }
      const el = ndEl(n.id);
      if (el) {
        el.style.left   = n.x + 'px';
        el.style.top    = n.y + 'px';
        el.style.width  = n.w + 'px';
        el.style.height = n.h + 'px';
        const ta = el.querySelector('textarea');
        if (ta) ta.style.height = (n.h - 24) + 'px';
      }
      if (n.type === 'bubble') renderBubbleTail(n);
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
      S.drag.multiOrigins.forEach((_, id) => {
        const el = ndEl(id);
        if (!el) return;
        el.classList.remove('dragging');
        const n = S.nodes.find(n => n.id === id);
        if (n?.type === 'bubble') {
          el.classList.add('drag-released');
          el.addEventListener('mouseleave', () => el.classList.remove('drag-released'), { once: true });
        }
      });
    } else {
      const el = ndEl(S.drag.id);
      if (el) {
        el.classList.remove('dragging');
        const n = S.nodes.find(n => n.id === S.drag.id);
        if (n?.type === 'bubble') {
          el.classList.add('drag-released');
          el.addEventListener('mouseleave', () => el.classList.remove('drag-released'), { once: true });
        }
      }
    }
  }
  if (S.tailDrag) {
    const _tdn = S.nodes.find(n => n.id === S.tailDrag.id);
    if (_tdn && _tdn.tailX === S.tailDrag.otailX && _tdn.tailY === S.tailDrag.otailY) S.undoStack.pop();
    S.tailDrag = null; scheduleSave();
  }
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
      setStatus(count > 0 ? `${count} block(s) selected — drag header to move all` : 'Ready — double-click to add block | select text to create link | right-click link to delete');
    }
  }
  if (S.ptDrag) {
    const _pdl = S.freeLines.find(l => l.id === S.ptDrag.lineId);
    if (_pdl) {
      const _pdp = _pdl.points[S.ptDrag.ptIndex];
      if (_pdp && _pdp.x === S.ptDrag.origPt.x && _pdp.y === S.ptDrag.origPt.y) S.undoStack.pop();
    }
    S.ptDrag = null; scheduleSave();
  }
  if (S.lineDrag) {
    const _ldl = S.freeLines.find(l => l.id === S.lineDrag.id);
    if (_ldl && _ldl.points.length > 0 &&
        _ldl.points[0].x === S.lineDrag.origPoints[0].x &&
        _ldl.points[0].y === S.lineDrag.origPoints[0].y) S.undoStack.pop();
    S.lineDrag = null; scheduleSave();
  }
  // Discard undo entry if drag/resize caused no actual movement
  if (S.drag) {
    if (S.drag.multiOrigins) {
      let _moved = false;
      S.drag.multiOrigins.forEach((orig, id) => {
        const _mn = S.nodes.find(n => n.id === id);
        if (_mn && (_mn.x !== orig.ox || _mn.y !== orig.oy)) _moved = true;
      });
      if (!_moved) S.undoStack.pop();
    } else {
      const _dn = S.nodes.find(n => n.id === S.drag.id);
      if (_dn && _dn.x === S.drag.ox && _dn.y === S.drag.oy) S.undoStack.pop();
    }
  }
  if (S.resize) {
    const _rn = S.nodes.find(n => n.id === S.resize.id);
    if (_rn && _rn.x === S.resize.ox && _rn.y === S.resize.oy &&
        _rn.w === S.resize.ow && _rn.h === S.resize.oh) S.undoStack.pop();
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
    if (!S.lineDrawMode) setMode(S.mode === 'hand' ? 'select' : 'hand');
    return;
  }
  if (e.code === 'Enter' && S.lineDrawMode && !isInput) {
    e.preventDefault();
    finishDrawingLine();
    return;
  }
  if (e.code === 'Space' && !S.editing && !isInput) {
    e.preventDefault();
    S.spaceDown = true;
    if (!S.pan) updateCursor();
  }
  if (e.code === 'Escape') {
    if (S.lineDrawMode) exitLineDrawMode();
    else if (S.linkMode) exitLinkMode();
    else if (S.editing) stopEdit();
  }
  if ((e.code === 'Delete' || e.code === 'Backspace') && !isInput && !S.editing) {
    if (S.multiSel.size > 0) {
      e.preventDefault();
      pushUndo();
      _suppressUndo = true;
      [...S.multiSel].forEach(id => removeNode(id));
      _suppressUndo = false;
    } else if (S.sel) {
      e.preventDefault();
      removeNode(S.sel);
    } else if (S.selLine !== null) {
      e.preventDefault();
      removeFreeLine(S.selLine);
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
    } else if (e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
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

document.getElementById('btn-add-line')?.addEventListener('click', () => {
  if (S.lineDrawMode) exitLineDrawMode();
  else enterLineDrawMode();
});

// ═══════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════
function setStatus(msg) { statusEl.textContent = msg; }

// ═══════════════════════════════════════════════════════
// UNDO
// ═══════════════════════════════════════════════════════
let _suppressUndo = false;

function snapshotForUndo() {
  return {
    nodes: structuredClone(S.nodes),
    links: structuredClone(S.links),
    freeLines: structuredClone(S.freeLines),
    nid: S.nid, lid: S.lid, flid: S.flid,
  };
}

function pushUndo() {
  if (_suppressUndo) return;
  S.undoStack.push(snapshotForUndo());
  if (S.undoStack.length > 10) S.undoStack.shift();
}

function undo() {
  if (S.undoStack.length === 0) { setStatus('Nothing to undo'); return; }
  const snap = S.undoStack.pop();
  // Stop any active edit without pushing another undo entry
  S.editing = null;
  // Clear DOM
  S.nodes.forEach(n => ndEl(n.id)?.remove());
  svgLinks.querySelectorAll('.lk').forEach(e => e.remove());
  const _ull = document.getElementById('free-lines-layer');
  if (_ull) while (_ull.firstChild) _ull.removeChild(_ull.firstChild);
  // Restore state
  S.sel = null; S.selLine = null; S.multiSel.clear();
  S.nid = snap.nid; S.lid = snap.lid; S.flid = snap.flid;
  S.nodes = [];
  S.links = snap.links.map(l => ({ ...l }));
  S.freeLines = snap.freeLines.map(l => ({ ...l, points: l.points.map(p => ({ ...p })) }));
  for (const nd of snap.nodes) {
    const n = { ...nd };
    S.nodes.push(n);
    const el = document.createElement('div');
    el.className = n.type === 'frame' ? 'frame-node'
                 : 'node' + (n.type === 'bubble' ? ' bubble-node' : '');
    el.id = 'nd-' + n.id;
    canvas.appendChild(el);
    if (n.type === 'frame') setupFrameEvents(n, el);
    else setupNodeEvents(n, el);
    renderNode(n, el);
  }
  renderLinks();
  renderFreeLines();
  scheduleSave();
  const remaining = S.undoStack.length;
  setStatus(remaining > 0 ? `Undo — ${remaining} more step(s) available` : 'Undo — no more steps');
}

// ═══════════════════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════════════════
// Each browser tab gets its own localStorage key so tabs are fully independent.
// The tab ID is stored in sessionStorage (survives refresh, cleared on tab close).
const TAB_ID = (() => {
  let id = sessionStorage.getItem('canvas-tab-id');
  if (!id) {
    id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    sessionStorage.setItem('canvas-tab-id', id);
  }
  return id;
})();
const STORAGE_KEY = `code-canvas-v1-${TAB_ID}`;

const canvasTitleEl = document.getElementById('canvas-title');
function resizeCanvasTitleInput() {
  canvasTitleEl.style.width = Math.max(80, Math.min(420, canvasTitleEl.value.length * 9 + 16)) + 'px';
}
canvasTitleEl.addEventListener('input', () => {
  document.title = canvasTitleEl.value || '∞ Code Canvas';
  resizeCanvasTitleInput();
  scheduleSave();
});
canvasTitleEl.addEventListener('blur', () => {
  if (!canvasTitleEl.value) {
    canvasTitleEl.value = 'Untitled canvas';
    resizeCanvasTitleInput();
    scheduleSave();
  }
});

function saveState() {
  const data = {
    dataVersion: DATA_VERSION,
    savedAt: Date.now(),
    canvasTitle: canvasTitleEl.value,
    nodes: S.nodes.map(n => {
      if (n.type === 'bubble') {
        const { id, type, x, y, w, h, text, tailX, tailY, color, showTail } = n;
        return { id, type, x, y, w, h, text, tailX, tailY, color, showTail };
      }
      if (n.type === 'frame') {
        const { id, type, x, y, w, h, label, color } = n;
        return { id, type, x, y, w, h, label, color };
      }
      const { id, x, y, w, h, code, lang, title, filePath, showLineNumbers, lineNumberStart, color } = n;
      return { id, x, y, w, h, code, lang, title, filePath, showLineNumbers, lineNumberStart, color };
    }),
    links: S.links.map(({ id, fromId, text, toId, stroke, strokeWidth, dash }) => ({ id, fromId, text, toId, stroke, strokeWidth, dash })),
    freeLines: S.freeLines.map(({ id, points, lineStyle, stroke, strokeWidth, dash }) => ({
      id, points: points.map(p => ({ x: p.x, y: p.y })), lineStyle, stroke, strokeWidth, dash,
    })),
    nid: S.nid,
    lid: S.lid,
    flid: S.flid,
    vp: { ...S.vp },
    globalConfig: { description: S.globalConfig.description, repositories: S.globalConfig.repositories.map(r => ({ ...r })) },
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
  S.freeLines = [];
  S.sel = null;
  S.selLine = null;
  S.editing = null;
  S.multiSel.clear();
  S.clipboard = [];
  svgLinks.querySelectorAll('.lk').forEach(e => e.remove());
  const _fll = document.getElementById('free-lines-layer');
  if (_fll) while (_fll.firstChild) _fll.removeChild(_fll.firstChild);

  S.nid = data.nid ?? 1;
  S.lid = data.lid ?? 1;
  S.flid = data.flid ?? 1;
  if (data.vp) Object.assign(S.vp, data.vp);
  if (!data.dataVersion || data.dataVersion < '2.0') {
    // migrate pre-2.0: gitConfig (single repo) → repositories array
    const old = data.gitConfig;
    if (old && old.url) {
      const nickname = old.url.split('/').filter(Boolean).pop() || 'repo';
      S.globalConfig.repositories = [{ nickname, url: old.url, branch: old.branch || '', tag: old.tag || '', commitHash: old.commitHash || '' }];
    }
    showAlert('The data format has been updated to a new version. Your settings have been migrated automatically.');
  } else if (data.dataVersion < '3.0') {
    // migrate 2.0: globalConfig was single-repo object → repositories array
    const old = data.globalConfig;
    if (old) {
      S.globalConfig.description = old.description || '';
      if (old.url) {
        const nickname = old.url.split('/').filter(Boolean).pop() || 'repo';
        S.globalConfig.repositories = [{ nickname, url: old.url, branch: old.branch || '', tag: old.tag || '', commitHash: old.commitHash || '' }];
      }
    }
    showAlert('The data format has been updated to a new version. Your settings have been migrated automatically.');
  } else {
    if (data.globalConfig) {
      S.globalConfig.description = data.globalConfig.description || '';
      S.globalConfig.repositories = (data.globalConfig.repositories || []).map(r => ({ ...r }));
    }
  }
  canvasTitleEl.value = data.canvasTitle || 'Untitled canvas';
  document.title = data.canvasTitle || '∞ Code Canvas';
  resizeCanvasTitleInput();

  S.links = data.links ?? [];

  for (const nd of (data.nodes ?? [])) {
    let n;
    if (nd.type === 'bubble') {
      n = { id: nd.id, type: 'bubble', x: nd.x, y: nd.y, w: nd.w, h: nd.h,
            text: nd.text ?? '', tailX: nd.tailX ?? nd.x + nd.w / 2, tailY: nd.tailY ?? nd.y + nd.h + 50,
            color: nd.color ?? 'green', showTail: nd.showTail ?? true };
    } else if (nd.type === 'frame') {
      n = { id: nd.id, type: 'frame', x: nd.x, y: nd.y, w: nd.w, h: nd.h,
            label: nd.label ?? '', color: nd.color ?? 'blue' };
    } else {
      n = { id: nd.id, x: nd.x, y: nd.y, w: nd.w, h: nd.h, code: nd.code,
            lang: nd.lang ?? 'text', title: nd.title ?? '', filePath: nd.filePath ?? '',
            showLineNumbers: nd.showLineNumbers ?? true, lineNumberStart: nd.lineNumberStart ?? 1,
            color: nd.color ?? 'blue' };
    }
    S.nodes.push(n);
    const el = document.createElement('div');
    el.className = n.type === 'frame' ? 'frame-node'
                 : 'node' + (n.type === 'bubble' ? ' bubble-node' : '');
    el.id = 'nd-' + n.id;
    canvas.appendChild(el);
    if (n.type === 'frame') {
      setupFrameEvents(n, el);
    } else {
      setupNodeEvents(n, el);
    }
    renderNode(n, el);
  }
  S.freeLines = (data.freeLines ?? []).map(l => ({
    id: l.id,
    points: (l.points ?? []).map(p => ({ x: p.x, y: p.y })),
    lineStyle: l.lineStyle ?? 'polyline',
    stroke: l.stroke ?? '#e6edf3',
    strokeWidth: l.strokeWidth ?? 2,
    dash: l.dash ?? '',
  }));
  renderLinks();
  renderFreeLines();
  applyVP();
}

// Remove localStorage entries older than STALE_DAYS that belong to closed tabs.
const STALE_DAYS = 30;
const STORAGE_PREFIX = 'code-canvas-v1-';
function purgeStaleEntries() {
  const cutoff = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
  const keysToDelete = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key.startsWith(STORAGE_PREFIX) || key === STORAGE_KEY) continue;
    try {
      const entry = JSON.parse(localStorage.getItem(key));
      if (!entry.savedAt || entry.savedAt < cutoff) keysToDelete.push(key);
    } catch {
      keysToDelete.push(key);
    }
  }
  keysToDelete.forEach(k => localStorage.removeItem(k));
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

// flush pending save immediately before the page unloads
window.addEventListener('beforeunload', () => {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; saveState(); }
});

// also flush when the tab goes hidden (e.g. Cmd+W, tab switch before reload)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && saveTimer) {
    clearTimeout(saveTimer); saveTimer = null; saveState();
  }
});

// Zoom controls
document.getElementById('btn-zoom-out').addEventListener('click', () => {
  const cx = wrap.clientWidth / 2;
  const cy = wrap.clientHeight / 2;
  zoom(1 / 1.2, cx, cy);
});
document.getElementById('btn-zoom-fit').addEventListener('click', fitAll);
document.getElementById('btn-zoom-in').addEventListener('click', () => {
  const cx = wrap.clientWidth / 2;
  const cy = wrap.clientHeight / 2;
  zoom(1.2, cx, cy);
});
document.getElementById('zoom-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    e.target.blur();
  } else if (e.key === 'Escape') {
    e.target.value = Math.round(S.vp.scale * 100) + '%';
    e.target.blur();
  }
});
document.getElementById('zoom-input').addEventListener('blur', e => {
  const raw = e.target.value.replace('%', '').trim();
  const pct = parseFloat(raw);
  if (!isNaN(pct) && pct > 0) {
    const ns = Math.min(4, Math.max(0.08, pct / 100));
    const cx = wrap.clientWidth / 2;
    const cy = wrap.clientHeight / 2;
    const r = ns / S.vp.scale;
    S.vp.x = cx - (cx - S.vp.x) * r;
    S.vp.y = cy - (cy - S.vp.y) * r;
    S.vp.scale = ns;
    applyVP();
    setStatus(`Zoom: ${Math.round(ns * 100)}%`);
  } else {
    e.target.value = Math.round(S.vp.scale * 100) + '%';
  }
});

// Export
document.getElementById('btn-export').addEventListener('click', async () => {
  saveState();
  const raw = localStorage.getItem(STORAGE_KEY) ?? '{}';
  const data = JSON.stringify(JSON.parse(raw), null, 2);
  const suggestedName = `code-canvas-${new Date().toISOString().slice(0,10)}.json`;
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      setStatus('Exported');
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
      // Fall through to legacy download on other errors
    }
  }
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 100);
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
      showAlert('Failed to load JSON: ' + err.message, 'err');
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
  S.nodes = []; S.links = []; S.freeLines = []; S.nid = 1; S.lid = 1; S.flid = 1;
  S.sel = null; S.selLine = null; S.editing = null;
  S.multiSel.clear(); S.clipboard = [];
  S.globalConfig = { description: '', repositories: [] };
  svgLinks.querySelectorAll('.lk').forEach(e => e.remove());
  const _cl = document.getElementById('free-lines-layer');
  if (_cl) while (_cl.firstChild) _cl.removeChild(_cl.firstChild);
  canvasTitleEl.value = 'Untitled canvas';
  document.title = '∞ Code Canvas';
  resizeCanvasTitleInput();
  setStatus('Cleared');
});

// Navigator
(function () {
  const btn = document.getElementById('btn-jump');
  let panel = null;

  function closeNavigator() {
    panel?.remove();
    panel = null;
    btn.classList.remove('active');
  }

  function openNavigator() {
    if (panel) { closeNavigator(); return; }
    btn.classList.add('active');

    panel = document.createElement('div');
    panel.id = 'navigator-panel';

    const blocks = S.nodes.filter(n => !n.type);
    const bubbles = S.nodes.filter(n => n.type === 'bubble');
    const frames = S.nodes.filter(n => n.type === 'frame');

    function makeItem(n, icon, label, sub) {
      const div = document.createElement('div');
      div.className = 'nav-item';
      div.innerHTML =
        `<span class="nav-icon">${icon}</span>` +
        `<span class="nav-label">${label}</span>` +
        (sub ? `<span class="nav-sub">${sub}</span>` : '');
      div.addEventListener('click', () => { closeNavigator(); jumpTo(n.id); });
      return div;
    }

    function addSection(title, nodes, icon, labelFn, subFn) {
      const sec = document.createElement('div');
      sec.className = 'nav-section';
      sec.textContent = title;
      panel.appendChild(sec);
      if (nodes.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'nav-empty';
        empty.textContent = 'None';
        panel.appendChild(empty);
      } else {
        nodes.forEach(n => panel.appendChild(makeItem(n, icon, labelFn(n), subFn?.(n))));
      }
    }

    addSection('Blocks', blocks, '▣',
      n => n.title || n.filePath || '(Untitled)',
      n => n.lang || '');
    const div1 = document.createElement('div'); div1.className = 'nav-divider'; panel.appendChild(div1);
    addSection('Bubbles', bubbles, '💬',
      n => (n.text || '').replace(/\s+/g, ' ').trim().slice(0, 40) || '(Empty)');
    const div2 = document.createElement('div'); div2.className = 'nav-divider'; panel.appendChild(div2);
    addSection('Frames', frames, '⬜',
      n => n.label || '(Untitled)');

    // Position below the button
    const rect = btn.getBoundingClientRect();
    panel.style.top = (rect.bottom + 6) + 'px';
    panel.style.left = rect.left + 'px';
    document.body.appendChild(panel);

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('pointerdown', function onDown(e) {
        if (!panel?.contains(e.target) && e.target !== btn) {
          closeNavigator();
          document.removeEventListener('pointerdown', onDown);
        }
      });
    }, 0);
  }

  btn.addEventListener('click', openNavigator);
})();

initDialogs({
  S, wrap, canvasTitleEl,
  renderNode, ndEl, autoFitNode,
  addBubble, addFrame, getSelectedIds,
  pushUndo, scheduleSave, saveState,
  setStatus, s2c, resizeCanvasTitleInput,
});

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════
(async () => {
  purgeStaleEntries();
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

setStatus('Ready — double-click to add block | select text to create link | right-click link to delete');

// ═══════════════════════════════════════════════════════
// TEST EXPORTS (Node.js / Vitest only — not used in browser)
// ═══════════════════════════════════════════════════════
if (typeof globalThis !== 'undefined' && typeof process !== 'undefined') {
  globalThis.__canvasApp = { S, addNode, removeNode, selectNode, addBubble, addFrame, loadState,
    saveState, restoreFromStorage,
    createLink, removeLink,
    copyNodes, cutNodes, pasteNodes, toggleMultiSel,
    addFreeLine, removeFreeLine,
    pushUndo, undo,
    startEdit, stopEdit,
    s2c, zoom };
}
