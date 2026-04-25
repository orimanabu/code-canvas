import { esc, NODE_COLORS, TEXT_COLORS, FONT_PRESETS, FONT_SIZES, langFromPath,
         injectAnchor, injectTailAnchor, addLineNumbers } from './canvas-utils.js';

// hljs is a browser global (loaded from CDN script tag in canvas.html)

export function initNodeRendering(deps) {
  const { S, canvas, ndEl, s2c,
    pushUndo, scheduleSave, setStatus,
    startEdit, stopEdit, autoFitNode, selectNode,
    toggleMultiSel, clearMultiSel, removeNode,
    renderLinks, renderBubbleTail, renderAnchoredBubbleTails,
    createLink, jumpTo, showAnchorCtx, showTailAnchorCtx, removeLink, attachTailToText,
    openFetchDialog, openCodeSnippetdDialog,
  } = deps;

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
    // This prevents a shorter substring from being wrapped before a longer
    // string that contains it.
    const nodeLinks = S.links.filter(l => l.fromId === nodeId)
                              .sort((a, b) => b.text.length - a.text.length);
    for (const lnk of nodeLinks) {
      html = injectAnchor(html, lnk.text, lnk.id, lnk.anchorMatchIdx ?? -1);
    }
    const tailBubbles = S.nodes
      .filter(nb => nb.type === 'bubble' && nb.tailAnchorFromId === nodeId && nb.tailAnchorText)
      .sort((a, b) => b.tailAnchorText.length - a.tailAnchorText.length);
    for (const tb of tailBubbles) {
      html = injectTailAnchor(html, tb.tailAnchorText, tb.tailAnchorId);
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
    if (n.type === 'text') {
      const c = TEXT_COLORS.find(c => c.id === (n.textColor ?? 'white')) ?? TEXT_COLORS[0];
      el.style.setProperty('--tn-color', c.hex);
      el.style.setProperty('--tn-glow',  c.hex + '33');
    } else if (n.type === 'bubble') {
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
  // FONT HELPERS
  // ═══════════════════════════════════════════════════════
  const DEFAULT_FONT_FAMILY = {
    code:   "ui-monospace, 'SF Mono', 'Cascadia Code', 'Menlo', monospace",
    bubble: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    frame:  "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    text:   "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  };

  function applyNodeFont(n, el) {
    const type = n.type === 'bubble' ? 'bubble' : n.type === 'frame' ? 'frame' : n.type === 'text' ? 'text' : 'code';
    const fid = n.fontFamily ?? 'default';
    const family = fid === 'default'
      ? DEFAULT_FONT_FAMILY[type]
      : (FONT_PRESETS.find(p => p.id === fid)?.family ?? DEFAULT_FONT_FAMILY[type]);
    if (type === 'code') {
      el.style.setProperty('--node-font-family', family);
      el.style.setProperty('--node-font-size',   (n.fontSize ?? 12.5) + 'px');
    } else if (type === 'bubble') {
      el.style.setProperty('--bubble-font-family', family);
      el.style.setProperty('--bubble-font-size',   (n.fontSize ?? 13) + 'px');
    } else if (type === 'text') {
      el.style.setProperty('--text-font-family', family);
      el.style.setProperty('--text-font-size',   (n.fontSize ?? 20) + 'px');
    } else {
      el.style.setProperty('--frame-font-family', family);
      el.style.setProperty('--frame-font-size',   (n.fontSize ?? 12) + 'px');
    }
  }

  function fontControlsHTML(n) {
    const type = n.type === 'bubble' ? 'bubble' : n.type === 'frame' ? 'frame' : n.type === 'text' ? 'text' : 'code';
    const currentFamily = n.fontFamily ?? 'default';
    const currentSize   = n.fontSize  ?? (type === 'code' ? 12.5 : type === 'bubble' ? 13 : type === 'text' ? 20 : 12);
    const monoOpts = FONT_PRESETS.filter(p => p.mono).map(p =>
      `<option value="${p.id}"${p.id === currentFamily ? ' selected' : ''}>${p.label}</option>`
    ).join('');
    const propOpts = FONT_PRESETS.filter(p => !p.mono).map(p =>
      `<option value="${p.id}"${p.id === currentFamily ? ' selected' : ''}>${p.label}</option>`
    ).join('');
    const familyOpts =
      `<option value="default"${currentFamily === 'default' ? ' selected' : ''}>Default</option>` +
      `<optgroup label="Monospace">${monoOpts}</optgroup>` +
      `<optgroup label="Proportional">${propOpts}</optgroup>`;
    const dlId = `font-size-dl-${n.id}`;
    const sizeOpts = FONT_SIZES[type].map(s => `<option value="${s}">`).join('');
    return `<div class="font-controls">
      <select class="sel-font-family" title="Font family">${familyOpts}</select>
      <input class="inp-font-size" type="number" title="Font size (px)"
             value="${currentSize}" min="6" max="500" step="0.5"
             list="${dlId}">
      <datalist id="${dlId}">${sizeOpts}</datalist>
    </div>`;
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
    renderLinks();
    scheduleSave();
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

  // ═══════════════════════════════════════════════════════
  // NODE HTML BUILDERS
  // ═══════════════════════════════════════════════════════
  function defaultCode() {
    return `// New code block\nfunction greet(name) {\n  return \`Hello, \${name}!\`;\n}\n\nconsole.log(greet('World'));`;
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
            ${fontControlsHTML(n)}
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

  // ═══════════════════════════════════════════════════════
  // BUBBLE CONTENT
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
            ${fontControlsHTML(n)}
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
      el.querySelector('.sel-font-family').addEventListener('mousedown', e => e.stopPropagation());
      el.querySelector('.sel-font-family').addEventListener('change', e => {
        e.stopPropagation();
        n.fontFamily = e.target.value;
        applyNodeFont(n, el);
        scheduleSave();
      });
      el.querySelector('.inp-font-size').addEventListener('mousedown', e => e.stopPropagation());
      el.querySelector('.inp-font-size').addEventListener('change', e => {
        e.stopPropagation();
        const v = parseFloat(e.target.value);
        if (!isNaN(v) && v >= 6 && v <= 500) {
          n.fontSize = v;
          applyNodeFont(n, el);
          scheduleSave();
        } else {
          e.target.value = n.fontSize ?? (n.type === 'bubble' ? 13 : n.type === 'frame' ? 12 : 12.5);
        }
      });
      ta.focus({ preventScroll: true });
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

  // ═══════════════════════════════════════════════════════
  // TEXT NODE CONTENT
  // ═══════════════════════════════════════════════════════
  function textColorSwatchesHTML(n) {
    const active = n.textColor ?? 'white';
    return `<div class="color-swatches">${
      TEXT_COLORS.map(c =>
        `<span class="color-swatch${c.id === active ? ' active' : ''}" data-textcolor="${c.id}" style="background:${c.hex}" title="${c.label}"></span>`
      ).join('')
    }</div>`;
  }

  function textViewHTML(n) {
    const body = n.text
      ? `<div class="text-content">${esc(n.text).replace(/\n/g, '<br>')}</div>`
      : `<div class="text-content text-content-empty">Text…</div>`;
    return `
    <div class="text-node-header">
      <div class="node-actions">
        <button class="node-btn btn-edit">Edit</button>
        <button class="node-btn danger btn-del">✕</button>
      </div>
    </div>
    <div class="text-body">${body}</div>
    <div class="resize-handle"></div>`;
  }

  function textEditHTML(n) {
    return `
    <div class="text-node-header">
      <div class="node-actions" style="opacity:1">
        <div class="edit-menu-wrap">
          <button class="node-btn btn-edit-menu" title="More options">•••</button>
          <div class="edit-menu">
            <div class="edit-menu-section-label">Text Color</div>
            ${textColorSwatchesHTML(n)}
            ${fontControlsHTML(n)}
            ${zOrderMenuHTML()}
          </div>
        </div>
        <button class="node-btn btn-done">✓ Done</button>
        <button class="node-btn danger btn-del">Delete</button>
      </div>
    </div>
    <div class="text-body">
      <textarea class="text-textarea" spellcheck="false">${esc(n.text ?? '')}</textarea>
    </div>
    <div class="resize-handle"></div>`;
  }

  function renderTextContent(n, el) {
    el.classList.toggle('is-editing', S.editing === n.id);
    if (S.editing === n.id) {
      el.innerHTML = textEditHTML(n);
      const ta = el.querySelector('textarea');
      ta.style.height = '100%';
      ta.addEventListener('input', () => { n.text = ta.value; });
      el.querySelector('.btn-done').addEventListener('click', e => { e.stopPropagation(); stopEdit(); });
      el.querySelector('.btn-del').addEventListener('click', e => { e.stopPropagation(); removeNode(n.id); });
      el.querySelectorAll('[data-textcolor]').forEach(sw => {
        sw.addEventListener('mousedown', e => e.stopPropagation());
        sw.addEventListener('click', e => {
          e.stopPropagation();
          n.textColor = sw.dataset.textcolor;
          applyNodeColor(n, el);
          el.querySelectorAll('[data-textcolor]').forEach(s =>
            s.classList.toggle('active', s.dataset.textcolor === n.textColor));
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
      el.querySelector('.sel-font-family').addEventListener('mousedown', e => e.stopPropagation());
      el.querySelector('.sel-font-family').addEventListener('change', e => {
        e.stopPropagation();
        n.fontFamily = e.target.value;
        applyNodeFont(n, el);
        scheduleSave();
      });
      el.querySelector('.inp-font-size').addEventListener('mousedown', e => e.stopPropagation());
      el.querySelector('.inp-font-size').addEventListener('change', e => {
        e.stopPropagation();
        const v = parseFloat(e.target.value);
        if (!isNaN(v) && v >= 6 && v <= 500) {
          n.fontSize = v;
          applyNodeFont(n, el);
          scheduleSave();
        } else {
          e.target.value = n.fontSize ?? 20;
        }
      });
      ta.focus({ preventScroll: true });
    } else {
      el.innerHTML = textViewHTML(n);
      el.querySelector('.btn-edit').addEventListener('click', e => { e.stopPropagation(); startEdit(n.id); });
      el.querySelector('.btn-del').addEventListener('click', e => { e.stopPropagation(); removeNode(n.id); });
      el.querySelector('.text-body').addEventListener('dblclick', e => { e.stopPropagation(); startEdit(n.id); });
    }
  }

  // ═══════════════════════════════════════════════════════
  // FRAME CONTENT
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
              ${fontControlsHTML(n)}
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
      el.querySelector('.sel-font-family').addEventListener('mousedown', e => e.stopPropagation());
      el.querySelector('.sel-font-family').addEventListener('change', e => {
        e.stopPropagation();
        n.fontFamily = e.target.value;
        applyNodeFont(n, el);
        scheduleSave();
      });
      el.querySelector('.inp-font-size').addEventListener('mousedown', e => e.stopPropagation());
      el.querySelector('.inp-font-size').addEventListener('change', e => {
        e.stopPropagation();
        const v = parseFloat(e.target.value);
        if (!isNaN(v) && v >= 6 && v <= 500) {
          n.fontSize = v;
          applyNodeFont(n, el);
          scheduleSave();
        } else {
          e.target.value = n.fontSize ?? (n.type === 'bubble' ? 13 : n.type === 'frame' ? 12 : 12.5);
        }
      });
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

  // ═══════════════════════════════════════════════════════
  // RESIZE
  // ═══════════════════════════════════════════════════════
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
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════
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
    applyNodeFont(n, el);

    if (n.type === 'frame') {
      renderFrameContent(n, el);
    } else if (n.type === 'text') {
      renderTextContent(n, el);
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

      // Edit menu toggle
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
          e.stopPropagation(); menuWrap.classList.remove('open');
          const kw = n.pendingKeyword;
          n.pendingKeyword = undefined;
          openCodeSnippetdDialog(n.id, kw);
        });
      }
      bindZOrderButtons(n, el);

      el.querySelector('.sel-font-family').addEventListener('mousedown', e => e.stopPropagation());
      el.querySelector('.sel-font-family').addEventListener('change', e => {
        e.stopPropagation();
        n.fontFamily = e.target.value;
        applyNodeFont(n, el);
        scheduleSave();
      });
      el.querySelector('.inp-font-size').addEventListener('mousedown', e => e.stopPropagation());
      el.querySelector('.inp-font-size').addEventListener('change', e => {
        e.stopPropagation();
        const v = parseFloat(e.target.value);
        if (!isNaN(v) && v >= 6 && v <= 500) {
          n.fontSize = v;
          applyNodeFont(n, el);
          scheduleSave();
        } else {
          e.target.value = n.fontSize ?? (n.type === 'bubble' ? 13 : n.type === 'frame' ? 12 : 12.5);
        }
      });

      ta.focus({ preventScroll: true });
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
      el.querySelectorAll('.tail-anchor').forEach(a => {
        a.addEventListener('contextmenu', e => {
          e.preventDefault();
          e.stopPropagation();
          const taid = +a.dataset.taid;
          const bubble = S.nodes.find(nb => nb.type === 'bubble' && nb.tailAnchorId === taid);
          if (!bubble) return;
          showTailAnchorCtx(bubble.id, e.clientX, e.clientY);
        });
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
        a.addEventListener('contextmenu', e => {
          e.preventDefault();
          e.stopPropagation();
          const lnk = S.links.find(l => l.id === +a.dataset.lid);
          if (!lnk) return;
          showAnchorCtx(lnk.fromId, lnk.text, a, e.clientX, e.clientY);
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

  return { renderNode };
}
