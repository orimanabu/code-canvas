import { svgE, LINK_COLORS, LINK_WIDTHS, LINK_DASHES, edgePoint, anchorFpFromSide,
         makeDashSvg, makeWidthSvg, positionCtxMenu, READY_STATUS, buildMenuItems } from './canvas-utils.js';

export function initLinks(deps) {
  const { S, wrap, svgLinks, canvas, ndEl,
    linkTip, linkTipLink, linkTipNewBlock, linkTipAttachTail,
    linkCtx, linkCtxDel, linkCtxColors, linkCtxWidths, linkCtxDashes,
    anchorCtx, anchorCtxLink, anchorCtxNewBlock, anchorCtxAttachTail, anchorCtxDelAll,
    tailAnchorCtx, tailAnchorCtxDetach,
    linkPreviewEl,
    renderNode, addNode, selectNode, startEdit,
    renderBubbleTail,
    pushUndo, scheduleSave, setStatus,
    s2c, c2s,
    enterTailAttachMode,
  } = deps;

  // ═══════════════════════════════════════════════════════
  // LINKS
  // ═══════════════════════════════════════════════════════
  function createLink(fromId, text, toId, anchorMatchIdx = -1) {
    // Avoid duplicate
    if (S.links.find(l => l.fromId === fromId && l.text === text && l.toId === toId)) {
      setStatus(`⚠ A link from "${text}" to this block already exists`);
      return;
    }
    pushUndo();
    S.links.push({ id: S.lid++, fromId, text, toId, stroke: '#388bfd', strokeWidth: 1.5, dash: '', anchorMatchIdx });
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

  // End point of arrow (screen coords): used by link preview and bubble tail rendering.
  // fp is in screen coordinates; return values are in screen coordinates.
  function targetEntryPoint(fp, tn) {
    const nTL = c2s(tn.x,            tn.y);
    const nBR = c2s(tn.x + tn.w,     tn.y + tn.h);

    // Candidate points (screen coords)
    const left   = c2s(tn.x,              tn.y + tn.h * 0.25);
    const top    = c2s(tn.x + tn.w * 0.2, tn.y);
    const right  = c2s(tn.x + tn.w,       tn.y + tn.h * 0.25);
    const bottom = c2s(tn.x + tn.w * 0.2, tn.y + tn.h);

    if (fp.x > nBR.x) return { point: right,  side: 'right' };
    if (fp.y > nBR.y && fp.x > nTL.x) return { point: bottom, side: 'bottom' };
    if (fp.y < nTL.y && fp.x > nTL.x) return { point: top,    side: 'top' };
    return { point: left, side: 'left' };  // default: left edge, upper area
  }

  // End point of arrow (canvas coords): used by renderLinks() for per-node SVGs.
  // fp is in canvas coordinates; return values are in canvas coordinates.
  function targetEntryPointCanvas(fp, tn) {
    if (fp.x > tn.x + tn.w)
      return { point: { x: tn.x + tn.w,       y: tn.y + tn.h * 0.25 }, side: 'right' };
    if (fp.y > tn.y + tn.h && fp.x > tn.x)
      return { point: { x: tn.x + tn.w * 0.2, y: tn.y + tn.h },        side: 'bottom' };
    if (fp.y < tn.y         && fp.x > tn.x)
      return { point: { x: tn.x + tn.w * 0.2, y: tn.y },                side: 'top' };
    return   { point: { x: tn.x,               y: tn.y + tn.h * 0.25 }, side: 'left' };
  }

  // Render all links as per-source-node SVG elements inside #canvas.
  // Each source node gets a <svg class="node-link-svg"> inserted right after its div,
  // so link z-order matches the source node's z-order.
  // Paths use canvas (world) coordinates since the SVGs live inside the transformed #canvas.
  function renderLinks() {
    // Remove existing per-node link SVGs
    canvas.querySelectorAll('.node-link-svg').forEach(e => e.remove());

    // Group links by fromId, preserving S.nodes order
    const linksByFrom = new Map();
    for (const n of S.nodes) linksByFrom.set(n.id, []);
    for (const lnk of S.links) {
      if (linksByFrom.has(lnk.fromId)) linksByFrom.get(lnk.fromId).push(lnk);
    }

    for (const fn of S.nodes) {
      const nodeLinks = linksByFrom.get(fn.id) || [];
      if (!nodeLinks.length) continue;

      const nodeEl = ndEl(fn.id);
      if (!nodeEl) continue;

      // Compute canvas-coord bounding box covering source + all target nodes, plus padding.
      // The SVG is sized to this box so all paths fit within the SVG viewport.
      const pad = 80;
      let minX = fn.x - pad, minY = fn.y - pad;
      let maxX = fn.x + fn.w + pad, maxY = fn.y + fn.h + pad;
      for (const lnk of nodeLinks) {
        const tn = S.nodes.find(n => n.id === lnk.toId);
        if (!tn) continue;
        minX = Math.min(minX, tn.x - pad);
        minY = Math.min(minY, tn.y - pad);
        maxX = Math.max(maxX, tn.x + tn.w + pad);
        maxY = Math.max(maxY, tn.y + tn.h + pad);
      }
      const svgW = maxX - minX, svgH = maxY - minY;

      // Create an SVG layer right after this source node's div.
      // Position and viewBox make SVG user units equal to canvas (world) coordinates.
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'node-link-svg');
      svg.setAttribute('data-src', fn.id);
      svg.setAttribute('viewBox', `${minX} ${minY} ${svgW} ${svgH}`);
      svg.style.left   = minX + 'px';
      svg.style.top    = minY + 'px';
      svg.style.width  = svgW + 'px';
      svg.style.height = svgH + 'px';
      nodeEl.insertAdjacentElement('afterend', svg);

      for (const lnk of nodeLinks) {
        const tn = S.nodes.find(n => n.id === lnk.toId);
        if (!tn) continue;

        // Start point in canvas coords.
        // Prefer the span marked data-lid-primary; fall back to first span for this link,
        // then to a sibling link's span, then to node edge.
        let anchorEl = document.querySelector(`.link-anchor[data-lid="${lnk.id}"][data-lid-primary]`)
                    || document.querySelector(`.link-anchor[data-lid="${lnk.id}"]`);
        if (!anchorEl) {
          const sibling = S.links.find(l => l.fromId === lnk.fromId && l.text === lnk.text && l.id !== lnk.id);
          if (sibling) anchorEl = document.querySelector(`.link-anchor[data-lid="${sibling.id}"]`);
        }

        let fp, canvasAnchorRect;
        if (anchorEl) {
          // Convert screen-coord DOMRect to canvas coords for use in canvas-space SVG
          const sr = anchorEl.getBoundingClientRect();
          const tl = s2c(sr.left, sr.top);
          const br = s2c(sr.right, sr.bottom);
          canvasAnchorRect = { left: tl.x, top: tl.y, right: br.x, bottom: br.y,
                               width: br.x - tl.x, height: br.y - tl.y };
          fp = { x: (tl.x + br.x) / 2, y: (tl.y + br.y) / 2 };
        } else {
          fp = edgePoint(fn, tn);
        }

        const { point: tp, side } = targetEntryPointCanvas(fp, tn);
        if (anchorEl) fp = anchorFpFromSide(canvasAnchorRect, side);

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

        svg.appendChild(g);
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // LINK MODE
  // ═══════════════════════════════════════════════════════
  function enterLinkMode(fromId, text, anchorRect = null, anchorMatchIdx = -1) {
    S.linkMode = true;
    S.pending = { fromId, text, anchorRect, anchorMatchIdx };
    document.body.classList.add('link-mode');
    setStatus(`🔗 Click the target block — "${text}" → ? (Esc to cancel)`);
  }

  function exitLinkMode() {
    S.linkMode = false;
    S.pending = null;
    document.body.classList.remove('link-mode');
    linkTip.style.display = 'none';
    linkPreviewEl.style.display = 'none';
    setStatus(READY_STATUS);
  }

  // ═══════════════════════════════════════════════════════
  // TAIL ATTACH MODE
  // ═══════════════════════════════════════════════════════
  function enterTailAttachModeLocal(fromId, text) {
    S.tailAttachMode = true;
    S.tailPending = { fromId, text };
    document.body.classList.add('tail-attach-mode');
    setStatus(`📌 Click a bubble to attach its tail to "${text}" (Esc to cancel)`);
  }

  function exitTailAttachMode() {
    S.tailAttachMode = false;
    S.tailPending = null;
    document.body.classList.remove('tail-attach-mode');
    setStatus(READY_STATUS);
  }

  // ═══════════════════════════════════════════════════════
  // LINK CONTEXT MENU
  // ═══════════════════════════════════════════════════════
  function showLinkCtx(linkId, x, y) {
    const lnk = S.links.find(l => l.id === linkId);
    if (!lnk) return;

    const curStroke = lnk.stroke || '#388bfd';
    const curWidth  = lnk.strokeWidth || 1.5;
    const curDash   = lnk.dash || '';

    buildMenuItems(linkCtxColors, LINK_COLORS, curStroke, {
      tag: 'div', baseClass: 'lk-color-swatch',
      setContent: (sw, c) => { sw.style.background = c.value; sw.title = c.label; },
      // Rebuild the whole menu after a color change so width/dash SVGs update to the new color.
      onSelect: value => { lnk.stroke = value; renderLinks(); scheduleSave(); showLinkCtx(linkId, x, y); },
    });

    buildMenuItems(linkCtxWidths, LINK_WIDTHS, curWidth, {
      tag: 'button', baseClass: 'lk-width-btn',
      setContent: (btn, w) => { btn.innerHTML = makeWidthSvg(Math.min(w.value, 5), curStroke); btn.title = `${w.value}px`; },
      onSelect: value => { lnk.strokeWidth = value; renderLinks(); scheduleSave(); },
    });

    buildMenuItems(linkCtxDashes, LINK_DASHES, curDash, {
      tag: 'button', baseClass: 'lk-dash-btn',
      setContent: (btn, d) => { btn.innerHTML = makeDashSvg(d.value, curStroke); btn.title = d.title; },
      onSelect: value => { lnk.dash = value; renderLinks(); scheduleSave(); },
    });

    linkCtxDel.onclick = () => { hideLinkCtx(); removeLink(linkId); };
    positionCtxMenu(linkCtx, x, y);
  }

  function hideLinkCtx() {
    linkCtx.style.display = 'none';
  }

  // Anchor context menu (right-click on existing link-anchor span)
  function showAnchorCtx(fromId, text, anchorEl, x, y) {
    const rect = anchorEl.getBoundingClientRect();
    const anchorRect = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };

    anchorCtxLink.onclick = () => {
      hideAnchorCtx();
      enterLinkMode(fromId, text, anchorRect);
    };
    anchorCtxNewBlock.onclick = () => {
      hideAnchorCtx();
      const fn = S.nodes.find(n => n.id === fromId);
      const nx = fn ? fn.x + fn.w + 60 : 100;
      const ny = s2c(anchorRect.left + anchorRect.width / 2, anchorRect.top + anchorRect.height / 2).y;
      const newNode = addNode(nx, ny);
      newNode.pendingKeyword = text;
      createLink(fromId, text, newNode.id);
      renderLinks();
      selectNode(newNode.id);
      startEdit(newNode.id);
    };
    anchorCtxAttachTail.onclick = () => {
      hideAnchorCtx();
      enterTailAttachMode(fromId, text);
    };
    anchorCtxDelAll.onclick = () => {
      hideAnchorCtx();
      const toRemove = S.links.filter(l => l.fromId === fromId && l.text === text).map(l => l.id);
      if (toRemove.length === 0) return;
      pushUndo();
      S.links = S.links.filter(l => !(l.fromId === fromId && l.text === text));
      const fn = S.nodes.find(n => n.id === fromId);
      if (fn) renderNode(fn);
      renderLinks();
      scheduleSave();
    };

    positionCtxMenu(anchorCtx, x, y);
  }

  function hideAnchorCtx() {
    anchorCtx.style.display = 'none';
  }

  // Tail-anchor context menu (right-click on tail-anchor span)
  function showTailAnchorCtx(bubbleId, x, y) {
    tailAnchorCtxDetach.onclick = () => {
      hideTailAnchorCtx();
      const bubble = S.nodes.find(n => n.id === bubbleId && n.type === 'bubble');
      if (!bubble) return;
      pushUndo();
      const oldFromId = bubble.tailAnchorFromId;
      bubble.tailAnchorId = null; bubble.tailAnchorText = null; bubble.tailAnchorFromId = null;
      if (oldFromId != null) {
        const cn = S.nodes.find(n => n.id === oldFromId);
        if (cn) renderNode(cn);
      }
      renderBubbleTail(bubble);
      scheduleSave();
    };
    positionCtxMenu(tailAnchorCtx, x, y);
  }

  function hideTailAnchorCtx() {
    tailAnchorCtx.style.display = 'none';
  }

  // ═══════════════════════════════════════════════════════
  // EVENT LISTENERS (moved from module-level in original canvas.js)
  // ═══════════════════════════════════════════════════════
  document.addEventListener('mousedown', e => {
    if (!e.target.closest('#link-ctx')) hideLinkCtx();
  });
  document.addEventListener('mousedown', e => {
    if (!e.target.closest('#anchor-ctx')) hideAnchorCtx();
  });
  document.addEventListener('mousedown', e => {
    if (!e.target.closest('#tail-anchor-ctx')) hideTailAnchorCtx();
  });

  // Link preview (link-mode hover)
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
    let fp;
    if (ar) {
      fp = { x: ar.left + ar.width / 2, y: ar.top + ar.height / 2 };
    } else {
      const ep = edgePoint(fn, tn);
      fp = c2s(ep.x, ep.y);
    }
    const { point: tp, side } = targetEntryPoint(fp, tn);
    if (ar) fp = anchorFpFromSide(ar, side);
    const dx = tp.x - fp.x;
    const dy = tp.y - fp.y;
    const d = `M${fp.x},${fp.y} C${fp.x + dx * 0.45},${fp.y + dy * 0.1} ${tp.x - dx * 0.45},${tp.y - dy * 0.1} ${tp.x},${tp.y}`;

    linkPreviewEl.setAttribute('d', d);
    linkPreviewEl.setAttribute('marker-end', 'url(#arrow-preview)');
    linkPreviewEl.style.display = '';
  });

  // Returns the character offset of (startNode, startOffset) within the
  // pre element's code text, excluding .ln-num text nodes (line numbers).
  function getCodeTextOffset(pre, startNode, startOffset) {
    const walker = document.createTreeWalker(pre, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return node.parentElement?.closest('.ln-num')
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT;
      },
    });
    let total = 0;
    let lastCodeLine = null;
    let node;
    while ((node = walker.nextNode())) {
      // addLineNumbers strips \n from the DOM (each line becomes <span class="code-line">).
      // Re-add 1 per line boundary crossed so the offset matches codeNode.code.
      const codeLine = node.parentElement?.closest('.code-line');
      if (codeLine && codeLine !== lastCodeLine && lastCodeLine !== null) {
        total += 1;
      }
      lastCodeLine = codeLine;
      if (node === startNode) return total + startOffset;
      total += node.textContent.length;
    }
    return -1;
  }

  // Returns the 0-based occurrence index of text in code at charOffset,
  // using the same word-boundary matching as injectAnchor.
  function getOccurrenceIdx(code, text, charOffset) {
    const pat = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefix = /\w/.test(text[0])                  ? '\\b' : '';
    const suffix = /\w/.test(text[text.length - 1])    ? '\\b' : '';
    const re = new RegExp(prefix + pat + suffix, 'g');
    let idx = 0;
    let m;
    while ((m = re.exec(code)) !== null) {
      if (charOffset >= m.index && charOffset < m.index + text.length) return idx;
      idx++;
    }
    return 0;
  }

  // Text selection → link tip popup
  document.addEventListener('mouseup', e => {
    if (S.linkMode || S.tailAttachMode) return;

    const sel  = window.getSelection();
    const text = sel?.toString().trim();
    if (!text) { linkTip.style.display = 'none'; return; }

    // Find ancestor .node (use commonAncestorContainer to avoid direction-dependent anchorNode)
    const container = sel.getRangeAt(0).commonAncestorContainer;
    let el = container.nodeType === Node.TEXT_NODE ? container.parentElement : container;
    while (el && !el.classList?.contains('node')) el = el.parentElement;
    if (!el) { linkTip.style.display = 'none'; return; }

    const fromId = +el.id.replace('nd-', '');

    // Selection inside the textarea of the node being edited → skip
    if (S.editing === fromId) { linkTip.style.display = 'none'; return; }
    const range  = sel.getRangeAt(0);
    const rect   = range.getBoundingClientRect();

    // Determine which occurrence of the selected text was actually selected
    let anchorMatchIdx = -1;
    if (range.startContainer.nodeType === Node.TEXT_NODE) {
      const pre = el.querySelector('.node-body pre');
      const codeNode = S.nodes.find(n => n.id === fromId);
      if (pre && codeNode?.code != null) {
        const charOffset = getCodeTextOffset(pre, range.startContainer, range.startOffset);
        if (charOffset >= 0) anchorMatchIdx = getOccurrenceIdx(codeNode.code, text, charOffset);
      }
    }

    const tipHeight = 80; // approximate height of two-button tip
    linkTip.style.display = 'block';
    linkTip.style.left    = (rect.left + rect.width / 2) + 'px';
    linkTip.style.top     = Math.max(8, rect.top - tipHeight - 8) + 'px';

    const anchorRect = { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };

    linkTipLink.onclick = () => {
      sel.removeAllRanges();
      linkTip.style.display = 'none';
      enterLinkMode(fromId, text, anchorRect, anchorMatchIdx);
    };

    linkTipNewBlock.onclick = () => {
      sel.removeAllRanges();
      linkTip.style.display = 'none';
      const fn = S.nodes.find(n => n.id === fromId);
      const nx = fn ? fn.x + fn.w + 60 : 100;
      const ny = s2c(anchorRect.left + anchorRect.width / 2, anchorRect.top + anchorRect.height / 2).y;
      const newNode = addNode(nx, ny);
      newNode.pendingKeyword = text;
      createLink(fromId, text, newNode.id, anchorMatchIdx);
      renderLinks();
      selectNode(newNode.id);
      startEdit(newNode.id);
    };

    linkTipAttachTail.style.display = '';
    linkTipAttachTail.onclick = () => {
      sel.removeAllRanges();
      linkTip.style.display = 'none';
      enterTailAttachMode(fromId, text);
    };
  });

  // Hide tooltip on outside click (but not when starting a text selection in code)
  document.addEventListener('mousedown', e => {
    if (e.target.closest('#link-tip')) return;
    if (e.target.closest('.node-body')) return;
    linkTip.style.display = 'none';
    window.getSelection()?.removeAllRanges();
  });

  return {
    renderLinks, createLink, removeLink,
    targetEntryPoint,
    enterLinkMode, exitLinkMode,
    enterTailAttachMode: enterTailAttachModeLocal, exitTailAttachMode,
    showAnchorCtx, hideAnchorCtx,
    showTailAnchorCtx, hideTailAnchorCtx,
  };
}
