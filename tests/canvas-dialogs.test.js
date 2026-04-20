// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, afterAll, beforeEach } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

// Import canvas.js so the full app (including canvas-dialogs.js) initialises and
// populates globalThis.__canvasApp and globalThis.__canvasDialogs.
import '../canvas.js';

const { resolveBranch, resolveTag, parseGitHubUrl, describeFetchError } =
  globalThis.__canvasDialogs;

const { S, addNode, loadState } = globalThis.__canvasApp;

// ─── MSW server ────────────────────────────────────────────────────────────────
const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function resetState() {
  loadState({ nodes: [], links: [], nid: 1, lid: 1 });
  S.globalConfig = { repositories: [] };
}

beforeEach(resetState);

// ─── parseGitHubUrl ────────────────────────────────────────────────────────────
describe('parseGitHubUrl', () => {
  it('parses an HTTPS URL', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('parses a URL with .git suffix', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo.git')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('parses a git SSH URL', () => {
    expect(parseGitHubUrl('git@github.com:owner/repo')).toEqual({ owner: 'owner', repo: 'repo' });
  });

  it('parses a URL with trailing slash', () => {
    const result = parseGitHubUrl('https://github.com/owner/repo/');
    expect(result?.owner).toBe('owner');
    expect(result?.repo).toBe('repo');
  });

  it('returns null for a non-GitHub URL', () => {
    expect(parseGitHubUrl('https://gitlab.com/owner/repo')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseGitHubUrl('')).toBeNull();
  });

  it('returns null for an arbitrary string', () => {
    expect(parseGitHubUrl('not-a-url')).toBeNull();
  });
});

// ─── describeFetchError ────────────────────────────────────────────────────────
describe('describeFetchError', () => {
  it('returns a mixed-content message when on HTTPS fetching an HTTP target', () => {
    // jsdom defaults to about:blank so location.protocol is '', not 'https:'.
    // Simulate the HTTPS context by overriding location.protocol.
    const origDescriptor = Object.getOwnPropertyDescriptor(window, 'location');
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, protocol: 'https:' },
    });
    const msg = describeFetchError(new TypeError('Failed to fetch'), 'http://localhost:8080/api');
    expect(msg).toMatch(/HTTPS/);
    expect(msg).toMatch(/HTTP/);
    // Restore
    if (origDescriptor) Object.defineProperty(window, 'location', origDescriptor);
  });

  it('returns a "cannot reach server" message for a TypeError with an HTTPS target', () => {
    const msg = describeFetchError(new TypeError('Network error'), 'https://api.github.com/foo');
    expect(msg).toMatch(/Cannot reach server/i);
  });

  it('returns a generic message for non-TypeError errors', () => {
    const msg = describeFetchError(new Error('HTTP 500 Internal Server Error'), 'https://example.com');
    expect(msg).toMatch(/Fetch failed/i);
    expect(msg).toMatch(/HTTP 500/);
  });
});

// ─── resolveBranch ─────────────────────────────────────────────────────────────
describe('resolveBranch', () => {
  it('returns the HEAD commit SHA for a valid branch', async () => {
    server.use(
      http.get('https://api.github.com/repos/owner/repo/branches/main', () =>
        HttpResponse.json({ commit: { sha: 'abc123def456' } })
      )
    );
    const sha = await resolveBranch('owner', 'repo', 'main');
    expect(sha).toBe('abc123def456');
  });

  it('throws for a 404 response', async () => {
    server.use(
      http.get('https://api.github.com/repos/owner/repo/branches/nonexistent', () =>
        new HttpResponse(null, { status: 404 })
      )
    );
    await expect(resolveBranch('owner', 'repo', 'nonexistent')).rejects.toThrow('branch not found (HTTP 404)');
  });

  it('throws for a 403 response', async () => {
    server.use(
      http.get('https://api.github.com/repos/owner/repo/branches/main', () =>
        new HttpResponse(null, { status: 403 })
      )
    );
    await expect(resolveBranch('owner', 'repo', 'main')).rejects.toThrow('branch not found (HTTP 403)');
  });

  it('handles branch names with special characters (URL-encodes them)', async () => {
    server.use(
      http.get('https://api.github.com/repos/owner/repo/branches/feature%2Fmy-feature', () =>
        HttpResponse.json({ commit: { sha: 'featureSHA' } })
      )
    );
    const sha = await resolveBranch('owner', 'repo', 'feature/my-feature');
    expect(sha).toBe('featureSHA');
  });
});

