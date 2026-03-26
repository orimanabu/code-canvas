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

  // Minimal HTML structure that canvas.js requires at load time.
  // Includes all elements whose .addEventListener() is called in module-level IIFEs.
  document.body.innerHTML = `
    <div id="toolbar">
      <input id="canvas-title">
      <span id="mode-indicator"></span>
      <button id="btn-add"></button>
      <button id="btn-add-bubble"></button>
      <button id="btn-git-config"></button>
      <button id="btn-export"></button>
      <input type="file" id="btn-import">
      <button id="btn-clear"></button>
      <button id="btn-help"></button>
    </div>
    <div id="wrap">
      <div id="canvas"></div>
      <svg id="svg-links">
        <defs>
          <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6"/>
          </marker>
        </defs>
      </svg>
    </div>
    <div id="link-tip"></div>
    <div id="status"></div>

    <!-- Git Config Dialog -->
    <div id="git-dialog-overlay" style="display:none;">
      <input id="git-url"><input id="git-branch"><input id="git-tag">
      <input id="git-commit"><div id="git-resolve-note"></div>
      <button id="git-save"></button><button id="git-cancel"></button>
    </div>

    <!-- Git Fetch Dialog -->
    <div id="fetch-dialog-overlay" style="display:none;">
      <div id="fetch-git-info"></div>
      <input id="fetch-path"><input id="fetch-start"><input id="fetch-end">
      <div id="fetch-note"></div>
      <button id="fetch-ok"></button><button id="fetch-cancel"></button>
    </div>

    <!-- Codesnippetd Dialog -->
    <div id="codesnippetd-dialog-overlay" style="display:none;">
      <div id="codesnippetd-main-form">
        <input id="csd-endpoint"><input id="csd-context"><input id="csd-keyword">
        <div id="csd-note"></div>
        <button id="csd-fetch"></button><button id="csd-cancel"></button>
      </div>
      <div id="codesnippetd-results" style="display:none;">
        <div id="csd-table-wrap"></div>
        <div id="csd-results-note"></div>
        <button id="csd-results-back"></button><button id="csd-results-cancel"></button>
      </div>
    </div>

    <!-- Help Dialog -->
    <div id="help-dialog-overlay" style="display:none;">
      <button id="help-close"></button>
    </div>
  `;
}
