import { svgE, LINK_COLORS, LINK_WIDTHS, LINK_DASHES, edgePoint, anchorFpFromSide } from './canvas-utils.js';

export function initLinks(deps) {
  const { S, wrap, svgLinks,
    linkTip, linkTipLink, linkTipNewBlock, linkTipAttachTail,
    linkCtx, linkCtxDel, linkCtxColors, linkCtxWidths, linkCtxDashes,
    anchorCtx, anchorCtxLink, anchorCtxNewBlock, anchorCtxDelAll,
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

  // End point of arrow: defaults to upper-left area of target node,
  // adjusts based on where the start point (fp) is relative to the target.
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

  function renderLinks() {
    svgLinks.querySelectorAll('.lk').forEach(e => e.remove());
    for (const lnk of S.links) {
      const fn = S.nodes.find(n => n.id === lnk.fromId);
      const tn = S.nodes.find(n => n.id === lnk.toId);
      if (!fn || !tn) continue;

      // Start point: anchor element position if available, else node edge.
      // Prefer the span marked data-lid-primary (the selected occurrence);
      // fall back to the first span for this link, then to a sibling link's span.
      let anchorEl = document.querySelector(`.link-anchor[data-lid="${lnk.id}"][data-lid-primary]`)
                  || document.querySelector(`.link-anchor[data-lid="${lnk.id}"]`);
      if (!anchorEl) {
        const sibling = S.links.find(l => l.fromId === lnk.fromId && l.text === lnk.text && l.id !== lnk.id);
        if (sibling) anchorEl = document.querySelector(`.link-anchor[data-lid="${sibling.id}"]`);
      }
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
    setStatus('Ready — double-click to add block | select text to create link | right-click link to delete');
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
    setStatus('Ready — double-click to add block | select text to create link | right-click link to delete');
  }

  // ═══════════════════════════════════════════════════════
  // LINK CONTEXT MENU
  // ═══════════════════════════════════════════════════════
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

    // Color swatches
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
        // Refresh width/dash svgs with new color
        showLinkCtx(linkId, x, y);
      });
      linkCtxColors.appendChild(sw);
    }

    // Width buttons
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

    // Dash buttons
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

    // Delete
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

    anchorCtx.style.display = 'block';
    const cw = anchorCtx.offsetWidth || 220;
    const ch = anchorCtx.offsetHeight || 70;
    anchorCtx.style.left = Math.min(x, window.innerWidth  - cw - 8) + 'px';
    anchorCtx.style.top  = Math.min(y, window.innerHeight - ch - 8) + 'px';
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
    tailAnchorCtx.style.display = 'block';
    const cw = tailAnchorCtx.offsetWidth || 200;
    const ch = tailAnchorCtx.offsetHeight || 40;
    tailAnchorCtx.style.left = Math.min(x, window.innerWidth  - cw - 8) + 'px';
    tailAnchorCtx.style.top  = Math.min(y, window.innerHeight - ch - 8) + 'px';
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
    let node;
    while ((node = walker.nextNode())) {
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
