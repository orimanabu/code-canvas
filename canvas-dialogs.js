import { esc, NODE_COLORS } from './canvas-utils.js';

// Module-level vars populated by initDialogs()
let S, wrap, canvasTitleEl;
let renderNode, ndEl, autoFitNode;
let addBubble, addFrame, getSelectedIds;
let pushUndo, scheduleSave, saveState;
let setStatus, s2c, resizeCanvasTitleInput;

export function initDialogs(deps) {
  ({ S, wrap, canvasTitleEl,
     renderNode, ndEl, autoFitNode,
     addBubble, addFrame, getSelectedIds,
     pushUndo, scheduleSave, saveState,
     setStatus, s2c, resizeCanvasTitleInput } = deps);

  initRepoDialog();
  initGlobalConfigDialog();
  initGroupFrameDialog();
  initFetchDialog();
  initCodeSnippetdDialog();
  initHelpDialog();
  initAlertDialog();
}

// ═══════════════════════════════════════════════════════
// GIT UTILITIES
// ═══════════════════════════════════════════════════════
function parseGitHubUrl(url) {
  const m = url.trim().match(/github\.com[:/]([^/]+)\/([^/.?\s]+)/);
  return m ? { owner: m[1], repo: m[2] } : null;
}

// ═══════════════════════════════════════════════════════
// GIT RESOLVE HELPERS (shared)
// ═══════════════════════════════════════════════════════
async function resolveBranch(owner, repo, branch) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`
  );
  if (!res.ok) throw new Error(`branch not found (HTTP ${res.status})`);
  const data = await res.json();
  return data.commit?.sha ?? null;
}

async function resolveTag(owner, repo, tag) {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/ref/tags/${encodeURIComponent(tag)}`
  );
  if (!res.ok) throw new Error(`tag not found (HTTP ${res.status})`);
  const data = await res.json();
  if (!data.object) throw new Error('unexpected API response');
  if (data.object.type === 'commit') return data.object.sha;
  if (data.object.type === 'tag') {
    const res2 = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/tags/${data.object.sha}`
    );
    if (!res2.ok) throw new Error(`tag object not found (HTTP ${res2.status})`);
    const data2 = await res2.json();
    return data2.object?.sha ?? null;
  }
  return null;
}

// Returns a human-readable error message for a failed fetch to a codesnippetd endpoint.
// Distinguishes mixed-content blocking (HTTPS page → HTTP server) from other network
// failures and HTTP-level errors so the user knows what to fix.
function describeFetchError(e, targetUrl) {
  if (e instanceof TypeError) {
    // TypeError means the request never reached the server (network-level failure).
    // On Safari, HTTPS pages cannot fetch HTTP URLs — not even localhost — and the
    // browser surfaces this as a TypeError with a message about "access control checks".
    if (location.protocol === 'https:' && targetUrl.startsWith('http://')) {
      return '✗ Connection blocked: this page is served over HTTPS but the codesnippetd endpoint uses HTTP. '
           + 'Safari blocks this (mixed content). Fix: open canvas.html from a local server (http://localhost/...) or use Chrome.';
    }
    // Server not running, wrong port, or other network failure.
    return `✗ Cannot reach server — is codesnippetd running? (${e.message})`;
  }
  return `✗ Fetch failed: ${e.message}`;
}

// ═══════════════════════════════════════════════════════
// REPO SUB-DIALOG
// ═══════════════════════════════════════════════════════
function initRepoDialog() {
  const overlay      = document.getElementById('repo-dialog-overlay');
  const nicknameEl   = document.getElementById('repo-nickname');
  const urlEl        = document.getElementById('repo-url');
  const branchEl     = document.getElementById('repo-branch');
  const tagEl        = document.getElementById('repo-tag');
  const commitEl     = document.getElementById('repo-commit');
  const noteEl       = document.getElementById('repo-resolve-note');
  const localTreeEl  = document.getElementById('repo-local-tree');
  const tagsFileEl   = document.getElementById('repo-tags-file');
  const saveBtn      = document.getElementById('repo-save');
  const cancelBtn    = document.getElementById('repo-cancel');

  let _onSave = null;

  function setNote(msg, type) {
    noteEl.textContent = msg;
    noteEl.className = 'git-form-note' + (type ? ' ' + type : '');
  }

  // Auto-fill nickname from URL last path segment (only when not manually edited)
  urlEl.addEventListener('input', () => {
    if (nicknameEl.dataset.manuallyEdited) return;
    const parts = urlEl.value.trim().replace(/\/$/, '').split('/').filter(Boolean);
    nicknameEl.value = parts[parts.length - 1] || '';
  });
  nicknameEl.addEventListener('input', () => {
    nicknameEl.dataset.manuallyEdited = '1';
  });

  // Auto-fill tags file from local source tree
  localTreeEl.addEventListener('input', () => {
    const tree = localTreeEl.value.trim().replace(/\/$/, '');
    tagsFileEl.value = tree ? tree + '/tags' : '';
  });

  function close() { overlay.style.display = 'none'; }

  window.openRepoDialog = function (existingRepo, onSave) {
    _onSave = onSave;
    nicknameEl.dataset.manuallyEdited  = existingRepo ? '1' : '';
    nicknameEl.value  = existingRepo?.nickname   ?? '';
    urlEl.value       = existingRepo?.url        ?? '';
    branchEl.value    = existingRepo?.branch     ?? '';
    tagEl.value       = existingRepo?.tag        ?? '';
    commitEl.value    = existingRepo?.commitHash ?? '';
    localTreeEl.value = existingRepo?.localTree  ?? '';
    tagsFileEl.value  = existingRepo?.tagsFile   ?? '';
    setNote('', '');
    overlay.style.display = 'flex';
    urlEl.focus();
  };

  saveBtn.addEventListener('click', async () => {
    const nickname  = nicknameEl.value.trim();
    const url       = urlEl.value.trim();
    const branch    = branchEl.value.trim();
    const tag       = tagEl.value.trim();
    let   commit    = commitEl.value.trim();
    const localTree = localTreeEl.value.trim();
    const tagsFile  = tagsFileEl.value.trim();

    if (!nickname) { setNote('⚠ Please enter a nickname.', 'warn'); return; }
    if (!url)      { setNote('⚠ Please enter a repository URL.', 'warn'); return; }

    if (branch && tag) {
      setNote('⚠ Both branch and tag are filled. Please specify only one.', 'warn');
      return;
    }

    const needResolve = (branch || tag) && !commit;
    if (needResolve) {
      const gh = parseGitHubUrl(url);
      if (!gh) {
        setNote('Not a GitHub URL — skipping commit hash auto-resolution.', 'warn');
        finish(nickname, url, branch, tag, '', localTree, tagsFile);
        return;
      }
      saveBtn.disabled = true;
      setNote('⏳ Resolving commit hash...', '');
      try {
        if (branch) {
          commit = await resolveBranch(gh.owner, gh.repo, branch);
          setNote(`✓ HEAD of ${branch}: ${commit.slice(0, 12)}…`, 'ok');
        } else {
          commit = await resolveTag(gh.owner, gh.repo, tag);
          setNote(`✓ Commit for ${tag}: ${commit.slice(0, 12)}…`, 'ok');
        }
      } catch (e) {
        setNote(`✗ Resolution failed: ${e.message}`, 'err');
        saveBtn.disabled = false;
        return;
      }
      saveBtn.disabled = false;
    }

    finish(nickname, url, branch, tag, commit, localTree, tagsFile);
  });

  function finish(nickname, url, branch, tag, commitHash, localTree, tagsFile) {
    if (_onSave) _onSave({ nickname, url, branch, tag, commitHash, localTree, tagsFile });
    close();
  }

  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') close();
  });
}

// ═══════════════════════════════════════════════════════
// GLOBAL CONFIG DIALOG
// ═══════════════════════════════════════════════════════
function initGlobalConfigDialog() {
  const overlay   = document.getElementById('global-config-overlay');
  const titleEl   = document.getElementById('gc-canvas-title');
  const descEl    = document.getElementById('gc-description');
  const reposWrap = document.getElementById('gc-repos-wrap');
  const addBtn    = document.getElementById('gc-add-repo');
  const saveBtn   = document.getElementById('gc-save');
  const cancelBtn = document.getElementById('gc-cancel');

  let editingRepos = [];

  function renderReposTable() {
    if (editingRepos.length === 0) {
      reposWrap.innerHTML = '<div class="gc-repos-empty">No repositories configured.</div>';
      return;
    }
    const rows = editingRepos.map((r, i) => {
      const hash = r.commitHash ? r.commitHash.slice(0, 12) + '…' : '—';
      return `<tr>
        <td title="${esc(r.nickname)}">${esc(r.nickname)}</td>
        <td title="${esc(r.url)}">${esc(r.url)}</td>
        <td>${esc(r.branch || '—')}</td>
        <td>${esc(r.tag || '—')}</td>
        <td>${esc(hash)}</td>
        <td class="gc-repo-actions">
          <button class="gc-repo-btn" data-action="edit" data-i="${i}">Edit</button>
          <button class="gc-repo-btn del" data-action="del" data-i="${i}">Delete</button>
        </td>
      </tr>`;
    }).join('');
    reposWrap.innerHTML = `<table class="gc-repos-table">
      <thead><tr>
        <th>Nickname</th><th>URL</th><th>Branch</th><th>Tag</th><th>Commit Hash</th><th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
    reposWrap.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = parseInt(btn.dataset.i, 10);
        if (btn.dataset.action === 'del') {
          editingRepos.splice(i, 1);
          renderReposTable();
        } else {
          window.openRepoDialog(editingRepos[i], updated => {
            editingRepos[i] = updated;
            renderReposTable();
          });
        }
      });
    });
  }

  function open() {
    titleEl.value = canvasTitleEl.value;
    descEl.value  = S.globalConfig.description || '';
    editingRepos  = (S.globalConfig.repositories || []).map(r => ({ ...r }));
    renderReposTable();
    overlay.style.display = 'flex';
    titleEl.focus();
  }

  function close() { overlay.style.display = 'none'; }

  addBtn.addEventListener('click', () => {
    window.openRepoDialog(null, repo => {
      editingRepos.push(repo);
      renderReposTable();
    });
  });

  saveBtn.addEventListener('click', () => {
    const newTitle = titleEl.value.trim() || 'Untitled canvas';
    canvasTitleEl.value = newTitle;
    document.title = newTitle;
    resizeCanvasTitleInput();
    S.globalConfig.description  = descEl.value;
    S.globalConfig.repositories = editingRepos.map(r => ({ ...r }));
    saveState();
    close();
    setStatus('Global config saved');
  });

  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') close();
  });

  document.getElementById('btn-add-bubble').addEventListener('click', () => {
    const vw = wrap.clientWidth, vh = wrap.clientHeight;
    const p = s2c(vw / 2, vh / 2);
    addBubble(p.x - 100, p.y - 50);
  });

  document.getElementById('btn-global-config').addEventListener('click', open);
}

