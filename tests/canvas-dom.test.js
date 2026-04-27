// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import '../canvas.js';
const {
  S, STORAGE_KEY, addNode, removeNode, selectNode, addBubble, addFrame, addText, loadState,
  saveState, restoreFromStorage,
  createLink, toggleMultiSel,
  copyNodes, cutNodes, pasteNodes,
  addFreeLine, removeFreeLine,
  pushUndo, undo,
  startEdit, stopEdit,
  s2c, zoom,
} = globalThis.__canvasApp;

// Reset canvas state and DOM before each test
function resetState() {
  loadState({ nodes: [], links: [], nid: 1, lid: 1 });
}

beforeEach(() => {
  resetState();
});

// ─── addNode ───────────────────────────────────────────
describe('addNode', () => {
  it('adds an entry to S.nodes', () => {
    expect(S.nodes).toHaveLength(0);
    addNode(100, 200, '// hello');
    expect(S.nodes).toHaveLength(1);
  });

  it('stores correct position and code', () => {
    addNode(50, 80, 'const x = 1;');
    const n = S.nodes[0];
    expect(n.x).toBe(50);
    expect(n.y).toBe(80);
    expect(n.code).toBe('const x = 1;');
  });

  it('renders a div.node element in #canvas', () => {
    const n = addNode(0, 0);
    const el = document.getElementById('nd-' + n.id);
    expect(el).not.toBeNull();
    expect(el.classList.contains('node')).toBe(true);
  });

  it('positions the element via inline style', () => {
    const n = addNode(123, 456);
    const el = document.getElementById('nd-' + n.id);
    expect(el.style.left).toBe('123px');
    expect(el.style.top).toBe('456px');
  });

  it('assigns a unique id to each node', () => {
    const a = addNode(0, 0);
    const b = addNode(10, 10);
    expect(a.id).not.toBe(b.id);
    expect(document.getElementById('nd-' + a.id)).not.toBeNull();
    expect(document.getElementById('nd-' + b.id)).not.toBeNull();
  });
});

// ─── removeNode ────────────────────────────────────────
describe('removeNode', () => {
  it('removes the node from S.nodes', () => {
    const n = addNode(0, 0);
    expect(S.nodes).toHaveLength(1);
    removeNode(n.id);
    expect(S.nodes).toHaveLength(0);
  });

  it('removes the DOM element', () => {
    const n = addNode(0, 0);
    expect(document.getElementById('nd-' + n.id)).not.toBeNull();
    removeNode(n.id);
    expect(document.getElementById('nd-' + n.id)).toBeNull();
  });

  it('only removes the target node when multiple nodes exist', () => {
    const a = addNode(0, 0);
    const b = addNode(10, 10);
    removeNode(a.id);
    expect(S.nodes).toHaveLength(1);
    expect(S.nodes[0].id).toBe(b.id);
    expect(document.getElementById('nd-' + b.id)).not.toBeNull();
  });

  it('does nothing for an unknown id', () => {
    addNode(0, 0);
    expect(() => removeNode(9999)).not.toThrow();
    expect(S.nodes).toHaveLength(1);
  });
});

// ─── selectNode ────────────────────────────────────────
describe('selectNode', () => {
  it('adds the "selected" CSS class to the node element', () => {
    const n = addNode(0, 0);
    selectNode(n.id);
    const el = document.getElementById('nd-' + n.id);
    expect(el.classList.contains('selected')).toBe(true);
  });

  it('stores the selected id in S.sel', () => {
    const n = addNode(0, 0);
    selectNode(n.id);
    expect(S.sel).toBe(n.id);
  });

  it('deselects the previous node when a new one is selected', () => {
    const a = addNode(0, 0);
    const b = addNode(10, 10);
    selectNode(a.id);
    selectNode(b.id);
    expect(document.getElementById('nd-' + a.id).classList.contains('selected')).toBe(false);
    expect(document.getElementById('nd-' + b.id).classList.contains('selected')).toBe(true);
    expect(S.sel).toBe(b.id);
  });
});

