# Overview

A browser-based tool for reading and understanding source code. Visually organize and connect code snippets on an infinite canvas.

![screenshot1](images/screenshot-1.png)

![screenshot2](images/screenshot-2.png)

# Features

- **Code blocks**: Place code inside resizable rectangles. Each block can have a title and file path. Font family and size can be changed per block via the edit menu (`•••`).
- **Syntax highlighting**: Language is auto-detected from the code content and highlighted accordingly.
- **Links**: Select a string (e.g. a function name) inside a code block and connect it to another block with an arrow. All occurrences of the linked text are highlighted and clickable to jump to the target. The arrow starts from the specific occurrence you selected. Right-click a highlighted occurrence to create additional links or delete all links from that text. Right-click an arrow to change its color, width, and dash style.
- **Bubbles**: Add comment bubbles with a movable tail. The tail can be shown or hidden via the bubble header checkbox. The tail tip can also be anchored to selected text inside a code block — select the text and choose "Attach bubble tail here" from the tooltip. Font family and size can be changed per bubble via the edit menu (`•••`).
- **Frames**: Group related nodes visually with a labeled frame rectangle. Font family and size can be changed per frame via the edit menu (`•••`).
- **Freehand lines**: Draw polyline, smooth curve, or straight line strokes on the canvas. Each line's shape, color, width, and dash style are configurable via right-click menu.
- **Jump**: The "☰ Jump" toolbar button opens a navigator panel listing all code blocks, bubbles, and frames. Click an entry to scroll the canvas to that node.
- **Undo**: Cmd/Ctrl+Z undoes the last action (snapshot-based, up to 10 steps).
- **Infinite canvas**: Miro-style navigation (drag to pan, Cmd+drag to zoom, v/h to switch modes).
- **Multi-tab isolation**: Each browser tab stores its own canvas independently in localStorage. Stale entries from closed tabs are purged automatically after 30 days.
- **Save / Load**: Export and import as JSON.


# Running the Web Server

Both `serve.go` (Go) and `serve.py` (Python 3) provide an equivalent local HTTP server. Using a server avoids the CORS restrictions of the `file://` protocol.

**Go server** — requires Go 1.21+, no external dependencies:

```bash
# Run directly with go run
go run serve.go

# Or build a binary first
go build -o serve serve.go
./serve

# Load a previously exported JSON file on startup
go run serve.go my-notes.json

# Specify a custom port (default: 8765)
go run serve.go --port 9000 my-notes.json
```

**Python server** — requires Python 3, no external dependencies:

```bash
python3 serve.py
python3 serve.py my-notes.json
python3 serve.py --port 9000 my-notes.json
```

The server opens `http://localhost:8765/code-canvas/canvas.html` in the browser automatically.

When a JSON file is specified, its contents are loaded into the canvas on startup and also written to `localStorage`, so the state is preserved across page refreshes.

# Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `v` | Select mode |
| `h` | Hand/pan mode |
| `Space` (hold) | Temporary hand mode |
| `l` | Toggle link mode |
| `Del` / `Backspace` | Delete selected node or line |
| `Cmd/Ctrl+C` | Copy selected node(s) or line |
| `Cmd/Ctrl+X` | Cut selected node(s) or line |
| `Cmd/Ctrl+V` | Paste (works across tabs in the same browser) |
| `Cmd/Ctrl+Z` | Undo (up to 10 steps) |
| `Escape` | Exit edit / link mode |

# JSON Output Format

## Top level

| Field | Type | Description |
|---|---|---|
| `dataVersion` | string | Format version (currently `"3.2"`) |
| `canvasTitle` | string | Title of the entire canvas |
| `nodes` | Node[] | Array of code blocks, bubbles, and frames |
| `links` | Link[] | Array of links |
| `freeLines` | FreeLine[] | Array of freehand line objects |
| `nid` | number | Counter for the next node ID to assign |
| `lid` | number | Counter for the next link ID to assign |
| `flid` | number | Counter for the next free-line ID to assign |
| `taid` | number | Counter for the next tail-anchor ID to assign |
| `vp` | Viewport | Viewport state |
| `globalConfig` | GlobalConfig | Canvas description and list of associated Git repositories |

## Node object (code block)

A node is a code block when the `type` field is absent or `"code"`.

