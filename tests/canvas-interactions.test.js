// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';

import '../canvas.js';
const {
  S, addNode, addText, addFrame, selectNode, toggleMultiSel, loadState,
  pushUndo, copyNodes, stopEdit, startEdit,
} = globalThis.__canvasApp;

function resetState() {
  loadState({ nodes: [], links: [], nid: 1, lid: 1 });
  S.mode = 'select';
  S.sel  = null;
  S.multiSel.clear();
  S.editing = null;
  S.clipboard = null;
  S.lineDrawMode = false;
  S.linkMode = false;
}

beforeEach(resetState);

// Helper: fire a keydown event directly on document.
// user-event's keyboard() is great for click/type sequences, but for testing global
// document.addEventListener('keydown') handlers the simplest reliable path is
// a native KeyboardEvent — it guarantees the correct `code` field that canvas.js checks.
function fireKey(opts) {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...opts })
  );
}

// ─── Delete key ────────────────────────────────────────────────────────────────
describe('Delete key', () => {
  it('removes the selected node from state and DOM', () => {
    const n = addNode(100, 100);
    stopEdit();
    selectNode(n.id);

    fireKey({ code: 'Delete', key: 'Delete' });

    expect(S.nodes).toHaveLength(0);
    expect(document.getElementById('nd-' + n.id)).toBeNull();
  });

  it('removes all nodes in the multi-selection', () => {
    const a = addNode(0, 0);
    const b = addNode(10, 10);
    const c = addNode(20, 20);
    stopEdit();
    toggleMultiSel(a.id);
    toggleMultiSel(b.id);

    fireKey({ code: 'Delete', key: 'Delete' });

    expect(S.nodes).toHaveLength(1);
    expect(S.nodes[0].id).toBe(c.id);
  });

  it('does nothing when no node is selected', () => {
    addNode(0, 0);
    stopEdit();
    S.sel = null;

    fireKey({ code: 'Delete', key: 'Delete' });

    expect(S.nodes).toHaveLength(1);
  });

  it('ignores Delete when an input is focused', () => {
    const n = addNode(0, 0);
    stopEdit();
    selectNode(n.id);
    // Simulate an input being the active element
    const input = document.getElementById('canvas-title');
    input.focus();

    fireKey({ code: 'Delete', key: 'Delete' });

    expect(S.nodes).toHaveLength(1);
  });

  it('Backspace also removes the selected node', () => {
    const n = addNode(0, 0);
    stopEdit();
    selectNode(n.id);

    fireKey({ code: 'Backspace', key: 'Backspace' });

    expect(S.nodes).toHaveLength(0);
  });
});

// ─── V / H mode keys ───────────────────────────────────────────────────────────
describe('V / H mode keys', () => {
  it('"h" key switches from select to hand mode', () => {
    S.mode = 'select';

    fireKey({ code: 'KeyH', key: 'h' });

    expect(S.mode).toBe('hand');
  });

  it('"v" key switches from hand to select mode', () => {
    S.mode = 'hand';

    fireKey({ code: 'KeyV', key: 'v' });

    expect(S.mode).toBe('select');
  });

  it('"h" while already in hand mode switches back to select', () => {
    S.mode = 'hand';

    fireKey({ code: 'KeyH', key: 'h' });

    expect(S.mode).toBe('select');
  });

  it('mode key is ignored when an input is focused', () => {
    S.mode = 'select';
    document.getElementById('canvas-title').focus();

    fireKey({ code: 'KeyH', key: 'h' });

    expect(S.mode).toBe('select');
  });

  it('mode key is ignored when Ctrl is held (Ctrl+H)', () => {
    S.mode = 'select';

    fireKey({ code: 'KeyH', key: 'h', ctrlKey: true });

    expect(S.mode).toBe('select');
  });
});

// ─── Ctrl+Z keyboard undo ─────────────────────────────────────────────────────
describe('Ctrl+Z keyboard shortcut', () => {
  it('undoes the last state change', () => {
    pushUndo(); // snapshot empty state
    addNode(50, 50);
    stopEdit();
    expect(S.nodes).toHaveLength(1);

    fireKey({ code: 'KeyZ', key: 'z', ctrlKey: true });

    expect(S.nodes).toHaveLength(0);
  });

  it('is ignored when an input is focused', () => {
    pushUndo();
    addNode(0, 0);
    stopEdit();
    document.getElementById('canvas-title').focus();

    fireKey({ code: 'KeyZ', key: 'z', ctrlKey: true });

    expect(S.nodes).toHaveLength(1);
  });
});

