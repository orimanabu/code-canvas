// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import '../canvas.js';
const {
  S,
  addNode, removeNode, selectNode, addBubble,
  loadState, saveState, restoreFromStorage,
  createLink, removeLink,
  copyNodes, cutNodes, pasteNodes, toggleMultiSel,
  addFreeLine, removeFreeLine,
  pushUndo, undo,
} = globalThis.__canvasApp;

const STORAGE_KEY = 'code-canvas-v1';

function resetState() {
  loadState({ nodes: [], links: [], nid: 1, lid: 1, vp: { x: 0, y: 0, scale: 1 } });
  localStorage.removeItem(STORAGE_KEY);
}

beforeEach(() => {
  resetState();
});

// ─── 1. Save / Restore round-trip ──────────────────────
//
// Scenario: the user builds a canvas with code nodes, bubbles, and links,
// closes the tab, and reopens it — expecting everything to be restored.
describe('Save/Restore round-trip', () => {
  it('restores code nodes with all fields intact', () => {
    const n = addNode(100, 200, 'const x = 42;');
    n.title    = 'My Node';
    n.filePath = 'src/index.js';
    n.showLineNumbers  = false;
    n.lineNumberStart  = 10;

    saveState();
    loadState({ nodes: [], links: [] }); // simulate clearing
    restoreFromStorage();

    expect(S.nodes).toHaveLength(1);
    const r = S.nodes[0];
    expect(r.code).toBe('const x = 42;');
    expect(r.title).toBe('My Node');
    expect(r.filePath).toBe('src/index.js');
    expect(r.showLineNumbers).toBe(false);
    expect(r.lineNumberStart).toBe(10);
    expect(r.x).toBe(100);
    expect(r.y).toBe(200);
  });

  it('restores bubble nodes with tail position', () => {
    const b = addBubble(50, 60);
    b.tailX = 200;
    b.tailY = 300;
    b.text  = 'Hello!';

    saveState();
    loadState({ nodes: [], links: [] });
    restoreFromStorage();

    const r = S.nodes[0];
    expect(r.type).toBe('bubble');
    expect(r.text).toBe('Hello!');
    expect(r.tailX).toBe(200);
    expect(r.tailY).toBe(300);
  });

  it('restores showTail=false for bubble nodes', () => {
    const b = addBubble(50, 60);
    b.showTail = false;
    b.text = 'Hidden tail';

    saveState();
    loadState({ nodes: [], links: [] });
    restoreFromStorage();

    expect(S.nodes[0].showTail).toBe(false);
  });

  it('restores tailAnchorMatchIdx for bubble nodes', () => {
    const b = addBubble(50, 60);
    b.tailAnchorMatchIdx = 2;

    saveState();
    loadState({ nodes: [], links: [] });
    restoreFromStorage();

    expect(S.nodes[0].tailAnchorMatchIdx).toBe(2);
  });

  it('restores links connecting nodes', () => {
    const a = addNode(0,   0,   'foo()');
    const b = addNode(500, 0,   'bar()');
    createLink(a.id, 'foo', b.id);

    saveState();
    loadState({ nodes: [], links: [] });
    restoreFromStorage();

    expect(S.links).toHaveLength(1);
    const lnk = S.links[0];
    expect(lnk.fromId).toBe(a.id);
    expect(lnk.toId).toBe(b.id);
    expect(lnk.text).toBe('foo');
  });

  it('restores viewport position and scale', () => {
    S.vp.x     = 123;
    S.vp.y     = 456;
    S.vp.scale = 1.5;

    saveState();
    S.vp.x = 0; S.vp.y = 0; S.vp.scale = 1;
    restoreFromStorage();

    expect(S.vp.x).toBe(123);
    expect(S.vp.y).toBe(456);
    expect(S.vp.scale).toBe(1.5);
  });

  it('re-renders DOM elements after restore', () => {
    const n = addNode(0, 0, '// hi');
    const savedId = n.id;

    saveState();
    loadState({ nodes: [], links: [] });
    expect(document.getElementById('nd-' + savedId)).toBeNull();

    restoreFromStorage();
    expect(document.getElementById('nd-' + savedId)).not.toBeNull();
  });
});

