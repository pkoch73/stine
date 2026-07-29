# Status redirect from worker `daUrl` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redirect the `/status/<id>` waiting page using the `daUrl` from the migration worker's un-authenticated status body (the correct per-user DA repo) instead of deriving the DA host from the current `sendto` router host.

**Architecture:** A new pure module `scripts/status-target.js` holds two testable helpers — `isDaCanvasUrl` (host + canvas-path-shape guard) and `welcomeUrl` (swap the last path segment to `welcome`). `scripts/waiting.js` imports them: it parses each poll's JSON body, caches a validated `daUrl`, redirects to it on HTTP 201 (index) and to its welcome variant on the CTA, and keeps waiting when there's no `daUrl`. `canvasBaseUrl()` is deleted.

**Tech Stack:** Vanilla ES modules (no build). `node --check` is the syntax gate; pure helpers are unit-tested with `node test/<name>.test.mjs` (mirrors `test/branch-redirect.test.mjs`). No repo linter.

**Spec:** `docs/superpowers/specs/2026-06-17-status-daurl-redirect-design.md` (codex-reviewed CLEAR; the `isDaCanvasUrl` path-shape tightening is folded in).

**Branch:** `status-daurl-redirect` (off `main`).

**Worker contract (un-authenticated `GET /jobs/snowflake/:jobId`):** body `{ "daUrl": "https://da.live/canvas#/{owner}/{site}/{jobId}/index" }` on every poll; HTTP `200` = running, `201` = terminal (success OR failure), `404` = unknown (empty body). `daUrl` is present from the first response. `WORKER_URL` stays franklin-prod (unchanged).

---

## Task 1: Pure helper module `scripts/status-target.js` (TDD)

**Files:**
- Create: `test/status-target.test.mjs`
- Create: `scripts/status-target.js`

- [ ] **Step 1: Write the failing test**

Create `test/status-target.test.mjs` with exactly:

```js
import assert from 'node:assert/strict';
import { isDaCanvasUrl, welcomeUrl } from '../scripts/status-target.js';

let failures = 0;
const check = (name, actual, expected) => {
  try {
    assert.equal(actual, expected);
    process.stdout.write(`PASS  ${name}\n`);
  } catch (err) {
    failures += 1;
    process.stdout.write(`FAIL  ${name}: ${err.message}\n`);
  }
};

// welcomeUrl: replace the last path segment with 'welcome'
check('index -> welcome',
  welcomeUrl('https://da.live/canvas#/aemcoder/sendto/df92ef3c/index'),
  'https://da.live/canvas#/aemcoder/sendto/df92ef3c/welcome');
check('trailing slash tolerated',
  welcomeUrl('https://da.live/canvas#/aemcoder/sendto/df92ef3c/index/'),
  'https://da.live/canvas#/aemcoder/sendto/df92ef3c/welcome');
check('per-user repo host preserved',
  welcomeUrl('https://da.live/canvas#/aemcoder/ca3fa77e6c1f/1c7514b6d325/index'),
  'https://da.live/canvas#/aemcoder/ca3fa77e6c1f/1c7514b6d325/welcome');
check('non-index last segment swapped',
  welcomeUrl('https://da.live/canvas#/aemcoder/sendto/df92ef3c/foo'),
  'https://da.live/canvas#/aemcoder/sendto/df92ef3c/welcome');

// isDaCanvasUrl: da.live/canvas host AND >= 4 path segments after '#/'
check('accepts full canvas url',
  isDaCanvasUrl('https://da.live/canvas#/aemcoder/sendto/df92ef3c/index'), true);
check('accepts per-user canvas url',
  isDaCanvasUrl('https://da.live/canvas#/aemcoder/ca3fa77e6c1f/1c7514b6d325/index'), true);
check('rejects http scheme',
  isDaCanvasUrl('http://da.live/canvas#/aemcoder/sendto/df92ef3c/index'), false);
check('rejects other host',
  isDaCanvasUrl('https://evil.example/canvas#/aemcoder/sendto/df92ef3c/index'), false);
check('rejects bare prefix',
  isDaCanvasUrl('https://da.live/canvas#/'), false);
check('rejects too few segments',
  isDaCanvasUrl('https://da.live/canvas#/aemcoder/sendto/df92ef3c'), false);
check('rejects null', isDaCanvasUrl(null), false);
check('rejects non-string', isDaCanvasUrl(123), false);

process.stdout.write(failures ? `\n${failures} FAILED\n` : '\nALL PASS\n');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node test/status-target.test.mjs`
Expected: FAIL — `Cannot find module '../scripts/status-target.js'` (the module doesn't exist yet).

- [ ] **Step 3: Create the module**

Create `scripts/status-target.js` with exactly:

```js
/*
 * Pure helpers for the migration status redirect target.
 *
 * The worker's un-authenticated status body returns a DA canvas URL pointing at the
 * page's index doc (…/<id>/index). We navigate there verbatim when the page is
 * ready, and to its welcome variant (…/<id>/welcome) when the user opts into the
 * demo. Pure module: no DOM or global access, so it can be unit-tested under Node.
 */

const DA_CANVAS_PREFIX = 'https://da.live/canvas#/';

/**
 * True when `url` is a DA canvas editor URL we are willing to redirect to: the
 * da.live/canvas host AND an owner/site/<id>/<doc> path (>= 4 segments after the
 * `#/`). The segment-count check means welcomeUrl() always swaps a real doc
 * segment and can't degrade a malformed input (e.g. the bare prefix) into a
 * non-canvas same-host URL.
 * @param {unknown} url candidate URL
 * @returns {boolean}
 */
export function isDaCanvasUrl(url) {
  if (typeof url !== 'string' || !url.startsWith(DA_CANVAS_PREFIX)) return false;
  const rest = url.slice(DA_CANVAS_PREFIX.length).replace(/\/+$/, '');
  return rest.split('/').filter(Boolean).length >= 4;
}

/**
 * Returns the welcome-doc variant of a DA canvas URL by replacing its last path
 * segment (e.g. `…/<id>/index` → `…/<id>/welcome`). Tolerates a trailing slash.
 * @param {string} daUrl a `…/<id>/index` DA canvas URL
 * @returns {string} the `…/<id>/welcome` URL
 */
export function welcomeUrl(daUrl) {
  const u = daUrl.replace(/\/+$/, '');
  return `${u.slice(0, u.lastIndexOf('/') + 1)}welcome`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node test/status-target.test.mjs`
Expected: every line `PASS …` then `ALL PASS` (exit 0).

- [ ] **Step 5: Syntax check + commit**

Run: `node --check scripts/status-target.js` → no output (exit 0).

```bash
git add scripts/status-target.js test/status-target.test.mjs
git commit -m "feat: pure status-target helpers (isDaCanvasUrl, welcomeUrl) with Node tests

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Use `daUrl` in `scripts/waiting.js`

**Files:**
- Modify: `scripts/waiting.js` (header comment, remove `canvasBaseUrl()`, add import, rewrite the `if (id)` core)

`statusId()`, `injectStyles()`, `renderExperience()`, and the constants `STATUS_SEGMENT`/`WORKER_URL`/`EXPERIENCE_URL`/`TRY_IT_OUT`/`POLL_INTERVAL_MS`/`ID_RE` are unchanged.

- [ ] **Step 1: Update the header comment**

Find lines 1-15:

```js
/*
 * Migration status waiting page.
 *
 * On a `/status/<id>` URL (served as a 404 because there is no such content),
 * embed the handoff "Preparing your page…" experience full-screen in an iframe
 * (tools/status/status.html) and immediately start polling the migration worker.
 * Polling continues indefinitely — there is no timeout. As soon as the page is
 * ready (worker HTTP 201) the top window is redirected to the DA canvas editor
 * (`…/<id>/index`), even while the animation is still playing. If the user clicks
 * the in-iframe "Try it out while you wait" CTA, the iframe posts 'status:try-it-out'
 * and the top window goes to the demo page (`…/<id>/welcome`) instead. Whichever
 * fires first wins; otherwise the page keeps waiting. The iframe only provides the
 * visuals and the CTA — polling does not depend on it. Polls with no Authorization
 * header (the worker's no-token path returns status only).
 */
```

Replace with:

```js
/*
 * Migration status waiting page.
 *
 * On a `/status/<id>` URL (served as a 404 because there is no such content),
 * embed the handoff "Preparing your page…" experience full-screen in an iframe
 * (tools/status/status.html) and immediately start polling the migration worker.
 * Polling continues indefinitely — there is no timeout. The worker's un-authenticated
 * status body carries the DA canvas URL for this job's (per-user) repo, which we
 * cache. As soon as the page is ready (worker HTTP 201) the top window is redirected
 * to that daUrl (the `…/<id>/index` editor), even while the animation is still
 * playing. If the user clicks the in-iframe "Try AEM on a demo page" CTA, the iframe
 * posts 'status:try-it-out' and the top window goes to the welcome variant of the
 * daUrl (`…/<id>/welcome`) instead. Whichever fires first wins; otherwise the page
 * keeps waiting. Without a daUrl we never redirect (the router host is the wrong,
 * per-user repo). Polls with no Authorization header (the worker's no-token path
 * returns the daUrl only).
 */
```

- [ ] **Step 2: Add the helper import**

Find (the blank line + first const after the header comment):

```js
 */

const STATUS_SEGMENT = 'status';
```

Replace with:

```js
 */

import { isDaCanvasUrl, welcomeUrl } from './status-target.js';

const STATUS_SEGMENT = 'status';
```

- [ ] **Step 3: Remove `canvasBaseUrl()`**

Find and delete this entire block (its doc comment + the function, lines 24-41 including the trailing blank line before `/**\n * Extracts the job id`):

```js
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

```

(Leave exactly one blank line between the header `import`/consts section and the `/** Extracts the job id … */` comment — i.e. the `statusId` doc comment now directly follows the blank line that preceded `canvasBaseUrl`.)

- [ ] **Step 4: Rewrite the `if (id)` core**

Find this block (the `goTo` + poll + message + start, lines 93-135):

```js
  // One-shot navigation to the DA canvas. A ready page (201 → index) and a
  // "try it out" click (→ welcome) can't both navigate — first to fire wins.
  let redirected = false;
  const goTo = (doc) => {
    if (redirected) return;
    redirected = true;
    window.location.replace(`${canvasBaseUrl()}${id}/${doc}`);
  };

  // Poll the worker indefinitely (no timeout); redirect to the ready editor
  // page on 201. Idempotent guard so we never spawn two loops. Each fetch is
  // aborted after POLL_INTERVAL_MS so a hung worker can't wedge the loop.
  let polling = false;
  const startPolling = () => {
    if (polling) return;
    polling = true;
    async function poll() {
      if (redirected) return;
      const ctrl = new AbortController();
      const abortTimer = window.setTimeout(() => ctrl.abort(), POLL_INTERVAL_MS);
      try {
        const res = await fetch(`${WORKER_URL}${encodeURIComponent(id)}`, { cache: 'no-store', signal: ctrl.signal });
        if (res.status === 201) { goTo('index'); return; }
      } catch (e) {
        // network blip / aborted slow fetch — keep polling
      } finally {
        window.clearTimeout(abortTimer);
      }
      if (!redirected) window.setTimeout(poll, POLL_INTERVAL_MS);
    }
    poll();
  };

  // The CTA is the user's escape hatch to the demo page. Validate source,
  // origin, and type before acting on any message.
  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || e.origin !== window.location.origin || !e.data) return;
    if (e.data.type === TRY_IT_OUT) goTo('welcome');
  });

  // Start polling right away — if the page is already ready, redirect at once
  // (independent of the animation, which only provides the visuals and the CTA).
  startPolling();
```

Replace with:

```js
  // The worker's status body hands us the DA canvas URL for this job's per-user
  // repo. Cache it (validated), then redirect there — index when ready, welcome on
  // the CTA. A ready page (201) and a "try it out" click can't both navigate; first
  // to fire wins.
  let daUrl = null;
  let redirected = false;
  const navigate = (url) => {
    if (redirected) return;
    redirected = true;
    window.location.replace(url);
  };

  // Poll the worker indefinitely (no timeout). On 201 the job is terminal →
  // redirect to the ready editor page. Idempotent guard so we never spawn two
  // loops. Each fetch is aborted after POLL_INTERVAL_MS so a hung worker can't
  // wedge the loop.
  let polling = false;
  const startPolling = () => {
    if (polling) return;
    polling = true;
    async function poll() {
      if (redirected) return;
      const ctrl = new AbortController();
      const abortTimer = window.setTimeout(() => ctrl.abort(), POLL_INTERVAL_MS);
      try {
        const res = await fetch(`${WORKER_URL}${encodeURIComponent(id)}`, { cache: 'no-store', signal: ctrl.signal });
        try {
          const body = await res.json();
          if (body && isDaCanvasUrl(body.daUrl)) daUrl = body.daUrl;
        } catch (e) {
          // empty / non-JSON body (e.g. 404 unknown job) — nothing to cache
        }
        if (res.status === 201 && daUrl) { navigate(daUrl); return; }
      } catch (e) {
        // network blip / aborted slow fetch — keep polling
      } finally {
        window.clearTimeout(abortTimer);
      }
      if (!redirected) window.setTimeout(poll, POLL_INTERVAL_MS);
    }
    poll();
  };

  // The CTA is the user's escape hatch to the demo (welcome) page. Validate
  // source, origin, and type; only navigate once we have a daUrl to derive it from.
  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || e.origin !== window.location.origin || !e.data) return;
    if (e.data.type === TRY_IT_OUT && daUrl) navigate(welcomeUrl(daUrl));
  });

  // Start polling right away — if the page is already ready, redirect at once
  // (independent of the animation, which only provides the visuals and the CTA).
  startPolling();
```

- [ ] **Step 5: Syntax check + verify**

Run: `node --check scripts/waiting.js` → no output (exit 0).

Run: `grep -n "canvasBaseUrl\|goTo\|status-target\|isDaCanvasUrl\|welcomeUrl\|navigate(" scripts/waiting.js`
Expected: NO matches for `canvasBaseUrl` or `goTo`; matches present for the `status-target` import, `isDaCanvasUrl`, `welcomeUrl`, and `navigate(`.

- [ ] **Step 6: Commit**

```bash
git add scripts/waiting.js
git commit -m "feat: redirect status page to the worker's daUrl (per-user repo)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Verify end-to-end

**Files:** none (verification only)

- [ ] **Step 1: Full gate**

Run: `node --check scripts/waiting.js && node --check scripts/status-target.js && node test/status-target.test.mjs && echo GATE_OK`
Expected: all `PASS`, `ALL PASS`, then `GATE_OK`. (Two separate `node --check` calls — it only checks one file per invocation.)

- [ ] **Step 2: Push**

Run: `git push -u origin status-daurl-redirect`
Expected: branch pushed.

- [ ] **Step 3: Preview verification**

Construct the preview base from `gh repo view --json nameWithOwner -q .nameWithOwner` and `git branch --show-current`:
`https://status-daurl-redirect--sendto--aemcoder.aem.page`.

Confirm the served files (use `curl -fsS --compressed`):
  - `/scripts/status-target.js` exports `isDaCanvasUrl` and `welcomeUrl`.
  - `/scripts/waiting.js` imports from `./status-target.js`, contains `navigate(`, `isDaCanvasUrl(body.daUrl)`, `welcomeUrl(daUrl)`, and no `canvasBaseUrl`.

  Behavior (browser/DevTools on `/status/<id>`): a poll response whose body carries a `daUrl` is cached; on a `201` the top window navigates to that `daUrl`; the CTA navigates to its `welcome` variant; a response with no `daUrl` (e.g. `404`) keeps waiting. A live `201`→daUrl check needs a real ready job id — if none is available, verify by inspection + DevTools and note it for the human reviewer.

  Note: `aem-psi-check` will be red for the `/status/<id>` URL (animated + polling page) — expected, per the prior decision; don't gate on it.

---

## Notes

- `WORKER_URL` is unchanged (franklin-prod); the API doc's `paolo-moz` base is a dev deploy.
- Branch redirect (`scripts/branch-redirect.js`) is unaffected: `status` stays a reserved segment, and `da.live` is outside its host filter (see the spec's "Interaction with the branch redirect" section).
- `201` is terminal for success *and* failure (un-authed can't distinguish); a failed job also lands on `daUrl`/index, where DA shows its own state — same as the prior behavior.