// ─── resolveTag ───────────────────────────────────────────────────────────────
describe('resolveTag', () => {
  it('returns the commit SHA for a lightweight (commit-type) tag', async () => {
    server.use(
      http.get('https://api.github.com/repos/owner/repo/git/ref/tags/v1.0.0', () =>
        HttpResponse.json({ object: { type: 'commit', sha: 'commitSHA' } })
      )
    );
    const sha = await resolveTag('owner', 'repo', 'v1.0.0');
    expect(sha).toBe('commitSHA');
  });

  it('follows the two-level lookup for an annotated tag', async () => {
    server.use(
      http.get('https://api.github.com/repos/owner/repo/git/ref/tags/v2.0.0', () =>
        HttpResponse.json({ object: { type: 'tag', sha: 'tagObjectSHA' } })
      ),
      http.get('https://api.github.com/repos/owner/repo/git/tags/tagObjectSHA', () =>
        HttpResponse.json({ object: { sha: 'underlyingCommitSHA' } })
      )
    );
    const sha = await resolveTag('owner', 'repo', 'v2.0.0');
    expect(sha).toBe('underlyingCommitSHA');
  });

  it('throws for a 404 tag', async () => {
    server.use(
      http.get('https://api.github.com/repos/owner/repo/git/ref/tags/notexist', () =>
        new HttpResponse(null, { status: 404 })
      )
    );
    await expect(resolveTag('owner', 'repo', 'notexist')).rejects.toThrow('tag not found (HTTP 404)');
  });

  it('throws for a 404 on the second leg of an annotated tag lookup', async () => {
    server.use(
      http.get('https://api.github.com/repos/owner/repo/git/ref/tags/v3.0.0', () =>
        HttpResponse.json({ object: { type: 'tag', sha: 'tagSHA' } })
      ),
      http.get('https://api.github.com/repos/owner/repo/git/tags/tagSHA', () =>
        new HttpResponse(null, { status: 404 })
      )
    );
    await expect(resolveTag('owner', 'repo', 'v3.0.0')).rejects.toThrow('tag object not found (HTTP 404)');
  });

  it('throws when the API response has no object field', async () => {
    server.use(
      http.get('https://api.github.com/repos/owner/repo/git/ref/tags/broken', () =>
        HttpResponse.json({})
      )
    );
    await expect(resolveTag('owner', 'repo', 'broken')).rejects.toThrow('unexpected API response');
  });
});

// ─── fetch dialog — validation ────────────────────────────────────────────────
describe('fetch dialog validation', () => {
  function getEls() {
    return {
      overlay:      document.getElementById('fetch-dialog-overlay'),
      repoSelect:   document.getElementById('fetch-repo-select'),
      pathEl:       document.getElementById('fetch-path'),
      startEl:      document.getElementById('fetch-start'),
      endEl:        document.getElementById('fetch-end'),
      noteEl:       document.getElementById('fetch-note'),
      okBtn:        document.getElementById('fetch-ok'),
    };
  }

  it('shows an error when no repositories are configured', async () => {
    const { okBtn, noteEl } = getEls();
    S.globalConfig.repositories = [];
    okBtn.click();
    await Promise.resolve(); // flush microtasks
    expect(noteEl.textContent).toMatch(/No repositories configured/);
  });

  it('shows an error when file path is empty', async () => {
    const n = addNode(100, 100, '');
    S.globalConfig.repositories = [{ nickname: 'myrepo', url: 'https://github.com/owner/repo', commitHash: 'abc123', branch: '', tag: '' }];
    window.openFetchDialog(n.id);
    const { pathEl, startEl, endEl, okBtn, noteEl } = getEls();
    pathEl.value  = '';
    startEl.value = '1';
    endEl.value   = '10';
    okBtn.click();
    await Promise.resolve();
    expect(noteEl.textContent).toMatch(/enter a relative path/);
  });

  it('shows an error when start line is invalid', async () => {
    const n = addNode(100, 100, '');
    S.globalConfig.repositories = [{ nickname: 'myrepo', url: 'https://github.com/owner/repo', commitHash: 'abc123', branch: '', tag: '' }];
    window.openFetchDialog(n.id);
    const { pathEl, startEl, endEl, okBtn, noteEl } = getEls();
    pathEl.value  = 'src/main.js';
    startEl.value = '0';
    endEl.value   = '10';
    okBtn.click();
    await Promise.resolve();
    expect(noteEl.textContent).toMatch(/valid start line/);
  });

  it('shows an error when end line is less than start line', async () => {
    const n = addNode(100, 100, '');
    S.globalConfig.repositories = [{ nickname: 'myrepo', url: 'https://github.com/owner/repo', commitHash: 'abc123', branch: '', tag: '' }];
    window.openFetchDialog(n.id);
    const { pathEl, startEl, endEl, okBtn, noteEl } = getEls();
    pathEl.value  = 'src/main.js';
    startEl.value = '10';
    endEl.value   = '5';
    okBtn.click();
    await Promise.resolve();
    expect(noteEl.textContent).toMatch(/End line must be/);
  });

  it('shows an error when repository has no ref (branch/tag/commit)', async () => {
    const n = addNode(100, 100, '');
    S.globalConfig.repositories = [{ nickname: 'myrepo', url: 'https://github.com/owner/repo', commitHash: '', branch: '', tag: '' }];
    window.openFetchDialog(n.id);
    const { pathEl, startEl, endEl, okBtn, noteEl } = getEls();
    pathEl.value  = 'src/main.js';
    startEl.value = '1';
    endEl.value   = '10';
    okBtn.click();
    await Promise.resolve();
    expect(noteEl.textContent).toMatch(/branch, tag, or commit hash/);
  });
});