// ─── 2. Link lifecycle ─────────────────────────────────
//
// Scenario: the user selects text in a code block and draws an arrow
// to another block, then later deletes that arrow.
describe('Link lifecycle', () => {
  it('createLink adds an entry to S.links', () => {
    const a = addNode(0,   0);
    const b = addNode(500, 0);
    createLink(a.id, 'myFunc', b.id);

    expect(S.links).toHaveLength(1);
    expect(S.links[0]).toMatchObject({ fromId: a.id, toId: b.id, text: 'myFunc' });
  });

  it('createLink renders an SVG path in a per-node link SVG', () => {
    const a = addNode(0,   0);
    const b = addNode(500, 0);
    createLink(a.id, 'call', b.id);

    const paths = document.querySelectorAll('.node-link-svg .lk');
    expect(paths.length).toBe(1);
  });

  it('createLink does not add duplicate links', () => {
    const a = addNode(0,   0);
    const b = addNode(500, 0);
    createLink(a.id, 'fn', b.id);
    createLink(a.id, 'fn', b.id); // duplicate

    expect(S.links).toHaveLength(1);
  });

  it('removeLink removes the entry from S.links', () => {
    const a = addNode(0,   0);
    const b = addNode(500, 0);
    createLink(a.id, 'fn', b.id);
    const linkId = S.links[0].id;

    removeLink(linkId);
    expect(S.links).toHaveLength(0);
  });

  it('removeLink removes the SVG element', () => {
    const a = addNode(0,   0);
    const b = addNode(500, 0);
    createLink(a.id, 'fn', b.id);
    const linkId = S.links[0].id;

    removeLink(linkId);
    expect(document.querySelectorAll('#svg-links .lk').length).toBe(0);
  });
});

// ─── 3. Copy / Paste ───────────────────────────────────
//
// Scenario: the user copies a code block and pastes it to create
// a duplicate that is slightly offset from the original.
describe('Copy/Paste', () => {
  it('pasted node appears with a 30px offset', () => {
    const n = addNode(100, 200, '// original');
    selectNode(n.id);
    copyNodes();
    pasteNodes();

    expect(S.nodes).toHaveLength(2);
    const pasted = S.nodes[1];
    expect(pasted.x).toBe(n.x + 30);
    expect(pasted.y).toBe(n.y + 30);
  });

  it('pasted node has the same code as the original', () => {
    const n = addNode(0, 0, 'function hello() {}');
    selectNode(n.id);
    copyNodes();
    pasteNodes();

    expect(S.nodes[1].code).toBe('function hello() {}');
  });

  it('pasted node gets a new unique id', () => {
    const n = addNode(0, 0);
    selectNode(n.id);
    copyNodes();
    pasteNodes();

    expect(S.nodes[1].id).not.toBe(n.id);
    expect(document.getElementById('nd-' + S.nodes[1].id)).not.toBeNull();
  });

  it('original node is preserved after copy+paste', () => {
    const n = addNode(0, 0);
    selectNode(n.id);
    copyNodes();
    pasteNodes();

    expect(document.getElementById('nd-' + n.id)).not.toBeNull();
  });

  it('pasted nodes are multi-selected', () => {
    const n = addNode(0, 0);
    selectNode(n.id);
    copyNodes();
    pasteNodes();

    const pastedId = S.nodes[1].id;
    expect(S.multiSel.has(pastedId)).toBe(true);
    expect(document.getElementById('nd-' + pastedId)
      .classList.contains('multi-selected')).toBe(true);
  });

  it('cut removes source and paste creates offset copy', () => {
    const n = addNode(50, 80, '// cut me');
    const origId = n.id;
    selectNode(n.id);
    cutNodes();

    expect(S.nodes).toHaveLength(0);
    expect(document.getElementById('nd-' + origId)).toBeNull();

    pasteNodes();
    expect(S.nodes).toHaveLength(1);
    expect(S.nodes[0].x).toBe(80);  // 50 + 30
    expect(S.nodes[0].y).toBe(110); // 80 + 30
    expect(S.nodes[0].code).toBe('// cut me');
  });
});