// ─── addBubble ─────────────────────────────────────────
describe('addBubble', () => {
  it('adds a bubble entry to S.nodes with type "bubble"', () => {
    addBubble(50, 60);
    expect(S.nodes).toHaveLength(1);
    expect(S.nodes[0].type).toBe('bubble');
  });

  it('stores correct position', () => {
    addBubble(30, 40);
    expect(S.nodes[0].x).toBe(30);
    expect(S.nodes[0].y).toBe(40);
  });

  it('renders a DOM element with the bubble-node class', () => {
    const n = addBubble(0, 0);
    const el = document.getElementById('nd-' + n.id);
    expect(el).not.toBeNull();
    expect(el.classList.contains('bubble-node')).toBe(true);
  });

  it('defaults showTail to true', () => {
    const n = addBubble(0, 0);
    expect(n.showTail).toBe(true);
  });

  it('initializes tailAnchorMatchIdx to -1', () => {
    const n = addBubble(0, 0);
    expect(n.tailAnchorMatchIdx).toBe(-1);
  });

  it('initializes tailAnchorId, tailAnchorText, tailAnchorFromId to null', () => {
    const n = addBubble(0, 0);
    expect(n.tailAnchorId).toBeNull();
    expect(n.tailAnchorText).toBeNull();
    expect(n.tailAnchorFromId).toBeNull();
  });
});

// ─── loadState ─────────────────────────────────────────
describe('loadState', () => {
  it('restores nodes from saved state data', () => {
    const data = {
      nodes: [
        { id: 10, x: 100, y: 200, w: 400, h: 300, code: 'let x = 1;', lang: 'javascript',
          title: 'Test', filePath: 'test.js', showLineNumbers: true, lineNumberStart: 1 },
      ],
      links: [],
      nid: 11,
      lid: 1,
    };
    loadState(data);
    expect(S.nodes).toHaveLength(1);
    expect(S.nodes[0].id).toBe(10);
    expect(S.nodes[0].code).toBe('let x = 1;');
  });

  it('renders DOM elements for restored nodes', () => {
    loadState({
      nodes: [
        { id: 5, x: 0, y: 0, w: 400, h: 300, code: '// hi', lang: 'javascript',
          title: '', filePath: '', showLineNumbers: true, lineNumberStart: 1 },
      ],
      links: [],
      nid: 6,
      lid: 1,
    });
    expect(document.getElementById('nd-5')).not.toBeNull();
  });

  it('clears existing nodes when loading new state', () => {
    addNode(0, 0);
    addNode(10, 10);
    expect(S.nodes).toHaveLength(2);

    loadState({ nodes: [], links: [] });
    expect(S.nodes).toHaveLength(0);
    // Verify DOM is also cleared
    expect(document.querySelectorAll('#canvas .node').length).toBe(0);
  });

  it('restores bubble nodes correctly', () => {
    loadState({
      nodes: [
        { id: 20, type: 'bubble', x: 50, y: 50, w: 200, h: 80,
          text: 'hello', tailX: 150, tailY: 150 },
      ],
      links: [],
      nid: 21,
      lid: 1,
    });
    expect(S.nodes[0].type).toBe('bubble');
    expect(S.nodes[0].text).toBe('hello');
    const el = document.getElementById('nd-20');
    expect(el).not.toBeNull();
    expect(el.classList.contains('bubble-node')).toBe(true);
  });

  it('restores showTail field for bubble nodes', () => {
    loadState({
      nodes: [
        { id: 21, type: 'bubble', x: 0, y: 0, w: 200, h: 80,
          text: 'no tail', tailX: 50, tailY: 50, showTail: false },
      ],
      links: [],
      nid: 22,
      lid: 1,
    });
    expect(S.nodes[0].showTail).toBe(false);
  });
});

