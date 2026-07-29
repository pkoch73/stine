# Migration Status Waiting Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `main--sendto--aemcoder.<domain>/status/<id>` a DA-styled "preparing your page" screen that polls the migration worker and, on a terminal (`201`) job, redirects to the DA canvas.

**Architecture:** Reserve the `status` segment in the existing branch-redirect so `/status/…` is no longer bounced to a branch host (it stays on `main` and 404s). A new self-contained `scripts/waiting.js`, loaded first by `404.html`, detects the `/status/<id>` path, takes over the page with an injected DA-styled overlay, polls the worker every 30s for up to 20 min, and redirects to the canvas on `201`.

**Tech Stack:** Vanilla ES module JavaScript (no build), AEM Edge Delivery Services, a Cloudflare Worker status API, da.live canvas. ESLint airbnb-base; Node for the existing pure-function test.

---

## Critical context for the implementer

- **`scripts/waiting.js` is self-contained** — it imports nothing (no DOM-coupled `scripts.js`, no `aem.js`), so there is no Node-import problem and no `import/*` cycle. It runs its logic at module load.
- **It must load BEFORE `scripts.js`** in `404.html` so it takes over the page before `scripts.js` reveals the default 404 content (no flash). The `body { display:none }`-until-`.appear` rule in `styles/styles.css` means nothing paints until then anyway; `waiting.js` forces its overlay visible via `html.status-waiting body { display:block }`.
- **No `scripts.js` change.** The branch-redirect still runs on the 404 page for normal ids (today's behavior); `getBranchRedirectUrl('/status/<id>')` returns `null` after Task 1, so it does not redirect and `waiting.js` owns the page.
- **The worker is polled with no `Authorization` header** (status-only path): `200`=running, `201`=terminal→redirect, `404`/error=keep polling. Only the HTTP status is read; the body is ignored. CORS is `*` (verified).
- ESLint runs `eslint .` over `scripts/` (so `waiting.js` must lint clean); the `.mjs` test is not linted; do not modify `scripts/aem.js`.

## File Structure

- `scripts/branch-redirect.js` — **modify.** Reserve the `status` segment.
- `test/branch-redirect.test.mjs` — **modify.** Add the reserved-segment case.
- `scripts/waiting.js` — **new.** The waiting page: path detection, DA overlay, poll loop, redirect.
- `404.html` — **modify.** Load `waiting.js` before `scripts.js`.

---

## Task 1: Reserve the `status` segment in the redirect

**Files:**
- Modify: `scripts/branch-redirect.js`
- Test: `test/branch-redirect.test.mjs`

- [ ] **Step 1: Add the failing test case**

In `test/branch-redirect.test.mjs`, find:
```js
  ['da.live content host excluded', loc('content.da.live', '/aemcoder/sendto/1234'), null],
];
```
Replace with:
```js
  ['da.live content host excluded', loc('content.da.live', '/aemcoder/sendto/1234'), null],
  ['reserved status segment', loc('main--sendto--aemcoder.aem.page', '/status/abc123'), null],
];
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test/branch-redirect.test.mjs`
Expected: FAIL on `reserved status segment` — currently returns `https://status--sendto--aemcoder.aem.page/status/abc123` instead of `null`. (`node_modules` not needed for the test; run `npm install` first only if lint needs it later.)

- [ ] **Step 3: Add the reserved-segment list and check**

In `scripts/branch-redirect.js`, find:
```js
const DEFAULT_BRANCH = 'main';
```
Replace with:
```js
const DEFAULT_BRANCH = 'main';
const RESERVED_SEGMENTS = ['status'];
```

Then find:
```js
  const segment = pathname.split('/')[1] || '';
  if (!segment || segment === DEFAULT_BRANCH) return null;
```
Replace with:
```js
  const segment = pathname.split('/')[1] || '';
  if (!segment || segment === DEFAULT_BRANCH) return null;

  // reserved segments are handled by dedicated pages (e.g. /status/<id> by the
  // migration waiting page), not redirected to a branch host
  if (RESERVED_SEGMENTS.includes(segment)) return null;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test/branch-redirect.test.mjs`
Expected: all cases `PASS`, then `ALL PASS`, exit 0.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: exit 0, no errors. (Run `npm install` first if `node_modules` is missing — it is gitignored, do not commit it.)

- [ ] **Step 6: Commit**

```bash
git add scripts/branch-redirect.js test/branch-redirect.test.mjs
git commit -m "feat: reserve /status segment from the branch redirect"
```
End the commit body with:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 2: The waiting page module + 404.html wiring

**Files:**
- Create: `scripts/waiting.js`
- Modify: `404.html`

- [ ] **Step 1: Create `scripts/waiting.js`**

```js
/*
 * Migration status waiting page.
 *
 * On a `/status/<id>` URL (served as a 404 because there is no such content),
 * show a DA-styled "preparing your page" screen and poll the migration worker.
 * When the job is terminal (HTTP 201), redirect to the DA canvas for the doc.
 * Any other status keeps polling, up to a 20-minute cap, after which the normal
 * 404 page is revealed.
 *
 * Self-contained: no imports, runs at module load. Polls with no Authorization
 * header (the worker's no-token path returns status only).
 */

const STATUS_SEGMENT = 'status';
const WORKER_URL = 'https://migration-backend-worker.paolo-moz.workers.dev/jobs/snowflake/';
const CANVAS_URL = 'https://da.live/canvas#/aemcoder/sendto/';
const POLL_INTERVAL_MS = 30000;
const TIMEOUT_MS = 20 * 60 * 1000;
const ID_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Extracts the job id from a `/status/<id>` pathname.
 * @param {string} pathname location pathname
 * @returns {string|null} the id, or null when this is not a status path
 */
function statusId(pathname) {
  const parts = pathname.split('/');
  const segment = parts[1];
  const value = parts[2];
  if (segment !== STATUS_SEGMENT || !value || !ID_RE.test(value)) return null;
  return value;
}

/**
 * Injects the DA-styled overlay CSS.
 */
function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    html.status-waiting body { display: block; }
    html.status-waiting body > header,
    html.status-waiting body > footer,
    html.status-waiting body > main { display: none; }
    .status-waiting-screen {
      position: fixed; inset: 0; z-index: 9999;
      display: flex; flex-direction: column; gap: 24px;
      align-items: center; justify-content: center;
      padding: 24px; text-align: center;
      background: #fff; color: #2c2c2c;
      font-family: 'Adobe Clean', -apple-system, system-ui, sans-serif;
    }
    .status-waiting-screen h1 { margin: 0; font-size: 24px; font-weight: 700; }
    .status-waiting-screen p { margin: 0; max-width: 32rem; font-size: 16px; color: #6e6e6e; }
    .status-waiting-spinner {
      width: 48px; height: 48px; border-radius: 50%;
      border: 4px solid #e6e6e6; border-top-color: #1473e6;
      animation: status-waiting-spin 1s linear infinite;
    }
    @keyframes status-waiting-spin { to { transform: rotate(360deg); } }
  `;
  document.head.append(style);
}

