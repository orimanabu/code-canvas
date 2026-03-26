// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { S, addNode, removeNode, selectNode, addBubble, loadState } from '../canvas.js';

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
});
