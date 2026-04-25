import { svgE, LINK_COLORS, LINK_WIDTHS, LINK_DASHES } from './canvas-utils.js';

export function initFreeLines(deps) {
  const { S, c2s,
    pushUndo, scheduleSave, setStatus,
    selectNode, renderLinks,
  } = deps;

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
      const isSelected = S.selLine === line.id || S.multiSelLines.has(line.id);
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

      // Hit path for whole-line drag
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

      // Point handles rendered on top
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
    if (S.sel !== null) {
      const selEl = document.getElementById('nd-' + S.sel);
      if (selEl) selEl.classList.remove('selected');
      S.sel = null;
    }
    S.multiSel.forEach(nid => {
      const nEl = document.getElementById('nd-' + nid);
      if (nEl) nEl.classList.remove('multi-selected');
    });
    S.multiSel.clear();
    S.multiSelLines.clear();
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
    S.multiSelLines.delete(id);
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

  // Hide line context menu on outside click
  document.addEventListener('mousedown', e => {
    if (!e.target.closest('#line-ctx')) hideLineCtx();
  });

  return {
    renderFreeLines, addFreeLine, removeFreeLine,
    selectFreeLine,
    enterLineDrawMode, exitLineDrawMode, finishDrawingLine,
    showLineCtx, hideLineCtx,
  };
}
