# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"∞ Code Canvas" is a browser application for taking structured notes while reading source code. No build step required. Open `canvas.html` via a local server or GitHub Pages (ES modules require HTTP/HTTPS — `file://` is not supported).

## File structure

| File | Description |
|------|-------------|
| `canvas.html` | Entry point. Minimal DOM: toolbar, canvas container, SVG layer, modal dialogs, status bar. Loads `canvas.css` and `canvas.js` as an ES module (`<script type="module">`). |
| `canvas.css` | All styles. Three major visual systems: code block nodes (`.node`, `.node-header`, `.node-body`), bubble/comment nodes (`.bubble-node`, `.bubble-body`, `.bubble-tail-poly`), and frame nodes (`.frame-node`, `.frame-header`, `.frame-label`). |
| `canvas-utils.js` | Pure utility functions — no DOM, no state. ES module with named exports. Fully unit-testable without jsdom. |
| `canvas-dialogs.js` | All modal dialog logic (Global Config, Repo sub-dialog, Group Frame, Git Fetch, codesnippetd). Initialized via `initDialogs(deps)` called from `canvas.js`. |
| `canvas.js` | Main application logic. ES module that imports from `canvas-utils.js` and `canvas-dialogs.js`. Organized by sections marked with `// ═══` banners (see below). |
| `package.json` / `vitest.config.js` | Test tooling (Vitest). Run tests with `npm test`. |

## Architecture

**`canvas.js`** is organized by sections marked with `// ═══` banners:

- **STATE** — Single `S` object holds all runtime state: nodes, links, freeLines, viewport, selection, drag, pan, edit mode, undo stack, globalConfig, clipboard
- **VIEWPORT** — `applyVP()`, `s2c()`, `zoom()`, `fitAll()`, `jumpTo()` manage pan/zoom with CSS transform
- **HIGHLIGHT** — highlight.js integration, `highlight()` / `buildCodeHTML()`
- **NODES** — `addNode()`, `addBubble()`, `addFrame()`, `renderNode()`, `startEdit()`, `stopEdit()`, `removeNode()`
- **LINKS** — SVG bezier curves connecting nodes, `renderLinks()`, `createLink()`, `removeLink()`
- **FREE LINES** — freehand polyline/curve/straight-line strokes, `addFreeLine()`, `removeFreeLine()`, `renderFreeLines()`
- **UNDO** — snapshot-based undo stack (up to 10 steps), `pushUndo()`, `undo()`
- **DRAG/RESIZE** — pointer event handlers on nodes and the canvas wrapper
- **KEYBOARD** — global `keydown` handler for shortcuts (v/h mode, Del, Cmd+C/X/V/Z, Escape, etc.)
- **PERSISTENCE** — `saveState()` / `loadState()` via `localStorage` (per-tab key), export/import as JSON, Git snippet fetch via GitHub raw URLs

**Pure utility functions** (in `canvas-utils.js`; imported by `canvas.js`):

- `esc(s)` — HTML escape
- `EXT_LANG`, `langFromPath(filePath)` — file extension → highlight.js language name
- `injectAnchor(html, rawText, linkId)` — inject link-anchor span into highlighted HTML
- `splitHtmlLines(html)`, `addLineNumbers(html, start)` — per-line HTML rendering with correct span handling
- `roundedRectRayHit(...)` — ray vs. rounded-rect intersection (bubble tail geometry)
- `anchorFpFromSide(r, side)` — exit point from an anchor element's bounding rect
- `edgePoint(from, to)` — exit point on a node's edge toward another node (arrow geometry)

## Key patterns

- **Node data model**: Each node in `S.nodes[]` is a plain object. Code nodes: `{ id, x, y, w, h, code, lang, title, filePath, showLineNumbers, lineNumberStart, color }`. Bubble nodes: `{ id, type: 'bubble', x, y, w, h, text, tailX, tailY, color, showTail }`. Frame nodes: `{ id, type: 'frame', x, y, w, h, label, color }`.
- **Rendering**: `renderNode(n)` dispatches to `renderFrameContent()`, `renderBubbleContent()`, or the code-block view/edit HTML generators. Nodes are never re-rendered in-place; `stopEdit()` re-renders the whole element.
- **Edit mode**: `startEdit(id)` swaps the highlighted `<pre>` for a `<textarea>`; `stopEdit()` reads the textarea and re-renders.
- **Links**: Created via text selection → tooltip click flow. Stored as `{ id, fromId, toId, text, stroke, strokeWidth, dash }` in `S.links[]`; rendered as SVG paths on every viewport change.
- **Free lines**: Stored as `{ id, points, lineStyle, stroke, strokeWidth, dash }` in `S.freeLines[]`. Rendered into a `<g id="free-lines-layer">` inside `#svg-links`. `lineStyle` is `'polyline'`, `'curve'`, or `'straight'`.
- **Undo**: `pushUndo()` snapshots `S.nodes`, `S.links`, `S.freeLines` (shallow copy), capped at 10. `undo()` pops the top snapshot, clears DOM, and re-renders all nodes and lines.
- **Persistence**: Auto-saved to a per-tab `localStorage` key `code-canvas-v1-{TAB_ID}` on every change (stale entries from closed tabs purged after 30 days). Import/export uses JSON with the full state schema.
- **Cross-tab clipboard**: Copy/cut also writes to the shared `localStorage` key `code-canvas-clipboard` (no TAB suffix). Paste reads from that key first, so Cmd+C in one tab followed by Cmd+V in another tab works. Paste shifts the in-memory clipboard for offset stacking but does not overwrite the shared key.
- **Git integration**: Fetches raw file content from GitHub (`raw.githubusercontent.com`) to populate code blocks. Commit hash auto-resolved via GitHub API (`api.github.com`). Multiple repos configurable via `S.globalConfig.repositories[]`.

## Node types

| Type | Created by | Key fields |
|------|-----------|------------|
| `code` (default) | "+ Add Block" button or canvas double-click | `code`, `lang`, `title`, `filePath`, `showLineNumbers`, `lineNumberStart`, `color` |
| `bubble` | "💬 Bubble" button | `text`, `tailX`, `tailY`, `color`, `showTail` |
| `frame` | "⬜ Group" button | `label`, `color` |

## Keyboard shortcuts

`v` = select mode, `h` = hand/pan mode, `Space` (held) = temporary hand mode, `Del`/`Backspace` = delete selected, `Cmd/Ctrl+C/X/V` = copy/cut/paste nodes, `Cmd/Ctrl+Z` = undo, `Escape` = exit edit/link mode, `l` = toggle link mode.

## Code Language Requirements

When responding to prompts in Japanese, always write all code captions, messages, comments, and documentation in English. Never use Japanese in code.

- All code comments must be in English
- All variable/function names must be in English  
- All error messages and user-facing strings must be in English
- Documentation and docstrings must be in English