| Field | Type | Description |
|---|---|---|
| `id` | number | Unique node ID |
| `x` | number | X coordinate on the canvas |
| `y` | number | Y coordinate on the canvas |
| `w` | number | Width of the rectangle |
| `h` | number | Height of the rectangle |
| `code` | string | Code content |
| `lang` | string | Language (auto-detected result, e.g. `"cpp"`, `"rust"`) |
| `title` | string | Title of the code block |
| `filePath` | string | Path of the file the code belongs to |
| `showLineNumbers` | boolean | Whether to show line numbers (default: `true`) |
| `lineNumberStart` | number | Line number shown at the first line (default: `1`) |
| `color` | string | Color theme ID (e.g. `"blue"`, `"green"`, `"red"`) |
| `fontFamily` | string | Font family preset ID. One of: `"default"`, `"ui-monospace"`, `"source-code-pro"`, `"jetbrains-mono"`, `"fira-code"`, `"menlo"`, `"monaco"`, `"cascadia-code"`, `"consolas"`, `"courier-new"` (monospace), or `"system-ui"`, `"inter"`, `"helvetica-neue"`, `"verdana"`, `"trebuchet-ms"`, `"arial"`, `"georgia"` (proportional). Defaults to `"default"` |
| `fontSize` | number | Font size in px (6–96). Can be typed directly or chosen from presets (10–48 px). Defaults to `12.5` |

## Node object (bubble)

A node is a bubble when `type` is `"bubble"`.

| Field | Type | Description |
|---|---|---|
| `id` | number | Unique node ID |
| `type` | string | Fixed value `"bubble"` |
| `x` | number | X coordinate of the bubble body's top-left corner |
| `y` | number | Y coordinate of the bubble body's top-left corner |
| `w` | number | Width of the bubble body |
| `h` | number | Height of the bubble body |
| `text` | string | Text inside the bubble |
| `tailX` | number | X coordinate of the tail tip on the canvas (used when not anchored) |
| `tailY` | number | Y coordinate of the tail tip on the canvas (used when not anchored) |
| `color` | string | Color theme ID (e.g. `"green"`, `"blue"`, `"red"`) |
| `showTail` | boolean | Whether to show the tail (default: `true`) |
| `fontFamily` | string | Font family preset ID. Same options as code blocks. Defaults to `"default"` |
| `fontSize` | number | Font size in px (6–96). Can be typed directly or chosen from presets (11–48 px). Defaults to `13` |
| `tailAnchorId` | number \| null | ID of the tail-anchor binding (links the tail tip to a specific text occurrence in a code block). `null` when not anchored. |
| `tailAnchorFromId` | number \| null | Node ID of the code block that the tail is anchored to. `null` when not anchored. |
| `tailAnchorText` | string \| null | The selected text that the tail tip is anchored to. `null` when not anchored. |
| `tailAnchorLine` | number | 1-based line number in the source code block's raw text that identifies the anchor occurrence. `-1` when not set (all occurrences are highlighted). |
| `tailAnchorCol` | number | 0-based column number within `tailAnchorLine` that identifies the anchor occurrence. `-1` when not set. |

## Node object (frame)

A node is a frame when `type` is `"frame"`. Frames are used to visually group other nodes.

| Field | Type | Description |
|---|---|---|
| `id` | number | Unique node ID |
| `type` | string | Fixed value `"frame"` |
| `x` | number | X coordinate of the frame's top-left corner |
| `y` | number | Y coordinate of the frame's top-left corner |
| `w` | number | Width of the frame |
| `h` | number | Height of the frame |
| `label` | string | Label text displayed in the frame header |
| `color` | string | Color theme ID (e.g. `"blue"`, `"green"`, `"red"`) |
| `fontFamily` | string | Font family preset ID. Same options as code blocks. Defaults to `"default"` |
| `fontSize` | number | Font size in px (6–96). Can be typed directly or chosen from presets (10–32 px). Defaults to `12` |

## Link object

| Field | Type | Description |
|---|---|---|
| `id` | number | Unique link ID |
| `fromId` | number | ID of the source node |
| `text` | string | Text selected in the source node (anchor text) |
| `toId` | number | ID of the target node |
| `stroke` | string | Arrow color (CSS color string, default: `"#388bfd"`) |
| `strokeWidth` | number | Arrow width in pixels (default: `1.5`) |
| `dash` | string | SVG stroke-dasharray value (`""` = solid, `"8 4"` = dashed, `"16 6"` = long dash) |
| `anchorLine` | number | 1-based line number in the source block's raw text that identifies the arrow origin occurrence. `-1` means unset (no specific occurrence highlighted as primary). |
| `anchorCol` | number | 0-based column number within `anchorLine` that identifies the arrow origin occurrence. `-1` means unset. |

