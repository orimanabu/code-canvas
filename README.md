# Overview

A browser-based tool for reading and understanding source code. Visually organize and connect code snippets on an infinite canvas.

![screenshot1](images/screenshot-1.png)

![screenshot2](images/screenshot-2.png)

# Features

- **Code blocks**: Place code inside resizable rectangles. Each block can have a title and file path.
- **Syntax highlighting**: Language is auto-detected from the code content and highlighted accordingly.
- **Links**: Select a string (e.g. a function name) inside a code block and connect it to another block with an arrow. Click to jump to the target.
- **Infinite canvas**: Miro-style navigation (drag to pan, Cmd+drag to zoom, v/h to switch modes).
- **Save / Load**: Export and import as JSON.


# Running the Web Server

`serve.py` starts a local HTTP server so that the WASM binary (`ctags-wasm.wasm`) can be loaded directly by the browser, without the CORS restrictions of the `file://` protocol.

**Requirements**: Go 1.21+ (no external dependencies)

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

The server opens `http://localhost:8765/code-canvas/canvas.html` in the browser automatically.

When a JSON file is specified, its contents are loaded into the canvas on startup and also written to `localStorage`, so the state is preserved across page refreshes.

# JSON Output Format

## Top level

| Field | Type | Description |
|---|---|---|
| `canvasTitle` | string | Title of the entire canvas |
| `nodes` | Node[] | Array of code blocks |
| `links` | Link[] | Array of links |
| `nid` | number | Counter for the next node ID to assign |
| `lid` | number | Counter for the next link ID to assign |
| `vp` | Viewport | Viewport state |
| `gitConfig` | GitConfig | Git repository settings associated with the canvas |

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
| `tailX` | number | X coordinate of the tail tip on the canvas (movable independently of the body) |
| `tailY` | number | Y coordinate of the tail tip on the canvas (movable independently of the body) |
| `color` | string | Color theme ID (e.g. `"green"`, `"blue"`, `"red"`) |

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

## Link object

| Field | Type | Description |
|---|---|---|
| `id` | number | Unique link ID |
| `fromId` | number | ID of the source node |
| `text` | string | Text selected in the source node (anchor text) |
| `toId` | number | ID of the target node |

## Viewport object

| Field | Type | Description |
|---|---|---|
| `x` | number | X offset of the viewport |
| `y` | number | Y offset of the viewport |
| `scale` | number | Zoom level |

## GitConfig object

Git repository information associated with the entire canvas. Configured via the "⎇ Git Config" button in the toolbar.
When a GitHub URL is provided, the commit hash is auto-resolved from the branch or tag name via the GitHub API.

| Field | Type | Description |
|---|---|---|
| `url` | string | Repository URL (e.g. `"https://github.com/owner/repo"`) |
| `branch` | string | Branch name (e.g. `"main"`). When set, uses the HEAD commit of that branch. |
| `tag` | string | Tag name (e.g. `"v1.0.0"`). When set, uses the commit of that tag. |
| `commitHash` | string | Commit hash. Auto-resolved via the GitHub API when a branch/tag is specified. |

Specify either `branch` or `tag`, but not both. If both are omitted, `commitHash` is used as-is.

## Sample

```json
{
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
      "color": "green"
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
      "toId": 3
    }
  ],
  "nid": 7,
  "lid": 6,
  "vp": {
    "x": 76.9,
    "y": -6.8,
    "scale": 0.7
  },
  "gitConfig": {
    "url": "https://github.com/containers/crun",
    "branch": "main",
    "tag": "",
    "commitHash": "a1b2c3d4e5f6..."
  }
}
```
