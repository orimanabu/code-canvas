/**
 * DOM setup for canvas.js integration tests.
 * Runs before canvas.js is imported, so all elements that canvas.js
 * accesses at module load time (addEventListener calls in IIFEs etc.)
 * must be present here.
 *
 * Also mocks `hljs` (loaded from CDN in the browser, unavailable in Node).
 */

// Guard: this file is also listed in setupFiles for node-environment tests
// (canvas-utils), where `document` doesn't exist. Skip DOM setup in that case.
if (typeof document === 'undefined') {
  // eslint-disable-next-line no-undef
  globalThis.hljs = undefined;
} else {
  // Mock highlight.js — returns code as-is without syntax highlighting
  globalThis.hljs = {
    highlight:     (code)       => ({ value: code }),
    highlightAuto: (code)       => ({ value: code, language: 'text' }),
  };

  // Mock localStorage — jsdom may not provide a functional localStorage
  // (requires a proper http:// URL, not about:blank).
  const _store = {};
  globalThis.localStorage = {
    getItem:    (key)      => Object.prototype.hasOwnProperty.call(_store, key) ? _store[key] : null,
    setItem:    (key, val) => { _store[key] = String(val); },
    removeItem: (key)      => { delete _store[key]; },
    clear:      ()         => { Object.keys(_store).forEach(k => delete _store[k]); },
  };

  // Minimal HTML structure that canvas.js requires at load time.
  // Includes all elements whose .addEventListener() is called in module-level IIFEs.
  document.body.innerHTML = `
    <div id="toolbar">
      <input id="canvas-title">
      <span id="mode-indicator"></span>
      <button id="btn-add"></button>
      <button id="btn-add-bubble"></button>
      <button id="btn-group"></button>
      <button id="btn-global-config"></button>
      <button id="btn-export"></button>
      <input type="file" id="btn-import">
      <button id="btn-clear"></button>
      <button id="btn-help"></button>
      <button id="btn-zoom-out"></button>
      <button id="btn-zoom-fit"></button>
      <button id="btn-zoom-in"></button>
      <input id="zoom-input">
    </div>
    <div id="wrap">
      <svg id="svg-tails"></svg>
      <div id="canvas"></div>
      <div id="marquee"></div>
      <svg id="svg-links">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6"/>
          </marker>
        </defs>
        <path id="link-preview" style="display:none"/>
      </svg>
    </div>
    <div id="link-tip">
      <button id="link-tip-link"></button>
      <button id="link-tip-newblock"></button>
    </div>
    <div id="link-ctx"><button id="link-ctx-del"></button></div>
    <div id="status"></div>

    <!-- Global Config Dialog -->
    <div id="global-config-overlay" style="display:none;">
      <input id="gc-canvas-title"><textarea id="gc-description"></textarea>
      <div id="gc-repos-wrap"></div>
      <button id="gc-add-repo"></button>
      <button id="gc-save"></button><button id="gc-cancel"></button>
    </div>

    <!-- Repo Sub-Dialog -->
    <div id="repo-dialog-overlay" style="display:none;">
      <input id="repo-nickname"><input id="repo-url"><input id="repo-branch">
      <input id="repo-tag"><input id="repo-commit">
      <div id="repo-resolve-note"></div>
      <input id="repo-local-tree"><input id="repo-tags-file">
      <button id="repo-save"></button><button id="repo-cancel"></button>
    </div>

    <!-- Group Frame Dialog -->
    <div id="group-dialog-overlay" style="display:none;">
      <input id="group-label-input">
      <div id="group-color-swatches"></div>
      <button id="group-cancel"></button><button id="group-ok"></button>
    </div>

    <!-- Git Fetch Dialog -->
    <div id="fetch-dialog-overlay" style="display:none;">
      <select id="fetch-repo-select"></select>
      <div id="fetch-git-info"></div>
      <input id="fetch-path"><input id="fetch-start"><input id="fetch-end">
      <div id="fetch-note"></div>
      <button id="fetch-ok"></button><button id="fetch-cancel"></button>
    </div>

    <!-- Codesnippetd Dialog -->
    <div id="codesnippetd-dialog-overlay" style="display:none;">
      <div id="codesnippetd-main-form">
        <input id="csd-endpoint">
        <div id="csd-api-tabs">
          <button class="csd-tab active" data-value="snippets">/snippets</button>
          <button class="csd-tab" data-value="pipe">/pipe</button>
        </div>
        <input type="checkbox" id="csd-use-ctags" checked>
        <input id="csd-context"><input id="csd-keyword">
        <div id="csd-note"></div>
        <button id="csd-fetch"></button><button id="csd-cancel"></button>
      </div>
      <div id="codesnippetd-results" style="display:none;">
        <div id="csd-table-wrap"></div>
        <div id="csd-results-note"></div>
        <button id="csd-results-back"></button><button id="csd-results-cancel"></button>
      </div>
      <div id="codesnippetd-wasm-results" style="display:none;">
        <div id="csd-wasm-status"></div>
        <div id="csd-wasm-table-wrap"></div>
        <button id="csd-wasm-back"></button>
        <button id="csd-wasm-cancel"></button>
        <button id="csd-wasm-ok" disabled></button>
      </div>
    </div>

    <!-- Help Dialog -->
    <div id="help-dialog-overlay" style="display:none;">
      <button id="help-close"></button>
    </div>
  `;
}
