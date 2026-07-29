# Status: Poll After Animation, Then Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/status/<id>` page play the handoff animation fully, then poll the worker for ≤1 min and redirect to the DA canvas (`…/<id>/welcome`) on the first `201` or at the timeout — always landing in DA.

**Architecture:** The iframe (`tools/status/status.js`) posts a one-shot `status:animation-complete` message when its timeline finishes. The parent (`scripts/waiting.js`) stops polling on load; instead a one-shot `start()` fires on that message (validated by source+origin+type) or a ~3-min fallback, then a bounded poll window (hard-deadline timer + abortable 10s fetches) redirects to the DA canvas.

**Tech Stack:** Vanilla ES module JS (no build), AEM Edge Delivery Services, a Cloudflare Worker status API, da.live canvas. No linter (removed in #5) → `node --check` for syntax.

---

## Critical context for the implementer

- Two files change: `tools/status/status.js` (the iframe experience — adds the completion signal) and `scripts/waiting.js` (the parent — poll-after-animation orchestration). Do NOT change `tools/status/status.html`/`.css`, `404.html`, `branch-redirect.js`, or `aem.js`.
- The iframe is **same-origin** with the parent (it's `/tools/status/status.html` on the same host), so `window.location.origin` is shared and `postMessage` origin/source validation works.
- The "always redirect within 60s" guarantee must not depend on a fetch resolving — use an **independent hard-deadline timer** + an **abortable per-request timeout** + a **one-shot redirect guard** (a hung worker must not block the redirect).
- The redirect path is **`/welcome`** (not `/index`).
- No linter; validate with `node --check`.
- Cadence note: `POLL_INTERVAL_MS` (10s) is the interval scheduled *after* each fetch resolves or aborts — if a fetch reaches the 10s abort, the next poll starts ~10s later (so up to ~20s between starts in the worst case). This is fine: the independent 60s hard-deadline timer still guarantees the redirect, and an early `201` still redirects immediately.

## File Structure

- `tools/status/status.js` — **modify.** Post `status:animation-complete` once when `clock.t >= COMPRESSED_END`.
- `scripts/waiting.js` — **modify.** Replace immediate/indefinite polling with: start-on-signal-or-fallback → bounded 1-min poll window → always redirect to `…/<id>/welcome`.

---

## Task 1: Iframe posts a completion signal

**Files:**
- Modify: `tools/status/status.js`

- [ ] **Step 1: Add a one-shot signal in the main loop**

In `tools/status/status.js`, find the main loop:
```js
function loop(now) {
  clock.tick(now);
  cues.forEach((c, i) => {
    if (c.t <= clock.t && !fired.has(i)) { fired.add(i); c.fn(); }
  });
  requestAnimationFrame(loop);
}
```
Replace it with:
```js
let doneSignaled = false;

function loop(now) {
  clock.tick(now);
  if (!doneSignaled && clock.t >= COMPRESSED_END) {
    doneSignaled = true;
    // same-origin iframe → tell the parent the animation has finished
    window.parent.postMessage({ type: 'status:animation-complete' }, window.location.origin);
  }
  cues.forEach((c, i) => {
    if (c.t <= clock.t && !fired.has(i)) { fired.add(i); c.fn(); }
  });
  requestAnimationFrame(loop);
}
```
(`COMPRESSED_END` is already defined at the top of the file. When the page is opened directly — not in an iframe — `window.parent === window`, so this posts a harmless self-message that nobody listens for.)

- [ ] **Step 2: Syntax check**

Run: `node --check tools/status/status.js && echo "syntax OK"`
Expected: `syntax OK`.

- [ ] **Step 3: Confirm the signal is one-shot and references the right constant**

Run:
```bash
grep -nE "doneSignaled|status:animation-complete|clock.t >= COMPRESSED_END" tools/status/status.js
```
Expected: `let doneSignaled = false;`, the `clock.t >= COMPRESSED_END` guard, and the single `postMessage('status:animation-complete', window.location.origin)`.

- [ ] **Step 4: Commit**

```bash
git add tools/status/status.js
git commit -m "feat: status experience posts animation-complete to the parent" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Parent polls only after the animation, then always redirects

**Files:**
- Modify: `scripts/waiting.js`

- [ ] **Step 1: Overwrite `scripts/waiting.js` with EXACTLY this content**

```js
/*
 * Migration status waiting page.
 *
 * On a `/status/<id>` URL (served as a 404 because there is no such content),
 * embed the handoff "Preparing your page…" experience full-screen in an iframe
 * (tools/status/status.html). The experience plays to completion, then signals
 * the parent (postMessage 'status:animation-complete'). The parent then polls the
 * migration worker for up to 1 minute and redirects the top window to the DA
 * canvas (`…/<id>/welcome`) on the first terminal job (HTTP 201) OR when the
 * 1-minute window elapses — so it always lands in DA. A fallback timer starts the
 * same poll-and-redirect if the iframe never signals. Polls with no Authorization
 * header (the worker's no-token path returns status only).
 */

const STATUS_SEGMENT = 'status';
const WORKER_URL = 'https://vibemig-migration-backend-worker.franklin-prod.workers.dev/jobs/snowflake/';
const EXPERIENCE_URL = '/tools/status/status.html';
const ANIMATION_DONE = 'status:animation-complete';
const POLL_INTERVAL_MS = 10000;
const POLL_WINDOW_MS = 60000;
const FALLBACK_MS = 180000;
const ID_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Builds the DA canvas base URL (https://da.live/canvas#/{owner}/{site}/) for the
 * current site, deriving owner/site from the AEM host (e.g.
 * `1234--{site}--{owner}.aem.page`). Each per-user repo points at its own DA
 * project, so this must not be hardcoded. Falls back to the hlx proxy meta on
 * localhost.
 * @returns {string} the DA canvas base URL, trailing slash included
 */
function canvasBaseUrl() {
  let { hostname } = window.location;
  if (hostname === 'localhost') {
    hostname = document.querySelector('meta[property="hlx:proxyUrl"]')?.content || hostname;
  }
  const [, site, owner] = hostname.split('.')[0].split('--');
  if (!site || !owner) return 'https://da.live/canvas#/aemcoder/sendto/';
  return `https://da.live/canvas#/${owner}/${site}/`;
}

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
 * Hides the default 404 chrome and styles the full-viewport iframe.
 */
function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    html.status-waiting body { display: block; margin: 0; }
    html.status-waiting body > header,
    html.status-waiting body > footer,
    html.status-waiting body > main { display: none; }
    .status-frame {
      position: fixed; inset: 0; width: 100%; height: 100%;
      border: 0; z-index: 9999; background: #fff;
    }
  `;
  document.head.append(style);
}

/**
 * Embeds the handoff experience as a full-screen iframe.
 * @returns {HTMLIFrameElement} the created iframe
 */
function renderExperience() {
  const frame = document.createElement('iframe');
  frame.className = 'status-frame';
  frame.src = EXPERIENCE_URL;
  frame.title = 'Preparing your page';
  document.body.append(frame);
  return frame;
}

/**
 * Polls the worker for up to POLL_WINDOW_MS, then redirects the top window to the
 * DA canvas — on the first 201 or when the window elapses (always redirects). A
 * hard-deadline timer guarantees the redirect even if a fetch hangs; each fetch is
 * aborted after POLL_INTERVAL_MS; a one-shot guard prevents a double redirect.
 * @param {string} jobId the migration job id
 */
function pollWindow(jobId) {
  const target = `${canvasBaseUrl()}${jobId}/welcome`;
  let redirected = false;
  const go = () => {
    if (redirected) return;
    redirected = true;
    window.location.replace(target);
  };
  window.setTimeout(go, POLL_WINDOW_MS);
  async function poll() {
    if (redirected) return;
    try {
      const ctrl = new AbortController();
      const abortTimer = window.setTimeout(() => ctrl.abort(), POLL_INTERVAL_MS);
      const res = await fetch(`${WORKER_URL}${encodeURIComponent(jobId)}`, { cache: 'no-store', signal: ctrl.signal });
      window.clearTimeout(abortTimer);
      if (res.status === 201) { go(); return; }
    } catch (e) {
      // network blip / aborted slow fetch — keep polling within the window
    }
    if (!redirected) window.setTimeout(poll, POLL_INTERVAL_MS);
  }
  poll();
}

const id = statusId(window.location.pathname);
if (id) {
  document.documentElement.classList.add('status-waiting');
  document.title = 'Preparing your page…';
  injectStyles();
  const frame = renderExperience();

  // Begin polling only after the animation finishes (the iframe posts
  // ANIMATION_DONE), or after a safety fallback if it never signals.
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    pollWindow(id);
  };
  window.addEventListener('message', (e) => {
    if (e.source === frame.contentWindow
      && e.origin === window.location.origin
      && e.data && e.data.type === ANIMATION_DONE) {
      start();
    }
  });
  window.setTimeout(start, FALLBACK_MS);
}
```

- [ ] **Step 2: Syntax check**

Run: `node --check scripts/waiting.js && echo "syntax OK"`
Expected: `syntax OK`.

- [ ] **Step 3: Confirm the key behaviors are present**

Run:
```bash
grep -nE "POLL_WINDOW_MS = 60000|FALLBACK_MS = 180000|POLL_INTERVAL_MS = 10000|/welcome|AbortController|setTimeout\(go, POLL_WINDOW_MS\)|e.source === frame.contentWindow|setTimeout\(start, FALLBACK_MS\)" scripts/waiting.js
! grep -q "pollUntilReady" scripts/waiting.js && echo "pollUntilReady removed"
! grep -q "/index" scripts/waiting.js && echo "/index removed"
```
Expected: the constants, `/welcome`, `AbortController`, the hard-deadline `setTimeout(go, …)`, the source check, and the fallback are all present; then `pollUntilReady removed` and `/index removed` print (the `! grep -q` form exits 0 when the token is absent, so it's safe under command chaining).

- [ ] **Step 4: Commit**

```bash
git add scripts/waiting.js
git commit -m "feat: poll the worker only after the animation, then redirect to DA /welcome" \
  -m "Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Verify on the preview

- [ ] **Step 1: Push**

```bash
git push -u origin status-poll-after-animation
```

- [ ] **Step 2: Confirm the files are served and updated**

After Code Sync builds the branch, presence-check each marker (don't rely on a
line count — several markers appear on multiple lines):
```bash
BASE="https://status-poll-after-animation--sendto--aemcoder.aem.page"
W=$(curl -s --compressed "$BASE/scripts/waiting.js")
for tok in 'POLL_WINDOW_MS = 60000' '/welcome' 'AbortController' 'status:animation-complete'; do
  printf '%s'  "$W" | grep -q -- "$tok" && echo "ok: $tok" || echo "MISSING: $tok"
done
curl -s --compressed "$BASE/tools/status/status.js" | grep -q "status:animation-complete" && echo "ok: status.js signal" || echo "MISSING: status.js signal"
```
Expected: every line prints `ok: …` (the deployed files carry the new code).

- [ ] **Step 3: Headless behavior check — no polling during the animation**

The full flow takes ~130s (animation) + ≤60s (poll). For a quick confirmation that polling does NOT start during the animation, render `/status/<id>` headlessly for ~12s and check the **net-log** (a reliable record of every request, unlike Chrome's verbose stderr) for the worker host:
```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; PROFILE=$(mktemp -d)
timeout 20 "$CHROME" --headless=new --disable-gpu --no-sandbox --no-first-run --user-data-dir="$PROFILE" --disk-cache-dir=/dev/null --log-net-log=/tmp/netlog.json --virtual-time-budget=12000 --dump-dom "https://status-poll-after-animation--sendto--aemcoder.aem.page/status/probe-1" >/tmp/sd.html 2>/dev/null
echo "iframe present: $(grep -c 'src=\"/tools/status/status.html\"' /tmp/sd.html)"
echo "worker requests in first ~12s (expect 0): $(grep -c 'jobs/snowflake' /tmp/netlog.json 2>/dev/null)"
```
Expected: the iframe is present, and **0** worker requests in the first ~12s (polling hasn't started — it waits for the animation). The `--virtual-time-budget` exits Chrome cleanly so the net-log flushes. This is a best-effort smoke check; the authoritative confirmation is the manual end-to-end below (or temporarily shrinking the constants on a throwaway commit to watch the 201/timeout redirect to `/welcome`).

- [ ] **Step 4: Record manual end-to-end for the PR**

Note in the PR: with the real timings, open `/status/<id>`; the animation plays fully; ~130s in, polling begins (10s cadence); the page redirects to `…/<id>/welcome` on the first `201` or ~60s later (whichever first).

---

## Self-Review (completed by plan author)

- **Spec coverage:** iframe completion signal (Task 1), parent start-on-signal-or-fallback (Task 2), bounded poll window with hard deadline + abortable fetch + one-shot redirect (Task 2 `pollWindow`), source+origin+type validation (Task 2 listener), `/welcome` target (Task 2), `canvasBaseUrl()` reuse (Task 2), constants 10s/60s/180s (Task 2), verification incl. "no polling during animation" (Task 3). ✓
- **Placeholder scan:** none — every step has concrete code/commands. ✓
- **Type/name consistency:** `doneSignaled`, `ANIMATION_DONE`/`'status:animation-complete'`, `pollWindow`, `go`, `start`, `started`, `redirected`, `frame`, `POLL_INTERVAL_MS`/`POLL_WINDOW_MS`/`FALLBACK_MS` are used identically across the two files and tasks. The iframe sends `{ type: 'status:animation-complete' }`; the parent matches `e.data.type === ANIMATION_DONE` (same string). ✓