// ─── Ctrl+C / Ctrl+X / Ctrl+V keyboard shortcuts ─────────────────────────────
describe('Copy / Cut / Paste keyboard shortcuts', () => {
  it('Ctrl+C copies selected nodes into clipboard', () => {
    const n = addNode(10, 20, 'const a = 1;');
    stopEdit();
    selectNode(n.id);

    fireKey({ code: 'KeyC', key: 'c', ctrlKey: true });

    expect(S.clipboard).not.toBeNull();
    expect(S.clipboard).toHaveLength(1);
    expect(S.clipboard[0].code).toBe('const a = 1;');
  });

  it('Ctrl+X cuts selected node — removes it and saves to clipboard', () => {
    const n = addNode(10, 20, 'const b = 2;');
    stopEdit();
    selectNode(n.id);

    fireKey({ code: 'KeyX', key: 'x', ctrlKey: true });

    expect(S.nodes).toHaveLength(0);
    expect(S.clipboard).not.toBeNull();
    expect(S.clipboard[0].code).toBe('const b = 2;');
  });

  it('Ctrl+V pastes clipboard with a position offset', () => {
    const n = addNode(0, 0, 'hello');
    stopEdit();
    selectNode(n.id);
    copyNodes();
    expect(S.clipboard).toHaveLength(1);

    fireKey({ code: 'KeyV', key: 'v', ctrlKey: true });

    expect(S.nodes).toHaveLength(2);
    expect(S.nodes[1].code).toBe('hello');
    expect(S.nodes[1].x).not.toBe(n.x);
  });

  it('Ctrl+C does nothing when clipboard is empty and nothing is selected', () => {
    fireKey({ code: 'KeyC', key: 'c', ctrlKey: true });
    expect(S.clipboard).toBeNull();
  });
});

// ─── Edit mode via button click ────────────────────────────────────────────────
describe('Edit mode (btn-edit click)', () => {
  it('clicking "Edit" on a code node sets S.editing and shows a textarea', async () => {
    const user = userEvent.setup();
    const n = addNode(0, 0, 'const x = 1;');
    const el = document.getElementById('nd-' + n.id);

    await user.click(el.querySelector('.btn-edit'));

    expect(S.editing).toBe(n.id);
    expect(el.querySelector('textarea')).not.toBeNull();
  });

  it('clicking the delete button (btn-del) removes the node', async () => {
    const user = userEvent.setup();
    const n = addNode(0, 0);
    const el = document.getElementById('nd-' + n.id);

    await user.click(el.querySelector('.btn-del'));

    expect(S.nodes).toHaveLength(0);
    expect(document.getElementById('nd-' + n.id)).toBeNull();
  });

  it('double-clicking a node element enters edit mode for a bubble', async () => {
    const user = userEvent.setup();
    // Bubble nodes have a bubble-body with a dblclick handler
    const { addBubble } = globalThis.__canvasApp;
    const n = addBubble(0, 0);
    const el = document.getElementById('nd-' + n.id);

    await user.dblClick(el.querySelector('.bubble-body'));

    expect(S.editing).toBe(n.id);
  });
});

// ─── Escape key exits edit mode ────────────────────────────────────────────────
describe('Escape key exits edit mode', () => {
  it('pressing Escape while editing sets S.editing to null', async () => {
    const user = userEvent.setup();
    const n = addNode(0, 0, 'const y = 2;');
    const el = document.getElementById('nd-' + n.id);
    await user.click(el.querySelector('.btn-edit'));
    expect(S.editing).toBe(n.id);

    fireKey({ code: 'Escape', key: 'Escape' });

    expect(S.editing).toBeNull();
    expect(document.getElementById('nd-' + n.id)?.querySelector('textarea')).toBeNull();
  });
});

// ─── renderNode edit/view cycle ────────────────────────────────────────────────
describe('renderNode edit/view cycle', () => {
  it('textarea value is pre-filled with the current code', async () => {
    const user = userEvent.setup();
    const n = addNode(0, 0, 'const z = 3;');
    const el = document.getElementById('nd-' + n.id);

    await user.click(el.querySelector('.btn-edit'));

    const ta = el.querySelector('textarea');
    expect(ta).not.toBeNull();
    expect(ta.value).toBe('const z = 3;');
  });

  it('entering edit mode multiple times does not accumulate event listeners (idempotent)', async () => {
    const user = userEvent.setup();
    const n = addNode(0, 0, 'let a = 1;');
    const el = document.getElementById('nd-' + n.id);

    // Enter edit, exit, enter again — the btn-del should only fire once per click
    await user.click(el.querySelector('.btn-edit'));
    fireKey({ code: 'Escape', key: 'Escape' });
    await user.click(el.querySelector('.btn-edit'));

    expect(S.editing).toBe(n.id);
    const countBefore = S.nodes.length;
    await user.click(el.querySelector('.btn-done'));
    expect(S.editing).toBeNull();
    expect(S.nodes.length).toBe(countBefore); // should not have deleted the node
  });

  it('text node edit/view cycle preserves text content', async () => {
    const user = userEvent.setup();
    const n = addText(100, 100);
    stopEdit();
    n.text = 'Initial text';
    const el = document.getElementById('nd-' + n.id);

    await user.click(el.querySelector('.btn-edit'));

    const ta = el.querySelector('textarea');
    expect(ta).not.toBeNull();
    expect(ta.value).toBe('Initial text');

    await user.clear(ta);
    await user.type(ta, 'Updated text');
    await user.click(el.querySelector('.btn-done'));

    expect(S.editing).toBeNull();
    expect(n.text).toBe('Updated text');
  });

  it('frame node edit/view cycle preserves label', async () => {
    const user = userEvent.setup();
    const n = addFrame(50, 50, 300, 200, 'Frame Label');
    const el = document.getElementById('nd-' + n.id);

    await user.click(el.querySelector('.btn-edit'));

    const input = el.querySelector('.inp-title');
    expect(input).not.toBeNull();
    expect(input.value).toBe('Frame Label');

    await user.clear(input);
    await user.type(input, 'New Label');
    await user.click(el.querySelector('.btn-done'));

    expect(S.editing).toBeNull();
    expect(n.label).toBe('New Label');
  });
});