// ═══════════════════════════════════════════════════════
// GROUP FRAME DIALOG
// ═══════════════════════════════════════════════════════
function initGroupFrameDialog() {
  const overlay       = document.getElementById('group-dialog-overlay');
  const labelInput    = document.getElementById('group-label-input');
  const swatchesEl    = document.getElementById('group-color-swatches');
  const cancelBtn     = document.getElementById('group-cancel');
  const okBtn         = document.getElementById('group-ok');
  if (!overlay || !okBtn) return;
  let selectedColor   = 'blue';

  function getNonFrameSelectedIds() {
    return getSelectedIds().filter(id => {
      const n = S.nodes.find(n => n.id === id);
      return n && n.type !== 'frame';
    });
  }

  function openGroupDialog() {
    selectedColor = 'blue';
    labelInput.value = '';
    swatchesEl.innerHTML = NODE_COLORS.map(c =>
      `<span class="color-swatch${c.id === selectedColor ? ' active' : ''}" data-color="${c.id}" style="background:${c.hex}" title="${c.label}"></span>`
    ).join('');
    swatchesEl.querySelectorAll('.color-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        selectedColor = sw.dataset.color;
        swatchesEl.querySelectorAll('.color-swatch').forEach(s =>
          s.classList.toggle('active', s.dataset.color === selectedColor));
      });
    });
    overlay.style.display = 'flex';
    labelInput.focus();
  }

  function closeDialog() { overlay.style.display = 'none'; }

  okBtn.addEventListener('click', () => {
    const ids = getNonFrameSelectedIds();
    const PAD_H = 28, PAD_TOP = 52, PAD_BOT = 28;
    let fx, fy, fw, fh;
    if (ids.length < 1) {
      // No selection: place a default-sized frame at the viewport center
      const p = s2c(wrap.clientWidth / 2, wrap.clientHeight / 2);
      fw = 600; fh = 400;
      fx = p.x - fw / 2; fy = p.y - fh / 2;
    } else {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      ids.forEach(id => {
        const n = S.nodes.find(n => n.id === id);
        if (!n) return;
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x + n.w);
        maxY = Math.max(maxY, n.y + n.h);
      });
      fx = minX - PAD_H; fy = minY - PAD_TOP;
      fw = (maxX - minX) + PAD_H * 2;
      fh = (maxY - minY) + PAD_TOP + PAD_BOT;
    }
    addFrame(fx, fy, fw, fh, labelInput.value.trim(), selectedColor);
    closeDialog();
    setStatus('Frame created');
  });

  cancelBtn.addEventListener('click', closeDialog);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDialog(); });
  labelInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') okBtn.click();
    if (e.key === 'Escape') closeDialog();
  });

  document.getElementById('btn-group').addEventListener('click', openGroupDialog);
}

