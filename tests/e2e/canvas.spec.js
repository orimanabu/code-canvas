import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/canvas.html');
  // Wait for the app to initialise (status bar shows "Ready" message)
  await expect(page.locator('#status')).toContainText('Ready', { timeout: 5000 });
  // Clear any stale localStorage state so tests start from an empty canvas
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#status')).toContainText('Ready', { timeout: 5000 });
});

// ─── Smoke test ───────────────────────────────────────────────────────────────
test('page loads and toolbar is visible', async ({ page }) => {
  await expect(page.locator('#toolbar')).toBeVisible();
  await expect(page.locator('#btn-add')).toBeVisible();
  // #wrap is the layout container; #canvas is an empty abs-positioned div
  // (Playwright requires a non-zero bounding box for toBeVisible)
  await expect(page.locator('#wrap')).toBeVisible();
});

// ─── Add node via toolbar button ─────────────────────────────────────────────
test('clicking "+ Add Block" creates a code node', async ({ page }) => {
  await page.locator('#btn-add').click();
  const node = page.locator('.node').first();
  await expect(node).toBeVisible();
  // Node should contain a textarea (starts in edit mode)
  await expect(node.locator('textarea')).toBeVisible();
});

// ─── Double-click canvas creates a node at that position ─────────────────────
test('double-clicking the canvas creates a node', async ({ page }) => {
  // #canvas has no area when empty; double-click the #wrap container instead
  await page.locator('#wrap').dblclick({ position: { x: 300, y: 200 } });
  await expect(page.locator('.node')).toHaveCount(1);
});

// ─── Add bubble node ──────────────────────────────────────────────────────────
test('clicking "💬 Bubble" creates a bubble node', async ({ page }) => {
  await page.locator('#btn-add-bubble').click();
  await expect(page.locator('.bubble-node')).toHaveCount(1);
});

// ─── Add frame node ───────────────────────────────────────────────────────────
test('clicking "⬜ Group" opens the group dialog', async ({ page }) => {
  await page.locator('#btn-group').click();
  await expect(page.locator('#group-dialog-overlay')).toBeVisible();
});

// ─── Delete selected node ─────────────────────────────────────────────────────
test('pressing Delete removes the selected node', async ({ page }) => {
  await page.locator('#btn-add').click();
  // Exit edit mode by pressing Escape
  await page.keyboard.press('Escape');
  // Click on the node to select it (the node element is in select mode now)
  await page.locator('.node').first().click();
  await expect(page.locator('.node')).toHaveCount(1);

  await page.keyboard.press('Delete');
  await expect(page.locator('.node')).toHaveCount(0);
});

// ─── V / H mode switching ─────────────────────────────────────────────────────
test('"h" key switches to HAND mode, "v" switches back', async ({ page }) => {
  const indicator = page.locator('#mode-indicator');
  await expect(indicator).toContainText('SELECT');

  await page.keyboard.press('h');
  await expect(indicator).toContainText('HAND');

  await page.keyboard.press('v');
  await expect(indicator).toContainText('SELECT');
});

// ─── Undo ─────────────────────────────────────────────────────────────────────
test('Ctrl+Z undoes adding a node', async ({ page }) => {
  await page.locator('#btn-add').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.node')).toHaveCount(1);

  await page.keyboard.press('Control+z');
  await expect(page.locator('.node')).toHaveCount(0);
});

// ─── Node edit / view mode toggle ─────────────────────────────────────────────
test('clicking Edit on a node shows a textarea; Done hides it', async ({ page }) => {
  await page.locator('#btn-add').click();
  const node = page.locator('.node').first();
  await expect(node.locator('textarea')).toBeVisible();

  // Click Done to exit edit mode
  await node.locator('.btn-done').click();
  await expect(node.locator('textarea')).toHaveCount(0);
  await expect(node.locator('pre')).toBeVisible();

  // Click Edit to re-enter edit mode
  await node.locator('.btn-edit').click();
  await expect(node.locator('textarea')).toBeVisible();
});

// ─── Drag node ────────────────────────────────────────────────────────────────
test('dragging a node header moves the node', async ({ page }) => {
  await page.locator('#btn-add').click();
  await page.keyboard.press('Escape');
  const node = page.locator('.node').first();
  const header = node.locator('.node-header');

  const boxBefore = await node.boundingBox();
  const hBox = await header.boundingBox();
  const startX = hBox.x + hBox.width / 2;
  const startY = hBox.y + hBox.height / 2;

  // Use low-level mouse API to avoid issues with invisible-canvas drag target
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 200, startY + 100, { steps: 10 });
  await page.mouse.up();

  const boxAfter = await node.boundingBox();
  // Node should have moved by approximately the drag delta
  expect(Math.abs(boxAfter.x - boxBefore.x)).toBeGreaterThan(50);
});

// ─── Zoom controls ────────────────────────────────────────────────────────────
test('zoom-in and zoom-out buttons change the zoom level', async ({ page }) => {
  const zoomInput = page.locator('#zoom-input');
  const initialZoom = await zoomInput.inputValue();

  await page.locator('#btn-zoom-in').click();
  const afterZoomIn = await zoomInput.inputValue();
  expect(afterZoomIn).not.toBe(initialZoom);

  await page.locator('#btn-zoom-out').click();
  const afterZoomOut = await zoomInput.inputValue();
  expect(afterZoomOut).not.toBe(afterZoomIn);
});

// ─── Copy / Paste ─────────────────────────────────────────────────────────────
test('Ctrl+C and Ctrl+V copies and pastes a node', async ({ page }) => {
  await page.locator('#btn-add').click();
  await page.keyboard.press('Escape');
  await page.locator('.node').first().click();
  await expect(page.locator('.node')).toHaveCount(1);

  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(page.locator('.node')).toHaveCount(2);
});

// ─── Persistence: state survives reload ───────────────────────────────────────
test('canvas state persists across page reloads', async ({ page }) => {
  await page.locator('#btn-add').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.node')).toHaveCount(1);

  await page.reload();
  await expect(page.locator('#status')).toContainText('Ready', { timeout: 5000 });
  await expect(page.locator('.node')).toHaveCount(1);
});

// ─── Link creation ────────────────────────────────────────────────────────────
test('selecting text in a code block shows the link tooltip', async ({ page }) => {
  await page.locator('#btn-add').click();
  await page.keyboard.press('Escape');

  // Enter edit mode and type code
  await page.locator('.node .btn-edit').click();
  const ta = page.locator('.node textarea');
  await ta.fill('function hello() {}');
  await page.locator('.node .btn-done').click();

  // Programmatically select text inside the code pre and fire mouseup on document.
  // Playwright's mouse drag doesn't always trigger the browser's native selection,
  // but setting the Selection API range directly does.
  await page.evaluate(() => {
    const pre = document.querySelector('.node pre');
    const range = document.createRange();
    range.selectNodeContents(pre);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });

  // Link tooltip should appear after mouseup with text selected
  await expect(page.locator('#link-tip')).toBeVisible({ timeout: 2000 });
});