## FreeLine object

Freehand line drawn directly on the canvas.

| Field | Type | Description |
|---|---|---|
| `id` | number | Unique free-line ID |
| `points` | `{x, y}`[] | Array of canvas-coordinate points |
| `lineStyle` | string | Shape mode: `"polyline"`, `"curve"`, or `"straight"` |
| `stroke` | string | Line color (CSS color string) |
| `strokeWidth` | number | Line width in pixels |
| `dash` | string | SVG stroke-dasharray value (`""` = solid, `"8 4"` = dashed, etc.) |

## Viewport object

| Field | Type | Description |
|---|---|---|
| `x` | number | X offset of the viewport |
| `y` | number | Y offset of the viewport |
| `scale` | number | Zoom level |

## GlobalConfig object

Canvas-level metadata and a list of associated Git repositories. Configured via the "⎇ Global Config" button in the toolbar.

| Field | Type | Description |
|---|---|---|
| `description` | string | Free-text description of the canvas |
| `repositories` | Repository[] | List of associated Git repositories |

### Repository object

Each entry in `globalConfig.repositories` describes one Git repository. When a GitHub URL is provided, the commit hash is auto-resolved from the branch or tag name via the GitHub API.

| Field | Type | Description |
|---|---|---|
| `nickname` | string | Short display name for the repository (e.g. `"crun"`) |
| `url` | string | Repository URL (e.g. `"https://github.com/owner/repo"`) |
| `branch` | string | Branch name (e.g. `"main"`). When set, uses the HEAD commit of that branch. |
| `tag` | string | Tag name (e.g. `"v1.0.0"`). When set, uses the commit of that tag. |
| `commitHash` | string | Commit hash. Auto-resolved via the GitHub API when a branch/tag is specified. |

Specify either `branch` or `tag`, but not both. If both are omitted, `commitHash` is used as-is.

## Sample

```json
{
  "dataVersion": "3.2",
  "canvasTitle": "crun_code_reading",
  "nodes": [
    {
      "id": 1,
      "x": 88.25,
      "y": 225.65,
      "w": 989.5,
      "h": 2962.2,
      "code": "static int\ninit_container (...) { ... }",
      "lang": "cpp",
      "title": "init_container()",
      "filePath": "src/libcrun/linux.c",
      "showLineNumbers": true,
      "lineNumberStart": 1,
      "color": "blue"
    },
    {
      "id": 2,
      "type": "bubble",
      "x": 300.0,
      "y": 100.0,
      "w": 200,
      "h": 80,
      "text": "Namespaces are initialized here",
      "tailX": 250.0,
      "tailY": 220.0,
      "color": "green",
      "showTail": true,
      "tailAnchorId": null,
      "tailAnchorFromId": null,
      "tailAnchorText": null
    },
    {
      "id": 3,
      "type": "frame",
      "x": 50.0,
      "y": 180.0,
      "w": 1100.0,
      "h": 3100.0,
      "label": "Namespace setup",
      "color": "blue"
    }
  ],
  "links": [
    {
      "id": 1,
      "fromId": 1,
      "text": "get_fd_map",
      "toId": 3,
      "stroke": "#388bfd",
      "strokeWidth": 1.5,
      "dash": "",
      "anchorLine": 1,
      "anchorCol": 0
    }
  ],
  "freeLines": [
    {
      "id": 1,
      "points": [{"x": 200, "y": 300}, {"x": 350, "y": 280}, {"x": 500, "y": 320}],
      "lineStyle": "curve",
      "stroke": "#e6edf3",
      "strokeWidth": 2,
      "dash": ""
    }
  ],
  "nid": 7,
  "lid": 6,
  "flid": 2,
  "taid": 1,
  "vp": {
    "x": 76.9,
    "y": -6.8,
    "scale": 0.7
  },
  "globalConfig": {
    "description": "Reading the OCI runtime implementation",
    "repositories": [
      {
        "nickname": "crun",
        "url": "https://github.com/containers/crun",
        "branch": "main",
        "tag": "",
        "commitHash": "a1b2c3d4e5f6..."
      }
    ]
  }
}
```