// ═══════════════════════════════════════════════════════
// GIT SNIPPET FETCH DIALOG
// ═══════════════════════════════════════════════════════
function initFetchDialog() {
  const overlay    = document.getElementById('fetch-dialog-overlay');
  const repoSelect = document.getElementById('fetch-repo-select');
  const infoEl     = document.getElementById('fetch-git-info');
  const pathEl     = document.getElementById('fetch-path');
  const startEl    = document.getElementById('fetch-start');
  const endEl      = document.getElementById('fetch-end');
  const noteEl     = document.getElementById('fetch-note');
  const okBtn      = document.getElementById('fetch-ok');
  const cancelBtn  = document.getElementById('fetch-cancel');
  let targetNodeId = null;

  function setNote(msg, type) {
    noteEl.textContent = msg;
    noteEl.className = 'git-form-note' + (type ? ' ' + type : '');
  }

  function updateInfo() {
    const repos = S.globalConfig.repositories || [];
    if (repos.length === 0) {
      infoEl.textContent = '⚠ No repositories configured. Please add one via "⎇ Global Config".';
      infoEl.className = 'git-form-note warn';
      return;
    }
    const gc = repos[repoSelect.selectedIndex] ?? repos[0];
    if (!gc) return;
    const ref = gc.commitHash ? gc.commitHash.slice(0, 12) + '…'
              : gc.branch     ? `branch: ${gc.branch}`
              : gc.tag        ? `tag: ${gc.tag}`
              : '(no ref set)';
    infoEl.textContent = `${gc.url}  /  ${ref}`;
    infoEl.className = 'git-form-note ok';
  }

  repoSelect.addEventListener('change', updateInfo);

  function close() { overlay.style.display = 'none'; }

  window.openFetchDialog = function (nodeId) {
    targetNodeId = nodeId;
    const n = S.nodes.find(n => n.id === nodeId);
    pathEl.value  = n?.filePath ?? '';
    startEl.value = '';
    endEl.value   = '';
    setNote('', '');

    // Populate repo select
    const repos = S.globalConfig.repositories || [];
    repoSelect.innerHTML = repos.map(r => `<option>${esc(r.nickname)}</option>`).join('');
    updateInfo();

    overlay.style.display = 'flex';
    pathEl.focus();
  };

  okBtn.addEventListener('click', async () => {
    const repos = S.globalConfig.repositories || [];
    if (repos.length === 0) { setNote('⚠ No repositories configured. Please add one via Global Config.', 'err'); return; }
    const gc = repos[repoSelect.selectedIndex] ?? repos[0];
    if (!gc || !gc.url) { setNote('⚠ Selected repository has no URL.', 'err'); return; }
    const gh = parseGitHubUrl(gc.url);
    if (!gh) { setNote('⚠ Only GitHub URLs are supported.', 'err'); return; }
    const ref = gc.commitHash || gc.branch || gc.tag;
    if (!ref) { setNote('⚠ Please set a branch, tag, or commit hash for this repository in Global Config.', 'err'); return; }

    const filePath  = pathEl.value.trim();
    const startLine = parseInt(startEl.value, 10);
    const endLine   = parseInt(endEl.value, 10);
    if (!filePath)                             { setNote('⚠ Please enter a relative path.', 'err'); return; }
    if (isNaN(startLine) || startLine < 1)     { setNote('⚠ Please enter a valid start line number.', 'err'); return; }
    if (isNaN(endLine) || endLine < startLine) { setNote('⚠ End line must be ≥ start line.', 'err'); return; }

    okBtn.disabled = true;
    setNote('⏳ Fetching…', '');
    try {
      const cleanPath = filePath.replace(/^\//, '');
      const rawUrl = `https://raw.githubusercontent.com/${gh.owner}/${gh.repo}/${ref}/${cleanPath}`;
      const res = await fetch(rawUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const text  = await res.text();
      const lines = text.split('\n');
      const sliced = lines.slice(startLine - 1, endLine);
      // Trim trailing empty line if the file ends with \n
      if (sliced.length > 0 && sliced[sliced.length - 1] === '') sliced.pop();
      const code = sliced.join('\n');

      const n = S.nodes.find(n => n.id === targetNodeId);
      if (!n) { setNote('⚠ Node not found.', 'err'); okBtn.disabled = false; return; }
      pushUndo();
      n.code            = code;
      n.filePath        = filePath;
      n.lineNumberStart = startLine;
      n.showLineNumbers = true;
      renderNode(n, ndEl(n.id));
      autoFitNode(n);
      scheduleSave();
      setNote(`✓ Fetched ${sliced.length} line(s).`, 'ok');
      setTimeout(close, 900);
    } catch (e) {
      setNote(`✗ Fetch failed: ${e.message}`, 'err');
    }
    okBtn.disabled = false;
  });

  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') close();
  });
}

