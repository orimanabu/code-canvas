import { DATA_VERSION, esc, EXT_LANG, langFromPath, NODE_COLORS, FONT_PRESETS, FONT_SIZES,
         injectAnchor, injectTailAnchor, splitHtmlLines, addLineNumbers,
         roundedRectRayHit, anchorFpFromSide, edgePoint, matchIdxToLineCol,
         svgE, LINK_COLORS, LINK_WIDTHS, LINK_DASHES } from './canvas-utils.js';
import { initDialogs, showAlert } from './canvas-dialogs.js';
import { initNodeRendering } from './canvas-node-rendering.js';
import { initFreeLines } from './canvas-free-lines.js';
import { initLinks } from './canvas-links.js';
import { initNodes } from './canvas-nodes.js';

// ═══════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════
const S = {
  nodes: [],
  links: [],
  vp: { x: 0, y: 0, scale: 1 },
  nid: 1,   // next node id
  lid: 1,   // next link id
  taid: 1,  // next tail-anchor id
  sel: null,        // selected node id
  multiSel: new Set(), // multi-selected node ids (Shift+click)
  multiSelLines: new Set(), // multi-selected free-line ids (marquee selection)
  editing: null,    // editing node id
  drag: null,       // { id, sx, sy, ox, oy, others: [{id, ox, oy}] }
  resize: null,     // { id, sx, sy, ow, oh }
  pan: null,        // { sx, sy }
  zoomDrag: null,   // { lastY, cx, cy }
  spaceDown: false,
  mode: 'select',   // 'select' | 'hand'
  linkMode: false,
  tailAttachMode: false,
  tailPending: null,  // { fromId, text } — set while waiting for user to click a bubble
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
  arrowDrag: null,  // { id, handleType: 'body'|'head'|'rotate' }
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
const linkTipAttachTail = document.getElementById('link-tip-attach-tail');
const linkTipNewBubble  = document.getElementById('link-tip-new-bubble');
const linkCtx        = document.getElementById('link-ctx');
const linkCtxDel     = document.getElementById('link-ctx-del');
const linkCtxGotoFrom = document.getElementById('link-ctx-goto-from');
const linkCtxGotoTo   = document.getElementById('link-ctx-goto-to');
const linkCtxReverse  = document.getElementById('link-ctx-reverse');
const anchorCtx            = document.getElementById('anchor-ctx');
const anchorCtxLink        = document.getElementById('anchor-ctx-link');
const anchorCtxNewBlock    = document.getElementById('anchor-ctx-newblock');
const anchorCtxAttachTail  = document.getElementById('anchor-ctx-attach-tail');
const anchorCtxDelAll      = document.getElementById('anchor-ctx-del-all');
const tailAnchorCtx        = document.getElementById('tail-anchor-ctx');
const tailAnchorCtxDetach  = document.getElementById('tail-anchor-ctx-detach');
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
  renderAnchoredBubbleTails();
  const zi = document.getElementById('zoom-input');
  if (zi && document.activeElement !== zi) zi.value = Math.round(scale * 100) + '%';
}

function s2c(sx, sy) {
  return {
    x: (sx - S.vp.x) / S.vp.scale,
    y: (sy - S.vp.y) / S.vp.scale,
  };
}

// Canvas coords → screen coords
function c2s(cx, cy) {
  return {
    x: cx * S.vp.scale + S.vp.x,
    y: cy * S.vp.scale + S.vp.y,
  };
}

function zoom(factor, mx, my) {
  cancelVPAnim();
  const ns = Math.min(4, Math.max(0.08, S.vp.scale * factor));
  const r  = ns / S.vp.scale;
  S.vp.x  = mx - (mx - S.vp.x) * r;
  S.vp.y  = my - (my - S.vp.y) * r;
  S.vp.scale = ns;
  applyVP();
  setStatus(`Zoom: ${Math.round(ns * 100)}%`);
}

let _vpAnimId = null;

function cancelVPAnim() {
  if (_vpAnimId) { cancelAnimationFrame(_vpAnimId); _vpAnimId = null; }
}