// ─── toggleMultiSel ────────────────────────────────────
describe('toggleMultiSel', () => {
  it('adds the node id to S.multiSel', () => {
    const n = addNode(0, 0);
    toggleMultiSel(n.id);
    expect(S.multiSel.has(n.id)).toBe(true);
  });

  it('removes the node id when toggled a second time', () => {
    const n = addNode(0, 0);
    toggleMultiSel(n.id);
    toggleMultiSel(n.id);
    expect(S.multiSel.has(n.id)).toBe(false);
  });

  it('applies "multi-selected" CSS class when toggled on', () => {
    const n = addNode(0, 0);
    toggleMultiSel(n.id);
    expect(document.getElementById('nd-' + n.id).classList.contains('multi-selected')).toBe(true);
  });

  it('removes "multi-selected" CSS class when toggled off', () => {
    const n = addNode(0, 0);
    toggleMultiSel(n.id);
    toggleMultiSel(n.id);
    expect(document.getElementById('nd-' + n.id).classList.contains('multi-selected')).toBe(false);
  });

  it('can multi-select multiple nodes independently', () => {
    const a = addNode(0, 0);
    const b = addNode(10, 10);
    toggleMultiSel(a.id);
    toggleMultiSel(b.id);
    expect(S.multiSel.has(a.id)).toBe(true);
    expect(S.multiSel.has(b.id)).toBe(true);
  });
});

// ─── pushUndo / undo ───────────────────────────────────
describe('pushUndo / undo', () => {
  beforeEach(() => {
    // loadState (called by the outer beforeEach) does not clear undoStack
    S.undoStack = [];
  });

  it('pushUndo adds a snapshot to the undo stack', () => {
    expect(S.undoStack).toHaveLength(0);
    pushUndo();
    expect(S.undoStack).toHaveLength(1);
  });

  it('undo rolls back the most recent node addition', () => {
    // addNode internally calls pushUndo before adding the node
    addNode(0, 0, '// hello');
    expect(S.nodes).toHaveLength(1);
    undo();
    expect(S.nodes).toHaveLength(0);
  });

  it('undo rolls back one step at a time', () => {
    addNode(0, 0, '// first');
    addNode(100, 0, '// second');
    expect(S.nodes).toHaveLength(2);
    undo();
    expect(S.nodes).toHaveLength(1);
    expect(S.nodes[0].code).toBe('// first');
  });

  it('undo does not throw when the stack is empty', () => {
    expect(S.undoStack).toHaveLength(0);
    expect(() => undo()).not.toThrow();
    expect(S.nodes).toHaveLength(0);
  });

  it('undo stack is capped at 10 entries', () => {
    for (let i = 0; i < 12; i++) pushUndo();
    expect(S.undoStack).toHaveLength(10);
  });

  it('undo restores links along with nodes', () => {
    const a = addNode(0, 0);
    const b = addNode(500, 0);
    createLink(a.id, 'fn', b.id); // internally calls pushUndo before adding link
    expect(S.links).toHaveLength(1);
    undo(); // restores snapshot taken before the link was added
    expect(S.links).toHaveLength(0);
    expect(S.nodes).toHaveLength(2);
  });
});

