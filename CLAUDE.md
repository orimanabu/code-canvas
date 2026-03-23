# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a single-file browser application (`canvas.html`) — an infinite canvas tool ("∞ Code Canvas") for taking structured notes while reading source code. No build step, no package manager, no server required. Open `canvas.html` directly in a browser.

## Architecture

Everything lives in `canvas.html` as one self-contained file with three sections:

1. **CSS** (lines ~9–411) — All styles inline in `<style>`. Two major visual systems:
   - Code block nodes (`.node`, `.node-header`, `.node-body`)
   - Bubble/comment nodes (`.bubble-node`, `.bubble-body`, `.bubble-tail-poly`)

2. **HTML** (lines ~413–511) — Minimal DOM: a top toolbar (`#toolbar`), a canvas container (`#wrap > #canvas`), an SVG layer (`#svg-links`) for arrows, two modal dialogs (Git config, Git fetch), and a status bar.

3. **JavaScript** (lines ~512–end) — All logic in a single `<script>` block organized by sections marked with `// ═══` banners:
   - **STATE** — Single `S` object holds all runtime state: nodes, links, viewport, selection, drag, pan, edit mode, git config, clipboard
   - **VIEWPORT** — `applyVP()`, `s2c()`, `zoom()` manage pan/zoom with CSS transform
   - **HIGHLIGHT** — highlight.js integration, `EXT_LANG` map for file extension → language, `renderNode()` / `reHighlight()`
   - **NODES** — `addNode()`, `addBubble()`, `renderNode()`, `renderBubble()`, `startEdit()`, `stopEdit()`, `deleteNode()`
   - **LINKS** — SVG bezier curves connecting nodes, `renderLinks()`, `addLink()`, `deleteLink()`
   - **DRAG/RESIZE** — pointer event handlers on nodes and the canvas wrapper
   - **KEYBOARD** — global `keydown` handler for shortcuts (v/h mode, Del, Cmd+C/X/V, Escape, etc.)
   - **PERSISTENCE** — `save()` / `load()` via `localStorage`, export/import as JSON, Git snippet fetch via GitHub raw URLs

## Key patterns

- **Node data model**: Each node in `S.nodes[]` is a plain object with `{ id, type, x, y, w, h, code, lang, title, filePath, showLn, startLn }`. Bubble nodes additionally have `{ text, tailX, tailY }`.
- **Rendering**: `renderNode(n)` / `renderBubble(n)` create DOM elements and attach event listeners each time a node is added. Nodes are never re-rendered in-place; the element is replaced on `stopEdit()`.
- **Edit mode**: `startEdit(id)` swaps the highlighted `<pre>` for a `<textarea>`; `stopEdit()` reads the textarea and re-renders.
- **Links**: Created via text selection → tooltip click flow. Stored as `{ id, from, to, text }` in `S.links[]`; rendered as SVG paths on every viewport change.
- **Persistence**: Auto-saved to `localStorage` key `code-canvas-v1` on every change. Import/export uses JSON with the same schema as `S.nodes` + `S.links`.
- **Git integration**: Fetches raw file content from GitHub (`raw.githubusercontent.com`) to populate code blocks. Commit hash auto-resolved via GitHub API (`api.github.com`).

## Node types

| Type | Created by | Key fields |
|------|-----------|------------|
| `code` (default) | "＋ ブロック追加" button or canvas double-click | `code`, `lang`, `title`, `filePath`, `showLn`, `startLn` |
| `bubble` | "💬 吹き出し" button | `text`, `tailX`, `tailY` |

## Keyboard shortcuts

`v` = select mode, `h` = hand/pan mode, `Space` (held) = temporary hand mode, `Del`/`Backspace` = delete selected, `Cmd/Ctrl+C/X/V` = copy/cut/paste nodes, `Escape` = exit edit/link mode, `l` = toggle link mode.

## Code Language Requirements

When responding to prompts in Japanese, always write all code captions, messages, comments, and documentation in English. Never use Japanese in code.

- All code comments must be in English
- All variable/function names must be in English  
- All error messages and user-facing strings must be in English
- Documentation and docstrings must be in English

