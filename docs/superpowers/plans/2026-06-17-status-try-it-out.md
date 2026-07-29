# Status "Try it out" button + index/welcome split (no timeout) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/status/<id>` waiting page never auto-redirect on a timeout — instead poll the worker indefinitely (ready → DA canvas `/index`), and repurpose the Act-5 CTA to "Try it out while you wait" (▶ icon) so a click goes to the DA canvas `/welcome`.

**Architecture:** The handoff animation lives in a same-origin iframe (`tools/status/status.html` + `status.js`). The iframe already posts `status:animation-complete` when the animation finishes. We add a second signal, `status:try-it-out`, fired by the repurposed CTA. The parent page (`scripts/waiting.js`, running on the `/status/<id>` 404 page) listens for both: `animation-complete` starts an indefinite poll loop (201 → `…/<id>/index`), and `try-it-out` navigates to `…/<id>/welcome`. A shared one-shot guard means whichever transition fires first wins; otherwise the page keeps waiting.

**Tech Stack:** Vanilla ES JS (no build), DOM `postMessage`, `fetch` + `AbortController`. No repo linter (removed in PR #5) → `node --check` is the syntax gate. No unit-test harness for these browser-only DOM files; verification is `node --check` + a headless/browser check on the branch preview.

**Spec:** `docs/superpowers/specs/2026-06-17-status-try-it-out-design.md` (approved, codex-reviewed CLEAR).

**Branch:** Extends `status-poll-after-animation` (PR #10, still open) — this supersedes that branch's timeout behavior. A fresh branch off `main` would lack the `status:animation-complete` signal this builds on.

---

## Task 1: Repurpose the Act-5 CTA markup

**Files:**
- Modify: `tools/status/status.html:287-291`

The button currently shows a download-arrow icon and "Install the Sidekick extension while you wait". Change the icon to a filled play triangle and the text to "Try it out while you wait". Keep the `id="sidekick-cta"` (internal — minimizes churn; the click handler is updated in Task 2) and keep the `<s>optional</s>` badge.

- [ ] **Step 1: Replace the button's icon and text**

Find this exact block at `tools/status/status.html:287-291`:

```html
    <button class="close-cta" id="sidekick-cta" type="button">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 21h16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Install the Sidekick extension while you wait
      <s>optional</s>
    </button>
```

Replace it with (play-triangle icon `M8 5v14l11-7z`, `fill="currentColor"`, same 24×24 / 16px box; new text; badge kept):

```html
    <button class="close-cta" id="sidekick-cta" type="button">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
      Try it out while you wait
      <s>optional</s>
    </button>
```

- [ ] **Step 2: Verify the change landed and nothing else moved**

Run: `grep -n "Try it out while you wait\|M8 5v14l11-7z\|Install the Sidekick" tools/status/status.html`
Expected: the play-path `M8 5v14l11-7z` and "Try it out while you wait" are present; "Install the Sidekick" is **gone** (no output for it).

- [ ] **Step 3: Commit**

```bash
git add tools/status/status.html
git commit -m "feat: repurpose status CTA to 'Try it out while you wait' with play icon

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: CTA posts `status:try-it-out` instead of opening Sidekick docs

**Files:**
- Modify: `tools/status/status.js:153-155`

The CTA click currently opens the Sidekick docs in a new tab. Change it to message the (same-origin) parent so the parent can navigate to the welcome demo. The existing `status:animation-complete` signal (`status.js:192-199`) is **unchanged**.

- [ ] **Step 1: Replace the click handler**

Find this exact block at `tools/status/status.js:153-155`:

```js
$('#sidekick-cta').addEventListener('click', () => {
  window.open('https://www.aem.live/docs/sidekick', '_blank', 'noopener');
});
```

Replace it with:

```js
$('#sidekick-cta').addEventListener('click', () => {
  // same-origin iframe → target the parent's origin (== ours), not '*'
  window.parent.postMessage({ type: 'status:try-it-out' }, window.location.origin);
});
```

- [ ] **Step 2: Syntax check**

Run: `node --check tools/status/status.js`
Expected: no output (exit 0).

- [ ] **Step 3: Verify the handler changed and the docs URL is gone**

Run: `grep -n "status:try-it-out\|aem.live/docs/sidekick" tools/status/status.js`
Expected: `status:try-it-out` present; `aem.live/docs/sidekick` **absent** (no output for it).

- [ ] **Step 4: Commit**

```bash
git add tools/status/status.js
git commit -m "feat: status CTA posts status:try-it-out to parent

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Poll indefinitely; 201→index, try-it-out→welcome; remove the timeout

**Files:**
- Modify: `scripts/waiting.js` (constants, header doc, the `pollWindow` function, and the `if (id)` block)

Remove `POLL_WINDOW_MS` and the entire `pollWindow` hard-deadline-redirect function. Add a `TRY_IT_OUT` constant. Replace the `if (id)` body with a shared one-shot `goTo(doc)`, an idempotent `startPolling()` that polls forever (201 → `index`), a message listener that maps `animation-complete`→start polling and `try-it-out`→`goTo('welcome')`, and a fallback that only *starts* polling. `canvasBaseUrl()`, `statusId()`, `injectStyles()`, and `renderExperience()` are unchanged.

- [ ] **Step 1: Update the header comment**

Find the header comment block at `scripts/waiting.js:1-13`:

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
```

Replace it with:

```js
/*
 * Migration status waiting page.
 *
 * On a `/status/<id>` URL (served as a 404 because there is no such content),
 * embed the handoff "Preparing your page…" experience full-screen in an iframe
 * (tools/status/status.html). The experience plays to completion, then signals
 * the parent (postMessage 'status:animation-complete'); the parent then starts
 * polling the migration worker. Polling continues indefinitely — there is no
 * timeout. When the page is ready (worker HTTP 201) the top window is redirected
 * to the DA canvas editor (`…/<id>/index`). If the user clicks the in-iframe
 * "Try it out while you wait" CTA, the iframe posts 'status:try-it-out' and the
 * top window goes to the demo page (`…/<id>/welcome`) instead. Whichever fires
 * first wins; otherwise the page keeps waiting. A fallback timer starts the same
 * polling if the iframe never signals. Polls with no Authorization header (the
 * worker's no-token path returns status only).
 */
```

- [ ] **Step 2: Update constants — add `TRY_IT_OUT`, drop `POLL_WINDOW_MS`**

Find at `scripts/waiting.js:18-21`:

```js
const ANIMATION_DONE = 'status:animation-complete';
const POLL_INTERVAL_MS = 10000;
const POLL_WINDOW_MS = 60000;
const FALLBACK_MS = 180000;
```

Replace with:

```js
const ANIMATION_DONE = 'status:animation-complete';
const TRY_IT_OUT = 'status:try-it-out';
const POLL_INTERVAL_MS = 10000;
const FALLBACK_MS = 180000;
```

- [ ] **Step 3: Delete the `pollWindow` function**

Find and delete this entire block (the doc comment at `scripts/waiting.js:86-92` plus the function `:93-116`):

```js
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
```

(Leave a single blank line where it was, before `const id = ...`.)

- [ ] **Step 4: Replace the `if (id)` block**

Find the current block at `scripts/waiting.js:118-141`:

```js
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

Replace it with:

```js
const id = statusId(window.location.pathname);
if (id) {
  document.documentElement.classList.add('status-waiting');
  document.title = 'Preparing your page…';
  injectStyles();
  const frame = renderExperience();

  // One-shot navigation to the DA canvas. A ready page (201 → index) and a
  // "try it out" click (→ welcome) can't both navigate — first to fire wins.
  let redirected = false;
  const goTo = (doc) => {
    if (redirected) return;
    redirected = true;
    window.location.replace(`${canvasBaseUrl()}${id}/${doc}`);
  };

  // Poll the worker indefinitely (no timeout); redirect to the ready editor
  // page on 201. Idempotent: the animation signal and the fallback can't spawn
  // two loops. Each fetch is aborted after POLL_INTERVAL_MS so a hung worker
  // can't wedge the loop.
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

  // The iframe drives both transitions: it signals when the animation finishes
  // (start polling) and when the user clicks "Try it out" (go to the demo).
  // Validate source, origin, and type before acting on any message.
  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || e.origin !== window.location.origin || !e.data) return;
    if (e.data.type === ANIMATION_DONE) startPolling();
    if (e.data.type === TRY_IT_OUT) goTo('welcome');
  });

  // Safety: start polling even if the iframe never signals (e.g. failed to load).
  window.setTimeout(startPolling, FALLBACK_MS);
}
```

- [ ] **Step 5: Syntax check**

Run: `node --check scripts/waiting.js`
Expected: no output (exit 0).

- [ ] **Step 6: Verify the timeout is gone and the new behavior is wired**

Run: `grep -n "POLL_WINDOW_MS\|pollWindow\|TRY_IT_OUT\|goTo('index')\|goTo('welcome')\|startPolling" scripts/waiting.js`
Expected: **no** matches for `POLL_WINDOW_MS` or `pollWindow`; matches present for `TRY_IT_OUT`, `goTo('index')`, `goTo('welcome')`, and `startPolling`.

- [ ] **Step 7: Commit**

```bash
git add scripts/waiting.js
git commit -m "feat: poll status indefinitely; 201->index, try-it-out->welcome, no timeout

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Verify end-to-end on the branch preview

**Files:** none (verification only)

The full animation gate is ~130s; for a fast check the constants in `status.js` (`COMPRESSED_END`) and `waiting.js` (`FALLBACK_MS`) can be temporarily shrunk on a throwaway commit, then reverted — do **not** ship shrunk constants.

- [ ] **Step 1: Final syntax gate on both JS files**

Run: `node --check scripts/waiting.js && node --check tools/status/status.js && echo OK`
Expected: `OK`.

- [ ] **Step 2: Push the branch so AEM Code Sync builds the preview**

Run: `git push`
Expected: push succeeds to `status-poll-after-animation`.

- [ ] **Step 3: Determine the preview status URL**

Run: `gh repo view --json nameWithOwner -q .nameWithOwner` and `git branch --show-current`
Construct: `https://<branch>--<repo>--<owner>.aem.page/status/<some-id>` (use any id matching `^[A-Za-z0-9_-]+$`, e.g. `test123`).

- [ ] **Step 4: Headless/browser verification on the preview**

Open the status URL in playwright/puppeteer/a browser and confirm:
  - The Act-5 close screen CTA reads **"Try it out while you wait"** with a **▶ play** icon and the small `optional` badge (advance to Act 5 via the story-nav dots/arrows to see it without waiting for the full animation).
  - Clicking the CTA navigates the top window to the DA canvas **`…/<id>/welcome`**.
  - With the worker returning `201` for the id, after the animation completes the top window navigates to **`…/<id>/index`** (this needs a real terminal job; if none is available, confirm in DevTools that the poll loop runs after `status:animation-complete` and that a synthetic `201` triggers `goTo('index')`).
  - With neither a `201` nor a click, the page **keeps waiting** — no auto-redirect ever fires (confirm no navigation after the old 60s window would have elapsed).

If a real terminal-job id is unavailable for the `201`→`index` path, report that this leg was verified by code inspection + DevTools rather than a live redirect, and ask the user for a known-ready id to confirm live.

---

## Notes / known limitations

- **Iframe-failure escape hatch (codex Medium, by design):** the "Try it out" CTA lives inside the iframe, so if the iframe fails to load AND the worker never returns `201`, the user waits indefinitely with no escape hatch. This is the accepted trade-off of the explicit "no timeout / otherwise wait" decision; the iframe is a verified same-origin static file (failure is rare) and the fallback still starts polling, so a later `201` recovers to `/index`. No mitigation in scope.
- The `status` routing, iframe isolation, and the animation content/pacing are unchanged.