// ─── addFreeLine / removeFreeLine ──────────────────────
describe('addFreeLine / removeFreeLine', () => {
  beforeEach(() => {
    S.freeLines = [];
    S.flid = 1;
    S.undoStack = [];
  });

  it('addFreeLine adds an entry to S.freeLines', () => {
    addFreeLine([{ x: 0, y: 0 }, { x: 100, y: 100 }]);
    expect(S.freeLines).toHaveLength(1);
  });

  it('addFreeLine stores the provided points', () => {
    const pts = [{ x: 10, y: 20 }, { x: 30, y: 40 }];
    addFreeLine(pts);
    expect(S.freeLines[0].points).toEqual(pts);
  });

  it('addFreeLine assigns unique ids to each line', () => {
    addFreeLine([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
    addFreeLine([{ x: 2, y: 2 }, { x: 3, y: 3 }]);
    expect(S.freeLines[0].id).not.toBe(S.freeLines[1].id);
  });

  it('removeFreeLine removes the entry from S.freeLines', () => {
    const line = addFreeLine([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    removeFreeLine(line.id);
    expect(S.freeLines).toHaveLength(0);
  });

  it('removeFreeLine with an unknown id does not throw', () => {
    addFreeLine([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    expect(() => removeFreeLine(9999)).not.toThrow();
    expect(S.freeLines).toHaveLength(1);
  });
});

// ─── addText ───────────────────────────────────────────
describe('addText', () => {
  it('adds a text entry to S.nodes with type "text"', () => {
    addText(50, 60);
    expect(S.nodes).toHaveLength(1);
    expect(S.nodes[0].type).toBe('text');
  });

  it('stores correct position', () => {
    addText(30, 40);
    expect(S.nodes[0].x).toBe(30);
    expect(S.nodes[0].y).toBe(40);
  });

  it('renders a DOM element with the text-node class', () => {
    const n = addText(0, 0);
    const el = document.getElementById('nd-' + n.id);
    expect(el).not.toBeNull();
    expect(el.classList.contains('text-node')).toBe(true);
  });

  it('defaults textColor to "white"', () => {
    const n = addText(0, 0);
    expect(n.textColor).toBe('white');
  });

  it('defaults fontSize to 20', () => {
    const n = addText(0, 0);
    expect(n.fontSize).toBe(20);
  });

  it('defaults fontFamily to "default"', () => {
    const n = addText(0, 0);
    expect(n.fontFamily).toBe('default');
  });

  it('defaults text to empty string', () => {
    const n = addText(0, 0);
    expect(n.text).toBe('');
  });

  it('assigns default dimensions (200 x 80)', () => {
    const n = addText(0, 0);
    expect(n.w).toBe(200);
    expect(n.h).toBe(80);
  });
});

// ─── addFrame ──────────────────────────────────────────
describe('addFrame', () => {
  it('adds a frame entry to S.nodes with type "frame"', () => {
    addFrame(0, 0, 400, 300);
    expect(S.nodes).toHaveLength(1);
    expect(S.nodes[0].type).toBe('frame');
  });

  it('stores the correct position, dimensions, and label', () => {
    addFrame(50, 80, 600, 400, 'My Group');
    const n = S.nodes[0];
    expect(n.x).toBe(50);
    expect(n.y).toBe(80);
    expect(n.w).toBe(600);
    expect(n.h).toBe(400);
    expect(n.label).toBe('My Group');
  });

  it('renders a DOM element with the frame-node class', () => {
    const n = addFrame(0, 0, 400, 300);
    const el = document.getElementById('nd-' + n.id);
    expect(el).not.toBeNull();
    expect(el.classList.contains('frame-node')).toBe(true);
  });

  it('frame node survives a save/restore round-trip', () => {
    addFrame(10, 20, 500, 300, 'Group A', 'red');
    saveState();
    loadState({ nodes: [], links: [] });
    restoreFromStorage();
    expect(S.nodes).toHaveLength(1);
    const r = S.nodes[0];
    expect(r.type).toBe('frame');
    expect(r.label).toBe('Group A');
    expect(r.color).toBe('red');
    expect(document.getElementById('nd-' + r.id)).not.toBeNull();
  });
});

// ─── Viewport math (s2c / zoom) ────────────────────────
describe('Viewport math (s2c / zoom)', () => {
  beforeEach(() => {
    S.vp.x = 0;
    S.vp.y = 0;
    S.vp.scale = 1;
  });

  it('s2c returns identity mapping with default viewport', () => {
    const r = s2c(100, 200);
    expect(r.x).toBe(100);
    expect(r.y).toBe(200);
  });

  it('s2c accounts for pan offset', () => {
    S.vp.x = 50;
    S.vp.y = 80;
    const r = s2c(150, 180);
    expect(r.x).toBe(100); // (150-50)/1
    expect(r.y).toBe(100); // (180-80)/1
  });

  it('s2c accounts for zoom scale', () => {
    S.vp.scale = 2;
    const r = s2c(200, 400);
    expect(r.x).toBe(100); // 200/2
    expect(r.y).toBe(200); // 400/2
  });

  it('zoom doubles the scale when factor is 2', () => {
    zoom(2, 0, 0);
    expect(S.vp.scale).toBe(2);
  });

  it('zoom halves the scale when factor is 0.5', () => {
    zoom(0.5, 0, 0);
    expect(S.vp.scale).toBeCloseTo(0.5);
  });

  it('zoom clamps scale to the maximum (4x)', () => {
    zoom(100, 0, 0);
    expect(S.vp.scale).toBe(4);
  });

  it('zoom clamps scale to the minimum (0.08x)', () => {
    zoom(0.001, 0, 0);
    expect(S.vp.scale).toBeCloseTo(0.08);
  });
});

// ─── copyNodes / cutNodes / pasteNodes ─────────────────
describe('copyNodes / cutNodes / pasteNodes', () => {
  beforeEach(() => {
    // loadState (called by outer beforeEach) already clears S.clipboard and S.sel
    localStorage.removeItem('code-canvas-clipboard');
  });

  it('copyNodes stores items in S.clipboard', () => {
    const n = addNode(0, 0, 'hello');
    selectNode(n.id);
    copyNodes();
    expect(S.clipboard).toHaveLength(1);
    expect(S.clipboard[0]._clipType).toBe('node');
    expect(S.clipboard[0].code).toBe('hello');
  });

  it('copyNodes writes clipboard to localStorage', () => {
    const n = addNode(0, 0, 'hello');
    selectNode(n.id);
    copyNodes();
    const stored = JSON.parse(localStorage.getItem('code-canvas-clipboard'));
    expect(stored).toHaveLength(1);
    expect(stored[0].code).toBe('hello');
  });

  it('cutNodes removes the node and writes it to localStorage', () => {
    const n = addNode(0, 0, 'cut me');
    selectNode(n.id);
    cutNodes();
    expect(S.nodes).toHaveLength(0);
    const stored = JSON.parse(localStorage.getItem('code-canvas-clipboard'));
    expect(stored).toHaveLength(1);
    expect(stored[0].code).toBe('cut me');
  });

  it('pasteNodes creates a new node from S.clipboard', () => {
    const n = addNode(100, 200, 'paste me');
    selectNode(n.id);
    copyNodes();
    pasteNodes();
    expect(S.nodes).toHaveLength(2);
    const pasted = S.nodes.find(nn => nn.id !== n.id);
    expect(pasted.code).toBe('paste me');
  });

  it('pasteNodes offsets pasted node position by 30px', () => {
    const n = addNode(100, 200, 'pos test');
    selectNode(n.id);
    copyNodes();
    pasteNodes();
    const pasted = S.nodes.find(nn => nn.id !== n.id);
    expect(pasted.x).toBe(130);
    expect(pasted.y).toBe(230);
  });

  it('pasteNodes reads clipboard from localStorage (cross-tab simulation)', () => {
    // Simulate another tab having written to the shared clipboard key
    const crossTabClipboard = [{
      _clipType: 'node',
      id: 999, x: 50, y: 50, w: 400, h: 300,
      code: 'from other tab', lang: 'javascript',
      title: '', filePath: '',
      showLineNumbers: true, lineNumberStart: 1,
    }];
    localStorage.setItem('code-canvas-clipboard', JSON.stringify(crossTabClipboard));
    // S.clipboard is empty — simulates a freshly opened tab
    expect(S.clipboard).toHaveLength(0);

    pasteNodes();
    expect(S.nodes).toHaveLength(1);
    expect(S.nodes[0].code).toBe('from other tab');
  });

  it('pasteNodes falls back gracefully when localStorage entry is corrupt', () => {
    const n = addNode(0, 0, 'safe');
    selectNode(n.id);
    copyNodes(); // S.clipboard has one item
    localStorage.setItem('code-canvas-clipboard', 'not-valid-json');

    // Should not throw; S.clipboard unchanged, paste proceeds normally
    expect(() => pasteNodes()).not.toThrow();
    expect(S.nodes).toHaveLength(2);
  });

  it('pasted bubble resets tailAnchorMatchIdx to -1', () => {
    const b = addBubble(50, 50);
    b.tailAnchorMatchIdx = 2; // simulate an anchored tail
    selectNode(b.id);
    copyNodes();
    pasteNodes();
    const pasted = S.nodes.find(n => n.id !== b.id);
    expect(pasted.tailAnchorMatchIdx).toBe(-1);
  });
});

// ─── Font defaults ─────────────────────────────────────────
describe('Font defaults on new nodes', () => {
  it('addNode sets fontFamily to "default"', () => {
    const n = addNode(0, 0);
    expect(n.fontFamily).toBe('default');
  });

  it('addNode sets fontSize to 12.5', () => {
    const n = addNode(0, 0);
    expect(n.fontSize).toBe(12.5);
  });

  it('addBubble sets fontFamily to "default"', () => {
    const n = addBubble(0, 0);
    expect(n.fontFamily).toBe('default');
  });

  it('addBubble sets fontSize to 13', () => {
    const n = addBubble(0, 0);
    expect(n.fontSize).toBe(13);
  });

  it('addFrame sets fontFamily to "default"', () => {
    const n = addFrame(0, 0, 200, 100);
    expect(n.fontFamily).toBe('default');
  });

  it('addFrame sets fontSize to 12', () => {
    const n = addFrame(0, 0, 200, 100);
    expect(n.fontSize).toBe(12);
  });

  it('addText sets fontFamily to "default"', () => {
    const n = addText(0, 0);
    expect(n.fontFamily).toBe('default');
  });

  it('addText sets fontSize to 20', () => {
    const n = addText(0, 0);
    expect(n.fontSize).toBe(20);
  });
});

// ─── Font CSS custom properties ───────────────────────────
describe('Font CSS custom properties on node elements', () => {
  it('code node element has --node-font-size set', () => {
    const n = addNode(0, 0);
    const el = document.getElementById('nd-' + n.id);
    expect(el.style.getPropertyValue('--node-font-size')).toBe('12.5px');
  });

  it('code node element has --node-font-family set', () => {
    const n = addNode(0, 0);
    const el = document.getElementById('nd-' + n.id);
    expect(el.style.getPropertyValue('--node-font-family')).not.toBe('');
  });

  it('bubble node element has --bubble-font-size set', () => {
    const n = addBubble(0, 0);
    const el = document.getElementById('nd-' + n.id);
    expect(el.style.getPropertyValue('--bubble-font-size')).toBe('13px');
  });

  it('bubble node element has --bubble-font-family set', () => {
    const n = addBubble(0, 0);
    const el = document.getElementById('nd-' + n.id);
    expect(el.style.getPropertyValue('--bubble-font-family')).not.toBe('');
  });

  it('frame node element has --frame-font-size set', () => {
    const n = addFrame(0, 0, 200, 100);
    const el = document.getElementById('nd-' + n.id);
    expect(el.style.getPropertyValue('--frame-font-size')).toBe('12px');
  });

  it('frame node element has --frame-font-family set', () => {
    const n = addFrame(0, 0, 200, 100);
    const el = document.getElementById('nd-' + n.id);
    expect(el.style.getPropertyValue('--frame-font-family')).not.toBe('');
  });

  it('text node element has --text-font-size set', () => {
    const n = addText(0, 0);
    const el = document.getElementById('nd-' + n.id);
    expect(el.style.getPropertyValue('--text-font-size')).toBe('20px');
  });

  it('text node element has --text-font-family set', () => {
    const n = addText(0, 0);
    const el = document.getElementById('nd-' + n.id);
    expect(el.style.getPropertyValue('--text-font-family')).not.toBe('');
  });

  it('text node element has --tn-color set', () => {
    const n = addText(0, 0);
    const el = document.getElementById('nd-' + n.id);
    expect(el.style.getPropertyValue('--tn-color')).not.toBe('');
  });
});

// ─── Font persistence ─────────────────────────────────────
describe('Font persistence via saveState/loadState', () => {
  it('fontFamily and fontSize survive a save/load round-trip for code nodes', () => {
    const n = addNode(0, 0);
    n.fontFamily = 'jetbrains-mono';
    n.fontSize   = 14;
    saveState();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    loadState(saved);
    const restored = S.nodes.find(x => x.id === n.id);
    expect(restored.fontFamily).toBe('jetbrains-mono');
    expect(restored.fontSize).toBe(14);
  });

  it('fontFamily and fontSize survive a round-trip for bubble nodes', () => {
    const n = addBubble(0, 0);
    n.fontFamily = 'georgia';
    n.fontSize   = 16;
    saveState();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    loadState(saved);
    const restored = S.nodes.find(x => x.id === n.id);
    expect(restored.fontFamily).toBe('georgia');
    expect(restored.fontSize).toBe(16);
  });

  it('fontFamily, fontSize, and textColor survive a round-trip for text nodes', () => {
    const n = addText(0, 0);
    n.fontFamily = 'georgia';
    n.fontSize   = 32;
    n.textColor  = 'blue';
    saveState();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    loadState(saved);
    const restored = S.nodes.find(x => x.id === n.id);
    expect(restored.fontFamily).toBe('georgia');
    expect(restored.fontSize).toBe(32);
    expect(restored.textColor).toBe('blue');
  });

  it('old saves without fontFamily/fontSize load without errors', () => {
    const legacyState = {
      nodes: [{ id: 1, x: 0, y: 0, w: 100, h: 100, code: 'x', lang: 'js', color: 'blue' }],
      links: [], nid: 2, lid: 1,
    };
    expect(() => loadState(legacyState)).not.toThrow();
    // Node without fontFamily/fontSize should still render a DOM element
    expect(document.getElementById('nd-1')).not.toBeNull();
  });
});

// ─── Font size input (inp-font-size) ──────────────────────
describe('Font size input (inp-font-size)', () => {
  it('inp-font-size input is present in edit mode', () => {
    const n = addNode(0, 0);
    startEdit(n.id);
    const el = document.getElementById('nd-' + n.id);
    expect(el.querySelector('.inp-font-size')).not.toBeNull();
    stopEdit();
  });

  it('inp-font-size reflects the current fontSize value', () => {
    const n = addNode(0, 0);
    stopEdit();          // exit auto-started edit mode so startEdit re-renders
    n.fontSize = 20;
    startEdit(n.id);
    const el = document.getElementById('nd-' + n.id);
    expect(parseFloat(el.querySelector('.inp-font-size').value)).toBe(20);
    stopEdit();
  });

  it('changing inp-font-size to a valid value updates node fontSize', () => {
    const n = addNode(0, 0);
    startEdit(n.id);
    const el = document.getElementById('nd-' + n.id);
    const input = el.querySelector('.inp-font-size');
    input.value = '24';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(n.fontSize).toBe(24);
    stopEdit();
  });

  it('changing inp-font-size updates --node-font-size CSS property', () => {
    const n = addNode(0, 0);
    startEdit(n.id);
    const el = document.getElementById('nd-' + n.id);
    const input = el.querySelector('.inp-font-size');
    input.value = '32';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(el.style.getPropertyValue('--node-font-size')).toBe('32px');
    stopEdit();
  });

  it('out-of-range value (too large) reverts input and leaves fontSize unchanged', () => {
    const n = addNode(0, 0);
    stopEdit();
    n.fontSize = 14;
    startEdit(n.id);
    const el = document.getElementById('nd-' + n.id);
    const input = el.querySelector('.inp-font-size');
    input.value = '600';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(n.fontSize).toBe(14);
    expect(parseFloat(input.value)).toBe(14);
    stopEdit();
  });

  it('out-of-range value (too small) reverts input and leaves fontSize unchanged', () => {
    const n = addNode(0, 0);
    // fontSize defaults to 12.5 — no need for stopEdit/startEdit cycle
    startEdit(n.id);  // already in edit mode from addNode, startEdit is no-op but DOM is correct
    const el = document.getElementById('nd-' + n.id);
    const input = el.querySelector('.inp-font-size');
    input.value = '2';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(n.fontSize).toBe(12.5);
    stopEdit();
  });

  it('bubble node also has inp-font-size in edit mode', () => {
    const n = addBubble(0, 0);
    startEdit(n.id);
    const el = document.getElementById('nd-' + n.id);
    expect(el.querySelector('.inp-font-size')).not.toBeNull();
    stopEdit();
  });

  it('frame node also has inp-font-size in edit mode', () => {
    const n = addFrame(0, 0, 200, 100);
    startEdit(n.id);
    const el = document.getElementById('nd-' + n.id);
    expect(el.querySelector('.inp-font-size')).not.toBeNull();
    stopEdit();
  });

  it('text node also has inp-font-size in edit mode', () => {
    const n = addText(0, 0);
    // addText starts in edit mode automatically; element already has the edit UI
    const el = document.getElementById('nd-' + n.id);
    expect(el.querySelector('.inp-font-size')).not.toBeNull();
    stopEdit();
  });
});