// ─── fetch dialog — success path ──────────────────────────────────────────────
describe('fetch dialog success', () => {
  it('populates the node code from the fetched file slice', async () => {
    const fileContent = 'line1\nline2\nline3\nline4\nline5\n';
    server.use(
      http.get('https://raw.githubusercontent.com/owner/repo/abc123/src/main.js', () =>
        HttpResponse.text(fileContent)
      )
    );

    const n = addNode(100, 100, '');
    S.globalConfig.repositories = [{ nickname: 'myrepo', url: 'https://github.com/owner/repo', commitHash: 'abc123', branch: '', tag: '' }];
    window.openFetchDialog(n.id);

    const pathEl  = document.getElementById('fetch-path');
    const startEl = document.getElementById('fetch-start');
    const endEl   = document.getElementById('fetch-end');
    const okBtn   = document.getElementById('fetch-ok');
    const noteEl  = document.getElementById('fetch-note');

    pathEl.value  = 'src/main.js';
    startEl.value = '2';
    endEl.value   = '4';
    okBtn.click();

    // Wait for fetch promise chain to resolve
    await new Promise(r => setTimeout(r, 50));

    expect(n.code).toBe('line2\nline3\nline4');
    expect(n.lineNumberStart).toBe(2);
    expect(n.showLineNumbers).toBe(true);
    expect(n.filePath).toBe('src/main.js');
    expect(noteEl.textContent).toMatch(/Fetched 3 line/);
  });

  it('strips a leading slash from the file path', async () => {
    const fileContent = 'alpha\nbeta\n';
    server.use(
      http.get('https://raw.githubusercontent.com/owner/repo/abc123/src/util.js', () =>
        HttpResponse.text(fileContent)
      )
    );

    const n = addNode(0, 0, '');
    S.globalConfig.repositories = [{ nickname: 'r', url: 'https://github.com/owner/repo', commitHash: 'abc123', branch: '', tag: '' }];
    window.openFetchDialog(n.id);

    document.getElementById('fetch-path').value  = '/src/util.js';
    document.getElementById('fetch-start').value = '1';
    document.getElementById('fetch-end').value   = '2';
    document.getElementById('fetch-ok').click();

    await new Promise(r => setTimeout(r, 50));
    expect(n.code).toBe('alpha\nbeta');
  });

  it('shows an error when the raw fetch returns a non-OK status', async () => {
    server.use(
      http.get('https://raw.githubusercontent.com/owner/repo/abc123/missing.js', () =>
        new HttpResponse(null, { status: 404, statusText: 'Not Found' })
      )
    );

    const n = addNode(0, 0, '');
    S.globalConfig.repositories = [{ nickname: 'r', url: 'https://github.com/owner/repo', commitHash: 'abc123', branch: '', tag: '' }];
    window.openFetchDialog(n.id);

    document.getElementById('fetch-path').value  = 'missing.js';
    document.getElementById('fetch-start').value = '1';
    document.getElementById('fetch-end').value   = '5';
    document.getElementById('fetch-ok').click();

    await new Promise(r => setTimeout(r, 50));
    expect(document.getElementById('fetch-note').textContent).toMatch(/Fetch failed/);
  });
});