/**
 * Builds and appends the waiting overlay.
 * @returns {HTMLElement} the overlay element
 */
function renderScreen() {
  const screen = document.createElement('div');
  screen.className = 'status-waiting-screen';
  screen.innerHTML = `
    <div class="status-waiting-spinner" role="status" aria-label="Loading"></div>
    <h1>We&rsquo;re preparing your page</h1>
    <p>This usually takes a moment. You&rsquo;ll be redirected automatically as soon as it&rsquo;s ready.</p>
  `;
  document.body.append(screen);
  return screen;
}

/**
 * Reveals the normal 404 page after the timeout.
 * @param {HTMLElement} screenEl the overlay element
 */
function showFallback404(screenEl) {
  document.documentElement.classList.remove('status-waiting');
  screenEl.remove();
}

/**
 * Polls the migration worker until the job is terminal, then redirects.
 * @param {string} jobId the migration job id
 * @param {HTMLElement} screenEl the overlay element
 */
function pollUntilReady(jobId, screenEl) {
  const start = Date.now();
  const target = `${CANVAS_URL}${jobId}/index`;
  async function poll() {
    try {
      const res = await fetch(`${WORKER_URL}${encodeURIComponent(jobId)}`, { cache: 'no-store' });
      if (res.status === 201) {
        window.location.replace(target);
        return;
      }
    } catch (e) {
      // network blip — keep polling
    }
    if (Date.now() - start >= TIMEOUT_MS) {
      showFallback404(screenEl);
      return;
    }
    window.setTimeout(poll, POLL_INTERVAL_MS);
  }
  poll();
}