// ─── 4. Node deletion cascades to links ────────────────
//
// Scenario: the user draws arrows between blocks, then deletes one
// of the blocks — the arrows connected to it should vanish too.
describe('Node deletion cascades to links', () => {
  it('deleting the source node removes its outgoing links', () => {
    const a = addNode(0,   0);
    const b = addNode(500, 0);
    createLink(a.id, 'call', b.id);
    expect(S.links).toHaveLength(1);

    removeNode(a.id);

    expect(S.links).toHaveLength(0);
  });

  it('deleting the target node removes incoming links', () => {
    const a = addNode(0,   0);
    const b = addNode(500, 0);
    createLink(a.id, 'ref', b.id);

    removeNode(b.id);

    expect(S.links).toHaveLength(0);
  });

  it('deleting one node does not remove links between remaining nodes', () => {
    const a = addNode(0,   0);
    const b = addNode(500, 0);
    const c = addNode(250, 300);
    createLink(a.id, 'to-b', b.id);
    createLink(b.id, 'to-c', c.id);

    removeNode(a.id); // only removes the a→b link

    expect(S.links).toHaveLength(1);
    expect(S.links[0].fromId).toBe(b.id);
    expect(S.links[0].toId).toBe(c.id);
  });

  it('SVG arrows are cleared when a linked node is deleted', () => {
    const a = addNode(0,   0);
    const b = addNode(500, 0);
    createLink(a.id, 'fn', b.id);
    expect(document.querySelectorAll('.node-link-svg .lk').length).toBe(1);

    removeNode(a.id);

    expect(document.querySelectorAll('.node-link-svg .lk').length).toBe(0);
  });
});

// ─── 5. Error / edge cases ─────────────────────────────
//
// Scenario: various boundary or erroneous operations that should
// degrade gracefully without throwing or corrupting state.
describe('Error / edge cases', () => {
  it('undo on an exhausted stack leaves state unchanged', () => {
    S.undoStack = [];
    addNode(0, 0, '// keep');
    S.undoStack = []; // simulate stack already drained
    expect(() => undo()).not.toThrow();
    expect(S.nodes).toHaveLength(1);
    expect(S.nodes[0].code).toBe('// keep');
  });

  it('removeFreeLine with an unknown id is a no-op', () => {
    S.freeLines = [];
    S.undoStack = [];
    const line = addFreeLine([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    expect(S.freeLines).toHaveLength(1);
    expect(() => removeFreeLine(line.id + 9999)).not.toThrow();
    expect(S.freeLines).toHaveLength(1);
  });

  it('createLink duplicate is silently ignored', () => {
    const a = addNode(0,   0);
    const b = addNode(500, 0);
    createLink(a.id, 'fn', b.id);
    createLink(a.id, 'fn', b.id); // duplicate — same from/text/to
    expect(S.links).toHaveLength(1);
  });

  it('removeNode with an unknown id is a no-op', () => {
    addNode(0, 0);
    expect(() => removeNode(9999)).not.toThrow();
    expect(S.nodes).toHaveLength(1);
  });

  it('free-line survives a save/restore round-trip', () => {
    S.freeLines = [];
    S.flid = 1;
    S.undoStack = [];
    const pts = [{ x: 10, y: 20 }, { x: 50, y: 80 }];
    addFreeLine(pts, 'curve', '#ff0000', 3, '4 2');

    saveState();
    loadState({ nodes: [], links: [] });
    restoreFromStorage();

    expect(S.freeLines).toHaveLength(1);
    const l = S.freeLines[0];
    expect(l.lineStyle).toBe('curve');
    expect(l.stroke).toBe('#ff0000');
    expect(l.strokeWidth).toBe(3);
    expect(l.dash).toBe('4 2');
    expect(l.points).toEqual(pts);
  });
});