// ═══════════════════════════════════════════════════════
// CODESNIPPETD DIALOG
// ═══════════════════════════════════════════════════════
function initCodeSnippetdDialog() {
  const overlay          = document.getElementById('codesnippetd-dialog-overlay');
  const endpointEl       = document.getElementById('csd-endpoint');
  const apiTabsEl        = document.getElementById('csd-api-tabs');
  const useCtagsEl       = document.getElementById('csd-use-ctags');
  let   currentApiType   = 'snippets';
  const sourceAreaEl     = document.getElementById('csd-source-area');
  const sourceRadios     = document.querySelectorAll('input[name="csd-source"]');
  const repoSectionEl    = document.getElementById('csd-repo-section');
  const manualSectionEl  = document.getElementById('csd-manual-section');
  const repoSelectEl     = document.getElementById('csd-repo-select');
  const contextEl        = document.getElementById('csd-context');
  const tagsEl           = document.getElementById('csd-tags');
  const keywordEl        = document.getElementById('csd-keyword');
  const noteEl           = document.getElementById('csd-note');
  const fetchBtn         = document.getElementById('csd-fetch');
  const cancelBtn        = document.getElementById('csd-cancel');
  const mainForm         = document.getElementById('codesnippetd-main-form');
  const resultsDiv       = document.getElementById('codesnippetd-results');
  const tableWrap        = document.getElementById('csd-table-wrap');
  const resultsNoteEl    = document.getElementById('csd-results-note');
  const backBtn          = document.getElementById('csd-results-back');
  const resultsCancelBtn = document.getElementById('csd-results-cancel');
  const wasmResultsDiv   = document.getElementById('codesnippetd-wasm-results');
  const wasmStatusEl     = document.getElementById('csd-wasm-status');
  const wasmTableWrap    = document.getElementById('csd-wasm-table-wrap');
  const wasmBackBtn      = document.getElementById('csd-wasm-back');
  const wasmCancelBtn    = document.getElementById('csd-wasm-cancel');
  const wasmOkBtn        = document.getElementById('csd-wasm-ok');

  let targetNodeId       = null;
  let pendingFetch       = null; // { endpoint, keyword }
  let pendingPipeItem    = null; // /pipe response
  let pendingCtagsName   = null; // first tag name from ctags

  // ── ctags-wasm integration ──────────────────────────────────────────
  let _ctagsCaptured = '';
  let _ctagsModule   = null;
  let _ctagsInitProm = null;

  function ensureCtags() {
    if (_ctagsModule)   return Promise.resolve(_ctagsModule);
    if (_ctagsInitProm) return _ctagsInitProm;
    if (typeof CTagsModule === 'undefined') return Promise.resolve(null);
    _ctagsInitProm = CTagsModule({
      print:    line => { _ctagsCaptured += line + '\n'; },
      printErr: ()   => {},
    }).then(m => {
      m._ctags_init();
      _ctagsModule = m;
      return m;
    }).catch(() => null);
    return _ctagsInitProm;
  }

  async function runCtagsFull(code, filename) {
    const m = await ensureCtags();
    if (!m) return { firstTagName: null, tags: [] };
    m.ccall('ctags_set_output_format', null, ['string'], ['json']);
    _ctagsCaptured = '';
    const enc = new TextEncoder().encode(code);
    m.ccall('ctags_parse_buffer', null, ['string', 'array', 'number'], [filename, enc, enc.length]);
    const tags = [];
    let firstTagName = null;
    for (const line of _ctagsCaptured.trim().split('\n')) {
      try {
        const t = JSON.parse(line);
        if (t._type === 'tag' && t.name) {
          if (!firstTagName) firstTagName = t.name;
          tags.push(t);
        }
      } catch (_) {}
    }
    return { firstTagName, tags };
  }
  // ───────────────────────────────────────────────────────────────────

  function getSourceMode() {
    return document.querySelector('input[name="csd-source"]:checked')?.value ?? 'repo';
  }

  function updateSourceUI() {
    const isRepo = getSourceMode() === 'repo';
    repoSectionEl.style.display   = isRepo ? '' : 'none';
    manualSectionEl.style.display = isRepo ? 'none' : '';
  }

  sourceRadios.forEach(r => r.addEventListener('change', updateSourceUI));

  function updateApiTypeUI() {
    const isPipe = currentApiType === 'pipe';
    sourceAreaEl.style.opacity = isPipe ? '0.4' : '';
    sourceAreaEl.querySelectorAll('input, select').forEach(el => el.disabled = isPipe);
    keywordEl.disabled = isPipe;
    keywordEl.closest('.git-form-row').style.opacity = isPipe ? '0.4' : '';
    useCtagsEl.disabled = !isPipe;
    useCtagsEl.parentElement.style.opacity = isPipe ? '' : '0.4';
    fetchBtn.disabled = false;
    if (!isPipe) updateSourceUI();
  }

  apiTabsEl.addEventListener('click', e => {
    const tab = e.target.closest('.csd-tab');
    if (!tab) return;
    currentApiType = tab.dataset.value;
    apiTabsEl.querySelectorAll('.csd-tab').forEach(t => t.classList.toggle('active', t === tab));
    updateApiTypeUI();
  });

  function setNote(msg, type) {
    noteEl.textContent = msg;
    noteEl.className = 'git-form-note' + (type ? ' ' + type : '');
  }

  function setResultsNote(msg, type) {
    resultsNoteEl.textContent = msg;
    resultsNoteEl.className = 'git-form-note' + (type ? ' ' + type : '');
  }

  function close() {
    overlay.style.display = 'none';
    showMain();
  }

  function showMain() {
    mainForm.style.display       = '';
    resultsDiv.style.display     = 'none';
    wasmResultsDiv.style.display = 'none';
  }

  function showResults() {
    mainForm.style.display       = 'none';
    resultsDiv.style.display     = '';
    wasmResultsDiv.style.display = 'none';
  }

  function showWasmResults() {
    mainForm.style.display       = 'none';
    resultsDiv.style.display     = 'none';
    wasmResultsDiv.style.display = '';
  }

  function setWasmStatus(msg, type) {
    wasmStatusEl.textContent = msg;
    wasmStatusEl.className = 'git-form-note' + (type ? ' ' + type : '');
  }

  function buildWasmTable(tags) {
    if (tags.length === 0) {
      wasmTableWrap.innerHTML = '<div style="font-size:12px;color:#8b949e;padding:8px;">No tags found</div>';
      return;
    }
    const FIXED = ['name', 'kind', 'line', 'pattern'];
    const keys  = FIXED.filter(k => tags.some(t => t[k] != null));
    const header = '<tr><th>#</th>' + keys.map(k => `<th>${esc(k)}</th>`).join('') + '</tr>';
    const rows = tags.map((t, i) => {
      const cells = keys.map(k => {
        let val = t[k] != null ? String(t[k]) : '';
        if (k === 'pattern') val = val.replace(/^\/\^?/, '').replace(/\$?\/$/, '').trim();
        return `<td>${esc(val)}</td>`;
      }).join('');
      return `<tr class="csd-wasm-row"><td>${i + 1}</td>${cells}</tr>`;
    }).join('');
    wasmTableWrap.innerHTML =
      `<table class="csd-table"><thead>${header}</thead><tbody>${rows}</tbody></table>`;
  }

  window.openCodeSnippetdDialog = function (nodeId, initialKeyword) {
    targetNodeId = nodeId;
    pendingFetch = null;
    setNote('', '');
    // Populate repo dropdown from globalConfig
    const repos = S.globalConfig.repositories || [];
    if (repos.length === 0) {
      repoSelectEl.innerHTML = '<option value="">— No repositories configured —</option>';
    } else {
      repoSelectEl.innerHTML = repos.map((r, i) =>
        `<option value="${i}">${esc(r.nickname)}</option>`
      ).join('');
      // Restore last selected repo nickname
      const lastNickname = localStorage.getItem('code-canvas-last-repo-nickname');
      if (lastNickname) {
        const idx = repos.findIndex(r => r.nickname === lastNickname);
        if (idx >= 0) repoSelectEl.selectedIndex = idx;
      }
    }
    if (initialKeyword) keywordEl.value = initialKeyword;
    updateApiTypeUI();
    showMain();
    overlay.style.display = 'flex';
    if (currentApiType !== 'pipe') keywordEl.focus();
  };

  async function fetchAndInsert(endpoint, keyword, index, context, tags) {
    let url = `http://${endpoint}/snippets/${encodeURIComponent(keyword)}`;
    const qp = new URLSearchParams();
    if (context) qp.set('context', context);
    if (tags)    qp.set('tags', tags);
    if (qp.toString()) url += `?${qp.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0) throw new Error('Empty snippets response');
    const item = list[index];
    if (!item || typeof item.code !== 'string') throw new Error('Invalid snippet at index ' + index);
    const n = S.nodes.find(n => n.id === targetNodeId);
    if (!n) throw new Error('Node not found');
    n.code = item.code;
    n.title = keyword;
    if (typeof item.path === 'string' && item.path) n.filePath = item.path;
    if (typeof item.start === 'number' && item.start > 0) {
      n.lineNumberStart = item.start;
      n.showLineNumbers = true;
    }
    renderNode(n, ndEl(n.id));
    autoFitNode(n);
    scheduleSave();
    close();
    setStatus('Snippet inserted');
  }

  function buildResultsTable(tags) {
    // Collect all unique keys across every row (excluding internal _type field).
    const keySet = new Set();
    tags.forEach(tag => {
      if (typeof tag === 'object' && tag !== null) {
        Object.keys(tag).forEach(k => { if (k !== '_type') keySet.add(k); });
      }
    });
    const FIXED = ['name', 'path', 'pattern', 'kind'];
    const rest  = Array.from(keySet).filter(k => !FIXED.includes(k)).sort();
    const keys  = [...FIXED.filter(k => keySet.has(k)), ...rest];

    const headerCells = keys.map(k => `<th>${esc(k)}</th>`).join('');

    const tbody = tags.map((tag, i) => {
      const cells = typeof tag === 'object' && tag !== null
        ? keys.map(k => `<td>${tag[k] !== undefined ? esc(String(tag[k])) : ''}</td>`).join('')
        : `<td colspan="${keys.length || 1}">${esc(String(tag))}</td>`;
      return `<tr class="csd-result-row" data-index="${i}"><td>${i + 1}</td>${cells}</tr>`;
    }).join('');

    tableWrap.innerHTML = `
      <table class="csd-table">
        <thead><tr><th>#</th>${headerCells}</tr></thead>
        <tbody>${tbody}</tbody>
      </table>`;

    tableWrap.querySelectorAll('.csd-result-row').forEach(row => {
      row.addEventListener('click', async () => {
        const index = parseInt(row.dataset.index, 10);
        setResultsNote('⏳ Fetching snippet…', '');
        try {
          await fetchAndInsert(pendingFetch.endpoint, pendingFetch.keyword, index, pendingFetch.context, pendingFetch.tags);
        } catch (e) {
          setResultsNote(`✗ Failed: ${e.message}`, 'err');
        }
      });
    });
  }

  fetchBtn.addEventListener('click', async () => {
    const endpoint = endpointEl.value.trim();
    if (!endpoint) { setNote('⚠ API Endpoint is required.', 'err'); return; }

    if (currentApiType === 'pipe') {
      fetchBtn.disabled = true;
      setNote('⏳ Fetching…', '');
      try {
        const res = await fetch(`http://${endpoint}/pipe`);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const item = await res.json();
        if (!item || typeof item.code !== 'string') throw new Error('Invalid /pipe response');

        pendingPipeItem  = item;
        pendingCtagsName = null;
        setNote('', '');

        if (useCtagsEl.checked) {
          // Switch to wasm results pane
          wasmOkBtn.disabled = true;
          wasmTableWrap.innerHTML = '';
          setWasmStatus('⏳ Running ctags-wasm…', '');
          showWasmResults();

          const { firstTagName, tags } = await runCtagsFull(item.code, item.path || 'input');
          pendingCtagsName = firstTagName;
          setWasmStatus('✓ Ctags-wasm complete', 'ok');
          buildWasmTable(tags);
          wasmOkBtn.disabled = false;
        } else {
          // Apply immediately without ctags
          applyPipeItem();
        }
      } catch (e) {
        showMain();
        setNote(describeFetchError(e, `http://${endpoint}/pipe`), 'err');
      }
      fetchBtn.disabled = false;
      return;
    }

    // /snippets mode
    let context, tags;
    if (getSourceMode() === 'repo') {
      const repos = S.globalConfig.repositories || [];
      if (repos.length === 0) { setNote('⚠ No repositories configured. Please add one via "⎇ Global Config".', 'err'); return; }
      const repo = repos[repoSelectEl.selectedIndex] ?? repos[0];
      context = repo.localTree || '';
      tags    = repo.tagsFile  || '';
      // Persist selected repo nickname for next open
      if (repo.nickname) localStorage.setItem('code-canvas-last-repo-nickname', repo.nickname);
    } else {
      context = contextEl.value.trim();
      tags    = tagsEl.value.trim();
    }
    const keyword  = keywordEl.value.trim();
    if (!keyword) { setNote('⚠ Keyword is required.', 'err'); return; }

    let tagsUrl = `http://${endpoint}/tags/${encodeURIComponent(keyword)}`;
    const qParams = new URLSearchParams();
    if (context) qParams.set('context', context);
    if (tags)    qParams.set('tags', tags);
    if (qParams.toString()) tagsUrl += `?${qParams.toString()}`;

    fetchBtn.disabled = true;
    setNote('⏳ Fetching…', '');
    try {
      const res = await fetch(tagsUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      const tagList = await res.json();
      if (!Array.isArray(tagList)) throw new Error('Expected a JSON array from /tags');

      if (tagList.length === 0) {
        setNote('⚠ No snippets found for this keyword.', 'warn');
        fetchBtn.disabled = false;
        return;
      }

      if (tagList.length === 1) {
        await fetchAndInsert(endpoint, keyword, 0, context, tags);
      } else {
        pendingFetch = { endpoint, keyword, context, tags };
        setResultsNote('', '');
        buildResultsTable(tagList);
        showResults();
      }
    } catch (e) {
      setNote(describeFetchError(e, tagsUrl), 'err');
    }
    fetchBtn.disabled = false;
  });

  function applyPipeItem() {
    const item = pendingPipeItem;
    if (!item) return;
    const n = S.nodes.find(n => n.id === targetNodeId);
    if (!n) { close(); return; }
    n.code = item.code;
    if (typeof item.title === 'string' && item.title) n.title = item.title;
    if (typeof item.lang  === 'string' && item.lang)  n.lang  = item.lang;
    if (typeof item.path  === 'string' && item.path)  n.filePath = item.path;
    if (typeof item.start === 'number' && item.start > 0) {
      n.lineNumberStart = item.start;
      n.showLineNumbers = true;
    }
    if (pendingCtagsName) n.title = pendingCtagsName;
    renderNode(n, ndEl(n.id));
    autoFitNode(n);
    scheduleSave();
    close();
    setStatus('Snippet inserted via /pipe');
  }

  wasmOkBtn.addEventListener('click', applyPipeItem);

  wasmBackBtn.addEventListener('click', () => { showMain(); });
  wasmCancelBtn.addEventListener('click', close);
  backBtn.addEventListener('click', showMain);
  resultsCancelBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') { close(); return; }
    if (e.key === 'Enter' && mainForm.style.display !== 'none') fetchBtn.click();
  });
}