const id = statusId(window.location.pathname);
if (id) {
  document.documentElement.classList.add('status-waiting');
  injectStyles();
  pollUntilReady(id, renderScreen());
}
```

- [ ] **Step 2: Load `waiting.js` before `scripts.js` in `404.html`**

In `404.html`, find:
```html
  <script nonce="aem" src="/scripts/scripts.js" type="module"></script>
```
Replace with:
```html
  <script nonce="aem" src="/scripts/waiting.js" type="module"></script>
  <script nonce="aem" src="/scripts/scripts.js" type="module"></script>
```

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: exit 0, no errors (`scripts/waiting.js` lints clean under airbnb-base).

- [ ] **Step 4: Confirm the redirect test still passes**

Run: `node test/branch-redirect.test.mjs`
Expected: `ALL PASS`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/waiting.js 404.html
git commit -m "feat: DA-styled status waiting page polling the migration worker"
```
End the commit body with:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 3: Push, verify on preview, tune the look

- [ ] **Step 1: Push the branch**

```bash
git push -u origin status-waiting-page
```

- [ ] **Step 2: Verify on the branch preview**

The trigger is path-based, so it runs on the branch host too. Open:
`https://status-waiting-page--sendto--aemcoder.aem.page/status/test-123`
Confirm in DevTools:
- The DA-styled overlay renders immediately (no flash of the default "Page not found").
- The Network tab shows a `GET …/jobs/snowflake/test-123` firing immediately and then every 30s.
- For a status that returns `201`, the page `location.replace`s to `https://da.live/canvas#/aemcoder/sendto/test-123/index`. (Ask the user for a real terminal job id to see the redirect; an unknown id returns `404` and keeps polling, which is expected.)

- [ ] **Step 3: Tune the styling with the user**

Share the preview URL; adjust the overlay CSS/copy in `scripts/waiting.js` (`injectStyles`/`renderScreen`) to match da.live to the user's satisfaction. Commit any tweaks.

---

## Self-Review (completed by plan author)

- **Spec coverage:** reserve `status` (Task 1), worker poll with status mapping `201`→redirect / others→keep polling (Task 2 `pollUntilReady`), DA-styled overlay + no-flash takeover (Task 2 `injectStyles`/`renderScreen` + load-before-`scripts.js`), 20-min cap → fallback 404 (Task 2 `showFallback404`), canvas redirect URL (Task 2 `target`), no `scripts.js` change (none present), manual verification incl. branch-preview testability (Task 3). ✓
- **Placeholder scan:** none — every code/command step is complete. ✓
- **Type/name consistency:** `STATUS_SEGMENT`, `WORKER_URL`, `CANVAS_URL`, `statusId`, `injectStyles`, `renderScreen`, `showFallback404`, `pollUntilReady`, `RESERVED_SEGMENTS`, and the `status-waiting` class are used identically across tasks. Param names (`jobId`, `screenEl`) avoid shadowing the module-level `id`. ✓
- **Lint ordering:** `waiting.js` has no imports (no `import/*` issues); functions are declared before use; `catch (e)` matches the repo's lint-clean pattern. ✓
