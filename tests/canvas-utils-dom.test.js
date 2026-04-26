// @vitest-environment jsdom
// Tests for canvas-utils.js exports that require a DOM environment:
//   svgE, buildMenuItems, onClickStop, positionCtxMenu
import { describe, it, expect, vi } from 'vitest';
import { svgE, buildMenuItems, onClickStop, positionCtxMenu } from '../canvas-utils.js';

// ─── svgE ────────────────────────────────────────────────
describe('svgE', () => {
  it('creates an SVG element with the given tag', () => {
    const el = svgE('circle');
    expect(el.tagName.toLowerCase()).toBe('circle');
    expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });

  it('sets attributes provided in the attrs object', () => {
    const el = svgE('line', { x1: '0', y1: '0', x2: '100', y2: '50' });
    expect(el.getAttribute('x1')).toBe('0');
    expect(el.getAttribute('y1')).toBe('0');
    expect(el.getAttribute('x2')).toBe('100');
    expect(el.getAttribute('y2')).toBe('50');
  });

  it('creates an element with no attributes when attrs is omitted', () => {
    const el = svgE('rect');
    expect(el.attributes.length).toBe(0);
  });

  it('sets multiple attributes independently', () => {
    const el = svgE('path', { d: 'M0 0', stroke: '#ff0000', fill: 'none' });
    expect(el.getAttribute('d')).toBe('M0 0');
    expect(el.getAttribute('stroke')).toBe('#ff0000');
    expect(el.getAttribute('fill')).toBe('none');
  });
});

// ─── buildMenuItems ───────────────────────────────────────
describe('buildMenuItems', () => {
  function makeContainer() {
    return document.createElement('div');
  }

  const items = [
    { label: 'Blue',  value: 'blue'  },
    { label: 'Green', value: 'green' },
    { label: 'Red',   value: 'red'   },
  ];

  it('creates one element per item', () => {
    const container = makeContainer();
    buildMenuItems(container, items, 'blue', {
      baseClass: 'swatch',
      setContent: (el, item) => { el.textContent = item.label; },
      onSelect: () => {},
    });
    expect(container.querySelectorAll('.swatch').length).toBe(3);
  });

  it('marks the element whose value matches curValue as active', () => {
    const container = makeContainer();
    buildMenuItems(container, items, 'green', {
      baseClass: 'swatch',
      setContent: (el, item) => { el.textContent = item.label; },
      onSelect: () => {},
    });
    const active = container.querySelectorAll('.swatch.active');
    expect(active.length).toBe(1);
    expect(active[0].textContent).toBe('Green');
  });

  it('does not mark any element active when curValue matches nothing', () => {
    const container = makeContainer();
    buildMenuItems(container, items, 'purple', {
      baseClass: 'swatch',
      setContent: (el, item) => { el.textContent = item.label; },
      onSelect: () => {},
    });
    expect(container.querySelectorAll('.swatch.active').length).toBe(0);
  });

  it('calls onSelect with the item value when clicked', () => {
    const container = makeContainer();
    const onSelect = vi.fn();
    buildMenuItems(container, items, 'blue', {
      baseClass: 'swatch',
      setContent: (el, item) => { el.textContent = item.label; },
      onSelect,
    });
    const buttons = container.querySelectorAll('.swatch');
    buttons[2].click(); // click Red
    expect(onSelect).toHaveBeenCalledWith('red');
  });

  it('moves the active class to the clicked element', () => {
    const container = makeContainer();
    buildMenuItems(container, items, 'blue', {
      baseClass: 'swatch',
      setContent: (el, item) => { el.textContent = item.label; },
      onSelect: () => {},
    });
    const buttons = container.querySelectorAll('.swatch');
    buttons[1].click(); // click Green
    expect(buttons[0].classList.contains('active')).toBe(false); // Blue no longer active
    expect(buttons[1].classList.contains('active')).toBe(true);  // Green is now active
  });

  it('clears existing children before populating', () => {
    const container = makeContainer();
    container.innerHTML = '<span>old</span>';
    buildMenuItems(container, items, 'blue', {
      baseClass: 'swatch',
      setContent: (el, item) => { el.textContent = item.label; },
      onSelect: () => {},
    });
    expect(container.querySelectorAll('span').length).toBe(0);
    expect(container.querySelectorAll('.swatch').length).toBe(3);
  });

  it('respects a custom tag option', () => {
    const container = makeContainer();
    buildMenuItems(container, items, 'blue', {
      tag: 'li',
      baseClass: 'item',
      setContent: (el, item) => { el.textContent = item.label; },
      onSelect: () => {},
    });
    expect(container.querySelectorAll('li.item').length).toBe(3);
  });

  it('calls setContent for every item', () => {
    const container = makeContainer();
    const setContent = vi.fn();
    buildMenuItems(container, items, 'blue', {
      baseClass: 'swatch',
      setContent,
      onSelect: () => {},
    });
    expect(setContent).toHaveBeenCalledTimes(3);
  });
});

// ─── onClickStop ─────────────────────────────────────────
describe('onClickStop', () => {
  it('calls the handler when the element is clicked', () => {
    const el = document.createElement('button');
    const handler = vi.fn();
    onClickStop(el, handler);
    el.click();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('stops propagation on click so the parent does not receive the event', () => {
    const parent = document.createElement('div');
    const child = document.createElement('button');
    parent.appendChild(child);
    const parentHandler = vi.fn();
    parent.addEventListener('click', parentHandler);
    onClickStop(child, () => {});
    child.click();
    expect(parentHandler).not.toHaveBeenCalled();
  });

  it('stops propagation on mousedown so canvas drag does not start', () => {
    const parent = document.createElement('div');
    const child = document.createElement('button');
    parent.appendChild(child);
    const parentMousedown = vi.fn();
    parent.addEventListener('mousedown', parentMousedown);
    onClickStop(child, () => {});
    child.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(parentMousedown).not.toHaveBeenCalled();
  });

  it('passes the click event object to the handler', () => {
    const el = document.createElement('button');
    let received = null;
    onClickStop(el, e => { received = e; });
    el.click();
    expect(received).toBeInstanceOf(MouseEvent);
  });
});

// ─── positionCtxMenu ─────────────────────────────────────
describe('positionCtxMenu', () => {
  it('sets display to "block"', () => {
    const el = document.createElement('div');
    el.style.display = 'none';
    positionCtxMenu(el, 100, 200);
    expect(el.style.display).toBe('block');
  });

  it('sets left and top style properties', () => {
    const el = document.createElement('div');
    positionCtxMenu(el, 50, 80);
    expect(el.style.left).not.toBe('');
    expect(el.style.top).not.toBe('');
  });

  it('does not position menu beyond the right viewport edge', () => {
    const el = document.createElement('div');
    // jsdom default innerWidth is 1024; offsetWidth is 0 in jsdom so clamp is 1024-0-8=1016
    positionCtxMenu(el, 2000, 100);
    const left = parseInt(el.style.left, 10);
    expect(left).toBeLessThanOrEqual(window.innerWidth - 8);
  });

  it('does not position menu beyond the bottom viewport edge', () => {
    const el = document.createElement('div');
    positionCtxMenu(el, 100, 2000);
    const top = parseInt(el.style.top, 10);
    expect(top).toBeLessThanOrEqual(window.innerHeight - 8);
  });

  it('uses the requested position when it fits in the viewport', () => {
    const el = document.createElement('div');
    positionCtxMenu(el, 100, 150);
    expect(el.style.left).toBe('100px');
    expect(el.style.top).toBe('150px');
  });
});