// ═══════════════════════════════════════════════════════
// TEST EXPORTS (Node.js / Vitest only — not used in browser)
// ═══════════════════════════════════════════════════════
if (typeof globalThis !== 'undefined' && typeof process !== 'undefined') {
  globalThis.__canvasDialogs = { resolveBranch, resolveTag, parseGitHubUrl, describeFetchError };
}

// ═══════════════════════════════════════════════════════
// HELP DIALOG
// ═══════════════════════════════════════════════════════
function initHelpDialog() {
  const overlay = document.getElementById('help-dialog-overlay');
  const closeBtn = document.getElementById('help-close');

  document.getElementById('btn-help').addEventListener('click', () => {
    overlay.style.display = 'flex';
  });
  closeBtn.addEventListener('click', () => { overlay.style.display = 'none'; });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && overlay.style.display !== 'none') overlay.style.display = 'none';
  });
}

// ═══════════════════════════════════════════════════════
// ALERT DIALOG
// ═══════════════════════════════════════════════════════
let _alertOverlay, _alertMsgEl;

function initAlertDialog() {
  _alertOverlay = document.getElementById('alert-dialog-overlay');
  _alertMsgEl   = document.getElementById('alert-dialog-message');
  const okBtn   = document.getElementById('alert-dialog-ok');

  function close() { _alertOverlay.style.display = 'none'; }
  okBtn.addEventListener('click', close);
  _alertOverlay.addEventListener('click', e => { if (e.target === _alertOverlay) close(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && _alertOverlay.style.display !== 'none') close();
  });
}

export function showAlert(message, type) {
  _alertMsgEl.textContent = message;
  _alertMsgEl.className = 'git-form-note' + (type ? ' ' + type : '');
  _alertOverlay.style.display = 'flex';
}
