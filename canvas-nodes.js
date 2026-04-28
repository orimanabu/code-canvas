// No local imports — all deps injected via initNodes(deps)
import { roundedRectRayHit, anchorFpFromSide, NODE_COLORS, svgE } from './canvas-utils.js';

export function initNodes(deps) {
  const { S, canvas, wrap, ndEl, s2c, c2s,
    renderNode, renderLinks, renderFreeLines,
    pushUndo, suppressUndo, scheduleSave, setStatus,
    applyVP, animateVP,
    enterLinkMode, exitLinkMode,
    enterTailAttachMode, exitTailAttachMode,
    showAnchorCtx, showTailAnchorCtx,
    createLink, removeLink,
    removeFreeLine,
    targetEntryPoint,
  } = deps;

  // ═══════════════════════════════════════════════════════
  // BUBBLE TAIL
  // ═══════════════════════════════════════════════════════
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
    let tipX = n.tailX, tipY = n.tailY;
    if (n.tailAnchorId != null) {
      const anchorEl = document.querySelector(`.tail-anchor[data-taid="${n.tailAnchorId}"]`);
      if (anchorEl) {
        const anchorRect = anchorEl.getBoundingClientRect();
        const anchorCenter = { x: anchorRect.left + anchorRect.width / 2, y: anchorRect.top + anchorRect.height / 2 };
        const { side } = targetEntryPoint(anchorCenter, n);
        const screenTip = anchorFpFromSide(anchorRect, side);
        const cp = s2c(screenTip.x, screenTip.y);
        tipX = cp.x; tipY = cp.y;
      }
    }
    const tip = { x: tipX - n.x - bord, y: tipY - n.y - bord };
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

    // Size the SVG viewport to exactly cover all drawn elements
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
      opacity: '0.7',
    });
    handle.addEventListener('mousedown', e => {
      e.stopPropagation(); e.preventDefault();
      pushUndo();
      // Detach from anchor on drag start — freeze current position as free coords
      if (n.tailAnchorId != null) {
        const anchorEl = document.querySelector(`.tail-anchor[data-taid="${n.tailAnchorId}"]`);
        if (anchorEl) {
          const ar = anchorEl.getBoundingClientRect();
          const cp = s2c(ar.left + ar.width / 2, ar.top + ar.height / 2);
          n.tailX = cp.x; n.tailY = cp.y;
        }
        const oldFromId = n.tailAnchorFromId;
        n.tailAnchorId = null; n.tailAnchorText = null; n.tailAnchorFromId = null; n.tailAnchorLine = -1; n.tailAnchorCol = -1;
        if (oldFromId != null) {
          const cn = S.nodes.find(c => c.id === oldFromId);
          if (cn) renderNode(cn);
        }
        scheduleSave();
      }
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
      fontFamily: 'default', fontSize: 13,
      showTail: true,
      tailAnchorId: null, tailAnchorText: null, tailAnchorFromId: null, tailAnchorLine: -1, tailAnchorCol: -1,
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
    suppressUndo(true);
    startEdit(n.id);
    suppressUndo(false);
    scheduleSave();
    return n;
  }

  function renderAnchoredBubbleTails() {
    for (const n of S.nodes) {
      if (n.type === 'bubble' && n.tailAnchorId != null && n.showTail !== false)
        renderBubbleTail(n);
    }
  }

  function attachTailToText(bubbleNode, fromId, text, tailLine = -1, tailCol = -1) {
    pushUndo();
    const oldFromId = bubbleNode.tailAnchorFromId;
    bubbleNode.tailAnchorId     = S.taid++;
    bubbleNode.tailAnchorText   = text;
    bubbleNode.tailAnchorFromId = fromId;
    bubbleNode.tailAnchorLine   = tailLine;
    bubbleNode.tailAnchorCol    = tailCol;
    const codeNode = S.nodes.find(n => n.id === fromId);
    if (codeNode) renderNode(codeNode);
    if (oldFromId != null && oldFromId !== fromId) {
      const oldNode = S.nodes.find(n => n.id === oldFromId);
      if (oldNode) renderNode(oldNode);
    }
    renderBubbleTail(bubbleNode);
    scheduleSave();
  }

  // ═══════════════════════════════════════════════════════
  // FRAME NODE
  // ═══════════════════════════════════════════════════════
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

  function addText(x, y) {
    pushUndo();
    const n = {
      id: S.nid++, type: 'text',
      x, y, w: 200, h: 80,
      text: '',
      textColor: 'white',
      fontFamily: 'default', fontSize: 20,
    };
    S.nodes.push(n);
    const el = document.createElement('div');
    el.className = 'text-node';
    el.id = 'nd-' + n.id;
    canvas.appendChild(el);
    setupNodeEvents(n, el);
    renderNode(n, el);
    renderLinks();
    selectNode(n.id);
    suppressUndo(true);
    startEdit(n.id);
    suppressUndo(false);
    scheduleSave();
    return n;
  }

  function addFrame(x, y, w, h, label, color) {
    pushUndo();
    const n = {
      id: S.nid++, type: 'frame',
      x, y, w, h,
      label: label ?? '',
      color: color ?? 'blue',
      fontFamily: 'default', fontSize: 12,
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

  // ═══════════════════════════════════════════════════════
  // NODE LIFECYCLE
  // ═══════════════════════════════════════════════════════
  function addNode(x, y, code) {
    pushUndo();
    const n = {
      id: S.nid++, x, y, w: 430, h: 270,
      code: code ?? '',
      lang: 'javascript',
      title: '', filePath: '',
      showLineNumbers: true, lineNumberStart: 1,
      color: 'blue',
      fontFamily: 'default', fontSize: 12.5,
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
    suppressUndo(true);
    startEdit(n.id);
    suppressUndo(false);
    scheduleSave();
    return n;
  }

  function setupNodeEvents(n, el) {
    el.addEventListener('mousedown', e => {
      if (e.button !== 0) return;

      // Link-mode: clicking a node creates a link
      if (S.linkMode) {
        if (S.pending && S.pending.fromId !== n.id) {
          createLink(S.pending.fromId, S.pending.text, n.id, S.pending.anchorLine ?? -1, S.pending.anchorCol ?? -1);
          exitLinkMode();
        }
        e.stopPropagation();
        return;
      }

      // Tail-attach-mode: clicking a bubble attaches its tail
      if (S.tailAttachMode) {
        if (S.tailPending && n.type === 'bubble') {
          attachTailToText(n, S.tailPending.fromId, S.tailPending.text, S.tailPending.tailLine ?? -1, S.tailPending.tailCol ?? -1);
          exitTailAttachMode();
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

      // Shift+click: toggle multi-selection
      if (e.shiftKey) {
        if (!e.target.closest('.node-btn') && !e.target.closest('input') && !e.target.closest('textarea')) {
          e.preventDefault();
          e.stopPropagation();
          // Auto-include the currently selected node (S.sel) into multiSel
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

      const onHeader = (
        e.target.closest('.node-header, .bubble-header, .text-node-header') ||
        (n.type === 'text' && !e.target.closest('textarea'))
      ) && !e.target.closest('.node-btn') && !e.target.closest('input');

      // If clicking a node already in multi-selection: keep selection, start group drag
      if (S.multiSel.size >= 1 && S.multiSel.has(n.id)) {
        S.sel = n.id;
        if (onHeader) {
          e.preventDefault();
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

      // Drag from header
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
      if ((n.type === 'text' || n.type === 'bubble') && !e.target.closest('.node-btn') && S.editing !== n.id) {
        startEdit(n.id);
      }
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
    const codeLines = pre.querySelectorAll('.code-line');
    pre.style.whiteSpace = 'pre';
    codeLines.forEach(l => { l.style.whiteSpace = 'pre'; });
    pre.style.display = 'inline-block';
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
    // Only update CSS class — do NOT rebuild innerHTML here
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
    if (S.multiSelLines.size > 0) {
      S.multiSelLines.clear();
      renderFreeLines();
    }
  }

  function removeNode(id) {
    pushUndo();
    const removed = S.nodes.find(n => n.id === id);

    // Collect source nodes whose link-anchor spans must be cleared
    const affectedFromIds = S.links
      .filter(l => l.toId === id)
      .map(l => l.fromId);

    // If removing a bubble with a tail anchor, re-render the code node to clear the span
    if (removed?.type === 'bubble' && removed.tailAnchorFromId != null) {
      if (!affectedFromIds.includes(removed.tailAnchorFromId))
        affectedFromIds.push(removed.tailAnchorFromId);
    }

    S.nodes = S.nodes.filter(n => n.id !== id);
    S.links = S.links.filter(l => l.fromId !== id && l.toId !== id);

    // If removing a code node, clear tail anchors on bubbles that pointed into it
    if (!removed?.type || removed.type === 'code') {
      S.nodes.forEach(n => {
        if (n.type === 'bubble' && n.tailAnchorFromId === id) {
          n.tailAnchorId = null; n.tailAnchorText = null; n.tailAnchorFromId = null; n.tailAnchorLine = -1; n.tailAnchorCol = -1;
        }
      });
    }

    const el = ndEl(id);
    if (el) el.remove();
    if (S.sel === id)     S.sel = null;
    if (S.editing === id) S.editing = null;
    S.multiSel.delete(id);

    // Re-render source nodes to remove stale link-anchor / tail-anchor spans
    affectedFromIds.forEach(fromId => {
      const fn = S.nodes.find(n => n.id === fromId);
      if (fn) renderNode(fn);
    });

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
    const items = [];
    const selectedIdSet = new Set(getSelectedIds());
    for (const id of selectedIdSet) {
      const n = S.nodes.find(nn => nn.id === id);
      if (n) items.push({ _clipType: 'node', ...n });
    }
    // Include links where both endpoints are in the selection
    for (const lnk of S.links) {
      if (selectedIdSet.has(lnk.fromId) && selectedIdSet.has(lnk.toId)) {
        items.push({ _clipType: 'link', ...lnk });
      }
    }
    if (S.selLine !== null) {
      const line = S.freeLines.find(l => l.id === S.selLine);
      if (line) items.push({ _clipType: 'freeline', ...line, points: line.points.map(p => ({ ...p })) });
    }
    S.multiSelLines.forEach(lid => {
      if (S.selLine === lid) return; // already added above
      const line = S.freeLines.find(l => l.id === lid);
      if (line) items.push({ _clipType: 'freeline', ...line, points: line.points.map(p => ({ ...p })) });
    });
    if (items.length === 0) return;
    S.clipboard = items;
    localStorage.setItem('code-canvas-clipboard', JSON.stringify(items));
    const nodeCount = items.filter(i => i._clipType === 'node').length;
    setStatus(`${nodeCount} object(s) copied (Cmd/Ctrl+V to paste)`);
  }

  function cutNodes() {
    pushUndo();
    const items = [];
    const ids = getSelectedIds();
    const idSet = new Set(ids);
    for (const id of ids) {
      const n = S.nodes.find(nn => nn.id === id);
      if (n) items.push({ _clipType: 'node', ...n });
    }
    // Include links where both endpoints are in the selection
    for (const lnk of S.links) {
      if (idSet.has(lnk.fromId) && idSet.has(lnk.toId)) {
        items.push({ _clipType: 'link', ...lnk });
      }
    }
    suppressUndo(true);
    ids.forEach(id => removeNode(id));
    if (S.selLine !== null) {
      const line = S.freeLines.find(l => l.id === S.selLine);
      if (line) items.push({ _clipType: 'freeline', ...line, points: line.points.map(p => ({ ...p })) });
      removeFreeLine(S.selLine);
    }
    const linesToCut = [...S.multiSelLines].filter(lid => lid !== S.selLine);
    linesToCut.forEach(lid => {
      const line = S.freeLines.find(l => l.id === lid);
      if (line) items.push({ _clipType: 'freeline', ...line, points: line.points.map(p => ({ ...p })) });
      removeFreeLine(lid);
    });
    suppressUndo(false);
    if (items.length === 0) return;
    S.clipboard = items;
    localStorage.setItem('code-canvas-clipboard', JSON.stringify(items));
    const nodeCount = items.filter(i => i._clipType === 'node').length;
    setStatus(`${nodeCount} object(s) cut (Cmd/Ctrl+V to paste)`);
  }

  function pasteNodes() {
    const stored = localStorage.getItem('code-canvas-clipboard');
    if (stored) {
      try { S.clipboard = JSON.parse(stored); } catch { /* keep S.clipboard as-is */ }
    }
    if (S.clipboard.length === 0) return;
    pushUndo();
    clearMultiSel();
    selectNode(null);
    const offset = 30;

    // Compute candidate positions (with offset) and their bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const data of S.clipboard) {
      if (data._clipType === 'link') continue; // links have no position
      if (data._clipType === 'freeline') {
        for (const p of data.points) {
          minX = Math.min(minX, p.x + offset); minY = Math.min(minY, p.y + offset);
          maxX = Math.max(maxX, p.x + offset); maxY = Math.max(maxY, p.y + offset);
        }
      } else {
        const x = data.x + offset, y = data.y + offset;
        const w = data.w || 0, h = data.h || 0;
        minX = Math.min(minX, x); minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + w); maxY = Math.max(maxY, y + h);
      }
    }

    // Visible canvas area in canvas coordinates
    const vw = window.innerWidth, vh = window.innerHeight;
    const visLeft  = -S.vp.x / S.vp.scale;
    const visTop   = -S.vp.y / S.vp.scale;
    const visRight  = (vw - S.vp.x) / S.vp.scale;
    const visBottom = (vh - S.vp.y) / S.vp.scale;

    // If the bounding box does not intersect the visible area, shift to visible center
    let dx = 0, dy = 0;
    const offScreen = maxX < visLeft || minX > visRight || maxY < visTop || minY > visBottom;
    if (offScreen) {
      const groupCX = (minX + maxX) / 2;
      const groupCY = (minY + maxY) / 2;
      const visCX = (visLeft + visRight) / 2;
      const visCY = (visTop + visBottom) / 2;
      dx = visCX - groupCX;
      dy = visCY - groupCY;
    }

    let pastedLineId = null;
    const pastedNodeIds = [];
    const oldToNewId = new Map(); // old node id → new node id

    for (const data of S.clipboard) {
      if (data._clipType === 'freeline') {
        const line = {
          id: S.flid++,
          points: data.points.map(p => ({ x: p.x + offset + dx, y: p.y + offset + dy })),
          lineStyle: data.lineStyle || 'polyline',
          stroke: data.stroke || '#e6edf3',
          strokeWidth: data.strokeWidth || 2,
          dash: data.dash || '',
        };
        S.freeLines.push(line);
        pastedLineId = line.id;
      } else {
        // node (code block, bubble, frame) — _clipType may be 'node' or absent (legacy)
        if (data._clipType === 'link') continue; // handled after nodes
        const oldId = data.id;
        const n = { ...data, id: S.nid++, x: data.x + offset + dx, y: data.y + offset + dy };
        oldToNewId.set(oldId, n.id);
        delete n._clipType;
        if (n.type === 'bubble') {
          n.tailX = (data.tailX ?? data.x + data.w / 2) + offset + dx;
          n.tailY = (data.tailY ?? data.y + data.h + 50) + offset + dy;
          // Pasted bubbles start with a free tail — no anchor collision risk
          n.tailAnchorId = null; n.tailAnchorText = null; n.tailAnchorFromId = null; n.tailAnchorLine = -1; n.tailAnchorCol = -1;
        }
        S.nodes.push(n);
        const el = document.createElement('div');
        el.className = n.type === 'frame' ? 'frame-node'
                     : n.type === 'text'  ? 'text-node'
                     : 'node' + (n.type === 'bubble' ? ' bubble-node' : '');
        el.id = 'nd-' + n.id;
        canvas.appendChild(el);
        if (n.type === 'frame') setupFrameEvents(n, el);
        else setupNodeEvents(n, el);
        renderNode(n, el);
        S.multiSel.add(n.id);
        ndEl(n.id)?.classList.add('multi-selected');
        pastedNodeIds.push(n.id);
      }
    }

    // Recreate links between pasted nodes using remapped IDs
    for (const data of S.clipboard) {
      if (data._clipType !== 'link') continue;
      const newFrom = oldToNewId.get(data.fromId);
      const newTo   = oldToNewId.get(data.toId);
      if (newFrom !== undefined && newTo !== undefined) {
        S.links.push({
          id: S.lid++,
          fromId: newFrom,
          text: data.text,
          toId: newTo,
          stroke: data.stroke || '#388bfd',
          strokeWidth: data.strokeWidth || 1.5,
          dash: data.dash || '',
          anchorLine: data.anchorLine ?? -1,
          anchorCol:  data.anchorCol  ?? -1,
        });
      }
    }
    renderLinks();

    // Bring all pasted nodes to the front, preserving their relative order
    for (const id of pastedNodeIds) {
      const idx = S.nodes.findIndex(n => n.id === id);
      if (idx >= 0 && idx < S.nodes.length - 1) {
        S.nodes.push(S.nodes.splice(idx, 1)[0]);
      }
      const el = ndEl(id);
      if (el) canvas.appendChild(el);
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
    const nextOffsetX = offset + dx;
    const nextOffsetY = offset + dy;
    S.clipboard = S.clipboard.map(d => {
      if (d._clipType === 'link') return d; // links carry no position
      if (d._clipType === 'freeline') {
        return { ...d, points: d.points.map(p => ({ x: p.x + nextOffsetX, y: p.y + nextOffsetY })) };
      }
      return { ...d, x: d.x + nextOffsetX, y: d.y + nextOffsetY };
    });
    const pastedNodeCount = pastedNodeIds.length;
    setStatus(`${pastedNodeCount} object(s) pasted`);
    scheduleSave();
  }

  // ═══════════════════════════════════════════════════════
  // FIT / JUMP
  // ═══════════════════════════════════════════════════════
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
    const cx = pad + availW / 2;
    const cy = topPad + availH / 2;
    const tx = cx - (minX + bw / 2) * ns;
    const ty = cy - (minY + bh / 2) * ns;
    animateVP(tx, ty, ns);
    setStatus(`Fit: ${Math.round(ns * 100)}%`);
  }

  function jumpTo(id) {
    const n = S.nodes.find(n => n.id === id);
    if (!n) return;
    const vw = wrap.clientWidth, vh = wrap.clientHeight;
    const tx = vw / 2 - (n.x + n.w / 2) * S.vp.scale;
    const ty = vh / 2 - (n.y + n.h / 2) * S.vp.scale;
    animateVP(tx, ty);
    selectNode(id);
  }

  return {
    addNode, addBubble, addFrame, addText, removeNode,
    selectNode, toggleMultiSel, clearMultiSel,
    startEdit, stopEdit, autoFitNode,
    setupNodeEvents, setupFrameEvents,
    renderBubbleTail, renderAnchoredBubbleTails, attachTailToText,
    getSelectedIds, copyNodes, cutNodes, pasteNodes,
    fitAll, jumpTo,
  };
}