function animateVP(tx, ty, tScale) {
  cancelVPAnim();
  const x0 = S.vp.x, y0 = S.vp.y, s0 = S.vp.scale;
  const ts = tScale !== undefined ? tScale : s0;
  const DURATION = 500;
  const t0 = performance.now();
  function step(now) {
    const raw = Math.min(1, (now - t0) / DURATION);
    const e = 1 - Math.pow(1 - raw, 3); // ease-out cubic
    S.vp.x = x0 + (tx - x0) * e;
    S.vp.y = y0 + (ty - y0) * e;
    S.vp.scale = s0 + (ts - s0) * e;
    applyVP();
    if (raw < 1) _vpAnimId = requestAnimationFrame(step);
    else _vpAnimId = null;
  }
  _vpAnimId = requestAnimationFrame(step);
}

// ═══════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════
function setStatus(msg) { statusEl.textContent = msg; }
function ndEl(id) { return document.getElementById('nd-' + id); }

// ═══════════════════════════════════════════════════════
// UNDO
// ═══════════════════════════════════════════════════════
let _suppressUndo = false;
function suppressUndo(val) { _suppressUndo = val; }

function snapshotForUndo() {
  return {
    nodes: structuredClone(S.nodes),
    links: structuredClone(S.links),
    freeLines: structuredClone(S.freeLines),
    nid: S.nid, lid: S.lid, flid: S.flid, taid: S.taid,
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
  S.nid = snap.nid; S.lid = snap.lid; S.flid = snap.flid; S.taid = snap.taid ?? S.taid;
  S.nodes = [];
  S.links = snap.links.map(l => ({ ...l }));
  S.freeLines = snap.freeLines.map(l => ({ ...l, points: l.points.map(p => ({ ...p })) }));
  for (const nd of snap.nodes) {
    const n = { ...nd };
    S.nodes.push(n);
    const el = document.createElement('div');
    el.className = n.type === 'frame' ? 'frame-node'
                 : n.type === 'arrow' ? 'arrow-node'
                 : 'node' + (n.type === 'bubble' ? ' bubble-node' : '');
    el.id = 'nd-' + n.id;
    canvas.appendChild(el);
    if (n.type === 'frame')      setupFrameEvents(n, el);
    else if (n.type === 'arrow') setupArrowEvents(n, el);
    else                         setupNodeEvents(n, el);
    renderNode(n, el);
  }
  renderLinks();
  renderFreeLines();
  scheduleSave();
  const remaining = S.undoStack.length;
  setStatus(remaining > 0 ? `Undo — ${remaining} more step(s) available` : 'Undo — no more steps');
}

// ═══════════════════════════════════════════════════════
// WIRING — initialize all modules with dependency injection
// ═══════════════════════════════════════════════════════

// Forward declarations — resolved after initXxx calls below
let renderNode, renderLinks, renderFreeLines;
let startEdit, stopEdit, autoFitNode;
let selectNode, toggleMultiSel, clearMultiSel, removeNode;
let addNode, addBubble, addFrame, addText, addArrow;
let setupNodeEvents, setupFrameEvents, setupArrowEvents;
let renderBubbleTail, renderAnchoredBubbleTails, attachTailToText;
let getSelectedIds, copyNodes, cutNodes, pasteNodes;
let fitAll, jumpTo;
let addFreeLine, removeFreeLine, selectFreeLine;
let enterLineDrawMode, exitLineDrawMode, finishDrawingLine;
let showLineCtx, hideLineCtx;
let createLink, removeLink;
let enterLinkMode, exitLinkMode, enterTailAttachMode, exitTailAttachMode;
let showAnchorCtx, hideAnchorCtx, showTailAnchorCtx, hideTailAnchorCtx;
let targetEntryPoint;
let hideLinkTip;

// openFetchDialog and openCodeSnippetdDialog are exposed as window.* by canvas-dialogs.js
function openFetchDialog(id) { window.openFetchDialog(id); }
function openCodeSnippetdDialog(id, kw) { window.openCodeSnippetdDialog(id, kw); }

// 1. Node rendering (uses forwarding closures for functions not yet defined)
({ renderNode } = initNodeRendering({
  S, canvas, ndEl, s2c,
  pushUndo,
  scheduleSave: () => scheduleSave(),
  setStatus,
  startEdit: (id) => startEdit(id),
  stopEdit: () => stopEdit(),
  autoFitNode: (n) => autoFitNode(n),
  selectNode: (id) => selectNode(id),
  toggleMultiSel: (id) => toggleMultiSel(id),
  clearMultiSel: () => clearMultiSel(),
  removeNode: (id) => removeNode(id),
  renderLinks: () => renderLinks(),
  renderBubbleTail: (n) => renderBubbleTail(n),
  renderAnchoredBubbleTails: () => renderAnchoredBubbleTails(),
  createLink: (...a) => createLink(...a),
  jumpTo: (id) => jumpTo(id),
  showAnchorCtx: (...a) => showAnchorCtx(...a),
  showTailAnchorCtx: (...a) => showTailAnchorCtx(...a),
  removeLink: (id) => removeLink(id),
  attachTailToText: (...a) => attachTailToText(...a),
  hideLinkTip: () => hideLinkTip?.(),
  openFetchDialog,
  openCodeSnippetdDialog,
}));

// 2. Free lines
({ renderFreeLines, addFreeLine, removeFreeLine, selectFreeLine,
   enterLineDrawMode, exitLineDrawMode, finishDrawingLine,
   showLineCtx, hideLineCtx,
} = initFreeLines({
  S, c2s,
  pushUndo,
  scheduleSave: () => scheduleSave(),
  setStatus,
  selectNode: (id) => selectNode(id),
  renderLinks: () => renderLinks(),
}));

// 3. Links (defines createLink, removeLink, renderLinks, etc.)
({ renderLinks, createLink, removeLink,
   targetEntryPoint,
   enterLinkMode, exitLinkMode,
   enterTailAttachMode, exitTailAttachMode,
   showAnchorCtx, hideAnchorCtx,
   showTailAnchorCtx, hideTailAnchorCtx,
   hideLinkTip,
} = initLinks({
  S, wrap, svgLinks, canvas, ndEl,
  linkTip, linkTipLink, linkTipNewBlock, linkTipAttachTail, linkTipNewBubble,
  linkCtx, linkCtxDel, linkCtxGotoFrom, linkCtxGotoTo, linkCtxReverse, linkCtxColors, linkCtxWidths, linkCtxDashes,
  anchorCtx, anchorCtxLink, anchorCtxNewBlock, anchorCtxAttachTail, anchorCtxDelAll,
  tailAnchorCtx, tailAnchorCtxDetach,
  linkPreviewEl,
  renderNode: (n, el) => renderNode(n, el),
  autoFitNode: (n) => autoFitNode(n),
  addNode: (...a) => addNode(...a),
  addBubble: (...a) => addBubble(...a),
  selectNode: (id) => selectNode(id),
  startEdit: (id) => startEdit(id),
  renderBubbleTail: (n) => renderBubbleTail(n),
  attachTailToText: (...a) => attachTailToText(...a),
  pushUndo,
  scheduleSave: () => scheduleSave(),
  setStatus,
  s2c, c2s,
  enterTailAttachMode: (...a) => enterTailAttachMode(...a),
  jumpTo: (id) => jumpTo(id),
}));

// 4. Nodes (depends on renderNode, renderLinks, renderFreeLines, targetEntryPoint from above)
({ addNode, addBubble, addFrame, addText, addArrow, removeNode,
   selectNode, toggleMultiSel, clearMultiSel,
   startEdit, stopEdit, autoFitNode,
   setupNodeEvents, setupFrameEvents, setupArrowEvents,
   renderBubbleTail, renderAnchoredBubbleTails, attachTailToText,
   getSelectedIds, copyNodes, cutNodes, pasteNodes,
   fitAll, jumpTo,
} = initNodes({
  S, canvas, wrap, ndEl, s2c, c2s,
  renderNode: (n, el) => renderNode(n, el),
  renderLinks: () => renderLinks(),
  renderFreeLines: () => renderFreeLines(),
  pushUndo,
  suppressUndo,
  scheduleSave: () => scheduleSave(),
  setStatus,
  applyVP,
  animateVP,
  enterLinkMode: (...a) => enterLinkMode(...a),
  exitLinkMode: () => exitLinkMode(),
  enterTailAttachMode: (...a) => enterTailAttachMode(...a),
  exitTailAttachMode: () => exitTailAttachMode(),
  showAnchorCtx: (...a) => showAnchorCtx(...a),
  showTailAnchorCtx: (...a) => showTailAnchorCtx(...a),
  createLink: (...a) => createLink(...a),
  removeLink: (id) => removeLink(id),
  removeFreeLine: (id) => removeFreeLine(id),
  targetEntryPoint: (...a) => targetEntryPoint(...a),
}));

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
      if (n.type === 'arrow') {
        const { id, type, x, y, bodyLen, headLen, headWidth, angle, color, strokeWidth } = n;
        return { id, type, x, y, bodyLen, headLen, headWidth, angle, color, strokeWidth };
      }
      if (n.type === 'bubble') {
        const { id, type, x, y, w, h, text, tailX, tailY, color, fontFamily, fontSize, showTail,
                tailAnchorId, tailAnchorText, tailAnchorFromId, tailAnchorLine, tailAnchorCol } = n;
        return { id, type, x, y, w, h, text, tailX, tailY, color, fontFamily, fontSize, showTail,
                 tailAnchorId, tailAnchorText, tailAnchorFromId, tailAnchorLine, tailAnchorCol };
      }
      if (n.type === 'frame') {
        const { id, type, x, y, w, h, label, color, fontFamily, fontSize } = n;
        return { id, type, x, y, w, h, label, color, fontFamily, fontSize };
      }
      if (n.type === 'text') {
        const { id, type, x, y, w, h, text, textColor, fontFamily, fontSize } = n;
        return { id, type, x, y, w, h, text, textColor, fontFamily, fontSize };
      }
      const { id, x, y, w, h, code, lang, title, filePath, showLineNumbers, lineNumberStart, color, fontFamily, fontSize } = n;
      return { id, x, y, w, h, code, lang, title, filePath, showLineNumbers, lineNumberStart, color, fontFamily, fontSize };
    }),
    links: S.links.map(({ id, fromId, text, toId, stroke, strokeWidth, dash, anchorLine, anchorCol }) => ({ id, fromId, text, toId, stroke, strokeWidth, dash, anchorLine, anchorCol })),
    freeLines: S.freeLines.map(({ id, points, lineStyle, stroke, strokeWidth, dash }) => ({
      id, points: points.map(p => ({ x: p.x, y: p.y })), lineStyle, stroke, strokeWidth, dash,
    })),
    nid: S.nid,
    lid: S.lid,
    flid: S.flid,
    taid: S.taid,
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
  S.multiSelLines.clear();
  S.clipboard = [];
  svgLinks.querySelectorAll('.lk').forEach(e => e.remove());
  const _fll = document.getElementById('free-lines-layer');
  if (_fll) while (_fll.firstChild) _fll.removeChild(_fll.firstChild);

  S.nid = data.nid ?? 1;
  S.lid = data.lid ?? 1;
  S.flid = data.flid ?? 1;
  S.taid = data.taid ?? 1;
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
  } else if (data.dataVersion < '3.2') {
    // migrate 3.0/3.1: link/bubble anchor storage changed from anchorMatchIdx
    // (0-based occurrence index) to anchorLine/anchorCol (1-based line, 0-based col).
    // Field-level migration is handled automatically in Phase 1/2 below.
    if (data.globalConfig) {
      S.globalConfig.description = data.globalConfig.description || '';
      S.globalConfig.repositories = (data.globalConfig.repositories || []).map(r => ({ ...r }));
    }
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

  // Phase 1: migrate link anchors from anchorMatchIdx → anchorLine/anchorCol.
  // Done before the node render loop so injectAnchor sees correct values.
  let _anchorMigrated = false;
  for (const lnk of S.links) {
    if (lnk.anchorLine == null) {
      if (lnk.anchorMatchIdx != null && lnk.anchorMatchIdx >= 0) {
        // defer conversion until source node is loaded — mark with sentinel
        lnk._pendingMatchIdx = lnk.anchorMatchIdx;
        _anchorMigrated = true;
      }
      lnk.anchorLine = -1;
      lnk.anchorCol  = -1;
    }
  }

  for (const nd of (data.nodes ?? [])) {
    let n;
    if (nd.type === 'arrow') {
      n = { id: nd.id, type: 'arrow', x: nd.x, y: nd.y,
            bodyLen: nd.bodyLen ?? 160, headLen: nd.headLen ?? 40,
            headWidth: nd.headWidth ?? 30, angle: nd.angle ?? 0,
            color: nd.color ?? 'blue', strokeWidth: nd.strokeWidth ?? 4 };
    } else if (nd.type === 'bubble') {
      n = { id: nd.id, type: 'bubble', x: nd.x, y: nd.y, w: nd.w, h: nd.h,
            text: nd.text ?? '', tailX: nd.tailX ?? nd.x + nd.w / 2, tailY: nd.tailY ?? nd.y + nd.h + 50,
            color: nd.color ?? 'green', fontFamily: nd.fontFamily ?? 'default', fontSize: nd.fontSize ?? 13,
            showTail: nd.showTail ?? true,
            tailAnchorId: nd.tailAnchorId ?? null, tailAnchorText: nd.tailAnchorText ?? null,
            tailAnchorFromId: nd.tailAnchorFromId ?? null,
            tailAnchorLine: nd.tailAnchorLine ?? -1, tailAnchorCol: nd.tailAnchorCol ?? -1,
            // carry legacy field for migration if old format (removed after phase 2)
            ...(nd.tailAnchorMatchIdx != null && nd.tailAnchorLine == null
              ? { _legacyTailMatchIdx: nd.tailAnchorMatchIdx } : {}) };
    } else if (nd.type === 'frame') {
      n = { id: nd.id, type: 'frame', x: nd.x, y: nd.y, w: nd.w, h: nd.h,
            label: nd.label ?? '', color: nd.color ?? 'blue',
            fontFamily: nd.fontFamily ?? 'default', fontSize: nd.fontSize ?? 12 };
    } else if (nd.type === 'text') {
      n = { id: nd.id, type: 'text', x: nd.x, y: nd.y, w: nd.w, h: nd.h,
            text: nd.text ?? '',
            textColor: nd.textColor ?? 'white',
            fontFamily: nd.fontFamily ?? 'default', fontSize: nd.fontSize ?? 20 };
    } else {
      n = { id: nd.id, x: nd.x, y: nd.y, w: nd.w, h: nd.h, code: nd.code,
            lang: nd.lang ?? 'text', title: nd.title ?? '', filePath: nd.filePath ?? '',
            showLineNumbers: nd.showLineNumbers ?? true, lineNumberStart: nd.lineNumberStart ?? 1,
            color: nd.color ?? 'blue', fontFamily: nd.fontFamily ?? 'default', fontSize: nd.fontSize ?? 12.5 };
    }
    S.nodes.push(n);
    const el = document.createElement('div');
    el.className = n.type === 'frame' ? 'frame-node'
                 : n.type === 'arrow' ? 'arrow-node'
                 : n.type === 'text'  ? 'text-node'
                 : 'node' + (n.type === 'bubble' ? ' bubble-node' : '');
    el.id = 'nd-' + n.id;
    canvas.appendChild(el);
    if (n.type === 'frame')      setupFrameEvents(n, el);
    else if (n.type === 'arrow') setupArrowEvents(n, el);
    else                         setupNodeEvents(n, el);
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

  // Phase 2: resolve _pendingMatchIdx sentinels now that all nodes are loaded.
  const _migratedFromIds = new Set();
  for (const lnk of S.links) {
    if (lnk._pendingMatchIdx != null) {
      const srcNode = S.nodes.find(n => n.id === lnk.fromId);
      if (srcNode?.code) {
        const lc = matchIdxToLineCol(srcNode.code, lnk.text, lnk._pendingMatchIdx);
        lnk.anchorLine = lc.line;
        lnk.anchorCol  = lc.col;
        _migratedFromIds.add(lnk.fromId);
      }
      delete lnk._pendingMatchIdx;
    }
  }
  for (const n of S.nodes) {
    if (n.type === 'bubble' && n._legacyTailMatchIdx != null && n._legacyTailMatchIdx >= 0) {
      const srcNode = S.nodes.find(s => s.id === n.tailAnchorFromId);
      if (srcNode?.code && n.tailAnchorText) {
        const lc = matchIdxToLineCol(srcNode.code, n.tailAnchorText, n._legacyTailMatchIdx);
        n.tailAnchorLine = lc.line;
        n.tailAnchorCol  = lc.col;
        _migratedFromIds.add(n.tailAnchorFromId);
      }
      delete n._legacyTailMatchIdx;
      _anchorMigrated = true;
    }
  }
  if (_anchorMigrated) scheduleSave();

  // Re-render code nodes that need tail-anchor spans injected, and any that
  // were just migrated so the correct primary anchor is shown.
  // Bubble nodes may appear after their target code node in the saved array,
  // so buildCodeHTML above found no bubbles yet and skipped injection.
  const anchoredFromIds = new Set([
    ...S.nodes
      .filter(n => n.type === 'bubble' && n.tailAnchorFromId != null)
      .map(n => n.tailAnchorFromId),
    ..._migratedFromIds,
  ]);
  for (const fromId of anchoredFromIds) {
    const cn = S.nodes.find(n => n.id === fromId);
    if (cn) renderNode(cn);
  }
  applyVP(); // also calls renderAnchoredBubbleTails
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
    cancelVPAnim();
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
          if (mn.type === 'bubble' && otailX !== undefined && !mn.tailAnchorId) {
            mn.tailX = otailX + dx;
            mn.tailY = otailY + dy;
          }
          const mel = ndEl(id);
          if (mel) { mel.style.left = mn.x + 'px'; mel.style.top = (mn.type === 'arrow' ? mn.y - 20 : mn.y) + 'px'; }
        }
      });
    } else {
      // Single-node drag
      const n = S.nodes.find(n => n.id === S.drag.id);
      if (n) {
        n.x = S.drag.ox + dx;
        n.y = S.drag.oy + dy;
        if (n.type === 'bubble' && S.drag.otailX !== undefined && !n.tailAnchorId) {
          n.tailX = S.drag.otailX + dx;
          n.tailY = S.drag.otailY + dy;
        }
        const el = ndEl(n.id);
        if (el) { el.style.left = n.x + 'px'; el.style.top = (n.type === 'arrow' ? n.y - 20 : n.y) + 'px'; }
      }
    }
    renderLinks();
    renderAnchoredBubbleTails();
  } else if (S.tailDrag) {
    const n = S.nodes.find(n => n.id === S.tailDrag.id);
    if (n) {
      const p = s2c(e.clientX, e.clientY);
      n.tailX = p.x; n.tailY = p.y;
      renderBubbleTail(n);
    }
  } else if (S.arrowDrag) {
    const n = S.nodes.find(n => n.id === S.arrowDrag.id);
    if (n) {
      const cp  = s2c(e.clientX, e.clientY);
      const rad = (n.angle ?? 0) * Math.PI / 180;
      const cosA = Math.cos(rad), sinA = Math.sin(rad);
      const dx = cp.x - n.x, dy = cp.y - n.y;
      if (S.arrowDrag.handleType === 'body') {
        const dot = dx * cosA + dy * sinA;
        n.bodyLen = Math.max(20, dot - (n.headLen ?? 40));
      } else if (S.arrowDrag.handleType === 'head') {
        const dot  = dx * cosA + dy * sinA;
        const perp = Math.abs(-dx * sinA + dy * cosA);
        n.headLen   = Math.max(8,  dot - (n.bodyLen ?? 160));
        n.headWidth = Math.max(6,  perp * 2);
      } else if (S.arrowDrag.handleType === 'rotate') {
        let angle = Math.atan2(dy, dx) * 180 / Math.PI;
        if (e.shiftKey) angle = Math.round(angle / 15) * 15;
        n.angle = angle;
      } else if (S.arrowDrag.handleType === 'stroke') {
        // Perpendicular distance from mouse to the shaft line (absolute value)
        const perp = Math.abs(-dx * sinA + dy * cosA);
        n.strokeWidth = Math.max(1, Math.round(perp));
      }
      const el = ndEl(n.id);
      if (el) renderNode(n, el);
    }
  } else if (S.resize) {
    const r = 1 / S.vp.scale;
    const n = S.nodes.find(n => n.id === S.resize.id);
    if (n) {
      const dx   = (e.clientX - S.resize.sx) * r;
      const dy   = (e.clientY - S.resize.sy) * r;
      const edge = S.resize.edge;
      const minW = n.type === 'text' ? 60 : (n.type === 'frame' || n.type === 'bubble') ? 120 : 250;
      const minH = n.type === 'text' ? 30 : (n.type === 'frame' || n.type === 'bubble') ? 60  : 120;
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
      renderAnchoredBubbleTails();
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
  if (S.arrowDrag) { S.arrowDrag = null; scheduleSave(); }
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
        let inMarquee;
        if (n.type === 'arrow') {
          const rad = (n.angle ?? 0) * Math.PI / 180;
          const tot = (n.bodyLen ?? 160) + (n.headLen ?? 40);
          const tx  = n.x + tot * Math.cos(rad), ty = n.y + tot * Math.sin(rad);
          const ax0 = Math.min(n.x, tx), ax1 = Math.max(n.x, tx);
          const ay0 = Math.min(n.y, ty), ay1 = Math.max(n.y, ty);
          inMarquee = ax0 < c1.x && ax1 > c0.x && ay0 < c1.y && ay1 > c0.y;
        } else {
          inMarquee = n.x < c1.x && n.x + n.w > c0.x && n.y < c1.y && n.y + n.h > c0.y;
        }
        if (inMarquee) {
          S.multiSel.add(n.id);
          ndEl(n.id)?.classList.add('multi-selected');
        }
      });
      // Also select free lines whose bounding box overlaps the marquee rect
      S.freeLines.forEach(line => {
        if (line.points.length === 0) return;
        const xs = line.points.map(p => p.x);
        const ys = line.points.map(p => p.y);
        const lx0 = Math.min(...xs), lx1 = Math.max(...xs);
        const ly0 = Math.min(...ys), ly1 = Math.max(...ys);
        if (lx0 < c1.x && lx1 > c0.x && ly0 < c1.y && ly1 > c0.y) {
          S.multiSelLines.add(line.id);
        }
      });
      if (S.multiSelLines.size > 0) renderFreeLines();
      const count = S.multiSel.size + S.multiSelLines.size;
      setStatus(count > 0 ? `${count} object(s) selected — drag header to move all` : 'Ready — double-click to add block | select text to create link | right-click link to delete');
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
    cancelVPAnim();
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
    else if (S.tailAttachMode) exitTailAttachMode();
    else if (S.editing) stopEdit();
  }
  if ((e.code === 'Delete' || e.code === 'Backspace') && !isInput && !S.editing) {
    if (S.multiSel.size > 0 || S.multiSelLines.size > 0) {
      e.preventDefault();
      pushUndo();
      _suppressUndo = true;
      [...S.multiSel].forEach(id => removeNode(id));
      [...S.multiSelLines].forEach(lid => removeFreeLine(lid));
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

// ── Toolbar buttons ──
document.getElementById('btn-add').addEventListener('click', () => {
  const p = s2c(wrap.clientWidth / 2, wrap.clientHeight / 2);
  addNode(p.x - 215, p.y - 135);
});

document.getElementById('btn-add-text')?.addEventListener('click', () => {
  const p = s2c(wrap.clientWidth / 2, wrap.clientHeight / 2);
  addText(p.x - 100, p.y - 40);
});

document.getElementById('btn-add-line')?.addEventListener('click', () => {
  if (S.lineDrawMode) exitLineDrawMode();
  else enterLineDrawMode();
});

document.getElementById('btn-add-arrow')?.addEventListener('click', () => {
  const p = s2c(wrap.clientWidth / 2, wrap.clientHeight / 2);
  addArrow(p.x - 80, p.y);
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
  S.nodes = []; S.links = []; S.freeLines = []; S.nid = 1; S.lid = 1; S.flid = 1; S.taid = 1;
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

    // Search input
    const searchWrap = document.createElement('div');
    searchWrap.className = 'nav-search-wrap';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'nav-search';
    searchInput.placeholder = 'Filter…';
    searchInput.setAttribute('autocomplete', 'off');
    searchWrap.appendChild(searchInput);
    panel.appendChild(searchWrap);

    const listContainer = document.createElement('div');
    panel.appendChild(listContainer);

    const cmp = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
    const blocks = S.nodes.filter(n => !n.type)
      .sort((a, b) => cmp(a.title || a.filePath || '', b.title || b.filePath || ''));
    const bubbles = S.nodes.filter(n => n.type === 'bubble')
      .sort((a, b) => cmp(a.text || '', b.text || ''));
    const frames = S.nodes.filter(n => n.type === 'frame')
      .sort((a, b) => cmp(a.label || '', b.label || ''));

    function makeItem(n, icon, label, path, sub) {
      const div = document.createElement('div');
      const hasPath = path !== undefined;
      div.className = 'nav-item' + (hasPath ? ' nav-has-path' : '');
      div.innerHTML =
        `<span class="nav-icon">${icon}</span>` +
        `<span class="nav-label">${esc(label)}</span>` +
        (hasPath ? `<span class="nav-path">${esc(path)}</span>` : '') +
        (sub !== undefined ? `<span class="nav-sub">${esc(sub)}</span>` : '');
      div.addEventListener('click', () => { closeNavigator(); jumpTo(n.id); });
      return div;
    }

    function addSection(container, title, nodes, icon, labelFn, pathFn, subFn) {
      const sec = document.createElement('div');
      sec.className = 'nav-section';
      sec.textContent = title;
      container.appendChild(sec);
      if (nodes.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'nav-empty';
        empty.textContent = 'None';
        container.appendChild(empty);
      } else {
        nodes.forEach(n => container.appendChild(makeItem(n, icon, labelFn(n), pathFn?.(n), subFn?.(n))));
      }
    }

    function renderList(query) {
      listContainer.innerHTML = '';
      const q = query.trim().toLowerCase();
      function matches(...texts) {
        if (!q) return true;
        return texts.some(t => t && t.toLowerCase().includes(q));
      }

      const filteredBlocks = blocks.filter(n => matches(n.title, n.filePath, n.lang));
      const filteredBubbles = bubbles.filter(n => matches((n.text || '').replace(/\s+/g, ' ').trim()));
      const filteredFrames = frames.filter(n => matches(n.label));

      addSection(listContainer, 'Blocks', filteredBlocks, '▣',
        n => n.title || '(Untitled)',
        n => n.filePath || '',
        n => n.lang || '');
      const div1 = document.createElement('div'); div1.className = 'nav-divider'; listContainer.appendChild(div1);
      addSection(listContainer, 'Bubbles', filteredBubbles, '💬',
        n => (n.text || '').replace(/\s+/g, ' ').trim().slice(0, 40) || '(Empty)');
      const div2 = document.createElement('div'); div2.className = 'nav-divider'; listContainer.appendChild(div2);
      addSection(listContainer, 'Frames', filteredFrames, '⬜',
        n => n.label || '(Untitled)');
    }

    renderList('');
    searchInput.addEventListener('input', () => renderList(searchInput.value));
    searchInput.addEventListener('keydown', e => { if (e.key === 'Escape') closeNavigator(); });

    // Position below the button
    const rect = btn.getBoundingClientRect();
    panel.style.top = (rect.bottom + 6) + 'px';
    panel.style.left = rect.left + 'px';
    document.body.appendChild(panel);
    searchInput.focus();

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
  globalThis.__canvasApp = { S, STORAGE_KEY, addNode, removeNode, selectNode, addBubble, addFrame, addText, addArrow, loadState,
    saveState, restoreFromStorage,
    createLink, removeLink,
    copyNodes, cutNodes, pasteNodes, toggleMultiSel,
    addFreeLine, removeFreeLine,
    pushUndo, undo,
    startEdit, stopEdit,
    s2c, zoom };
}
