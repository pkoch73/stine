# Status redirect uses `daUrl` from the worker response — design

**Date:** 2026-06-17
**Status:** Approved (pending implementation)
**Scope:** `scripts/waiting.js`, new pure helper module `scripts/status-target.js` + `test/status-target.test.mjs`
**Builds on:** the merged status waiting-page work (PR #10).

## Summary

`scripts/waiting.js` currently builds the DA redirect target by deriving owner/site
from the **current** host via `canvasBaseUrl()` (`https://da.live/canvas#/{owner}/{site}/`
+ `<id>/<doc>`). Migration repos are now **per user**, so the current host (the
`sendto` router) is the **wrong** site. The migration worker's un-authenticated
status endpoint now returns the correct DA canvas URL in its body, so we use that
instead of deriving it.

New behavior:

1. Poll the worker (same host/URL) on load, indefinitely. On every response, parse
   the JSON body and cache `daUrl`.
2. **Ready (HTTP 201) → redirect to `daUrl`** (it already points at `…/<id>/index`).
3. **CTA "Try AEM on a demo page" → redirect to the welcome variant of `daUrl`**
   (swap the last path segment to `welcome`).
4. **No `daUrl` available → keep waiting.** Never derive/guess a target;
   `canvasBaseUrl()` is removed.

So: **ready first → `daUrl` (index)**, **button → `daUrl`→welcome**, **else wait** —
and the redirect host is whatever the worker says, not the `sendto` router.

## Contract (verified against `aemcoder/vibemigration` `docs/api-snowflake-job.md` @ 6568b66)

Un-authenticated `GET /jobs/snowflake/:jobId` (**no** `Authorization` header — the
mode `waiting.js` uses):

- Body is minimal: `{ "daUrl": "https://da.live/canvas#/{owner}/{site}/{jobId}/index" }`.
  Only `daUrl` is exposed un-authed (no `status`/`previewUrl`/`result`/`error`).
- `daUrl` is present in **every** response and **available immediately** (even while
  queued/running), before the job completes.
- HTTP status: **`200`** = queued/running (keep polling), **`201`** = terminal —
  succeeded **or** failed (body still carries `daUrl`), **`404`** = unknown job
  (empty body).
- `201` does **not** distinguish success from failure un-authed; a failed job also
  lands on `daUrl`/index (DA shows its own state). This matches the prior
  "terminal → DA" behavior.

`WORKER_URL` stays `https://vibemig-migration-backend-worker.franklin-prod.workers.dev/jobs/snowflake/`
(prod). The doc's `migration-backend-worker.paolo-moz.workers.dev` base is a dev
deployment; the `{daUrl}` body is expected to ship to the existing prod worker.

## Decisions (agreed)

- Ready = **HTTP 201** (as today). The un-authed body has no `status` field anyway,
  so HTTP status is the only available signal.
- **`daUrl` is the single source of truth.** Remove `canvasBaseUrl()`. If `daUrl` is
  absent → keep waiting (never redirect to a guessed/wrong repo).
- Index target = `daUrl` verbatim. Welcome target = `daUrl` with its last path
  segment swapped to `welcome`.
- `WORKER_URL` unchanged (franklin-prod).
- **Defense-in-depth:** only accept/navigate to a `daUrl` that is a
  `https://da.live/canvas#/…` URL — it flows from an external response into
  `location.replace`, so validate the prefix **and the canvas path shape**
  (owner/site/<id>/<doc>) to prevent an open redirect or a degenerate target if the
  worker ever returns something unexpected. (Reviewer: flag if you'd rather skip
  this.)

## Components

### New pure module — `scripts/status-target.js`

`waiting.js` runs side-effects on import (it touches `window`/`document` at top
level), so it can't be imported under Node. Put the URL logic in a small **pure**
module — no DOM/global access — that `waiting.js` imports and a Node test exercises,
mirroring `scripts/branch-redirect.js` + `test/branch-redirect.test.mjs`.

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
 * da.live/canvas host AND an owner/site/<id>/<doc> path (≥4 segments after the
 * `#/`). The segment-count check means `welcomeUrl()` always swaps a real doc
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

### `scripts/waiting.js`

- Delete `canvasBaseUrl()` entirely (host derivation no longer used).
- `import { isDaCanvasUrl, welcomeUrl } from './status-target.js';`
- Replace the `goTo(doc)` + poll/message logic inside `if (id)` with:

```js
  // The worker's status body hands us the DA canvas URL for this job's per-user
  // repo. We cache it and redirect there — index when ready, welcome on the CTA.
  let daUrl = null;
  let redirected = false;
  const navigate = (url) => {
    if (redirected) return;
    redirected = true;
    window.location.replace(url);
  };

  // Poll indefinitely (no timeout). On 201 the job is terminal → redirect to the
  // ready editor page. Idempotent guard; each fetch aborted after POLL_INTERVAL_MS.
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

  // CTA escape hatch → the demo (welcome) page. Validate source/origin/type.
  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || e.origin !== window.location.origin || !e.data) return;
    if (e.data.type === TRY_IT_OUT && daUrl) navigate(welcomeUrl(daUrl));
  });

  // Start polling right away — a ready page redirects at once.
  startPolling();
```

(The header comment and the `canvasBaseUrl()` removal are part of the edit;
`statusId()`, `injectStyles()`, `renderExperience()`, `WORKER_URL`, `EXPERIENCE_URL`,
`TRY_IT_OUT`, `POLL_INTERVAL_MS`, `ID_RE` are unchanged.)

## Data flow

```
poll → res.json().daUrl validated + cached (present from the first 200)
  201 + daUrl → location.replace(daUrl)              [canvas …/<id>/index]
  CTA + daUrl → location.replace(welcomeUrl(daUrl))  [canvas …/<id>/welcome]
  no daUrl    → keep waiting
```

The CTA only appears in Act 5 (~127s) while the first poll fires at load, so a
`daUrl` is effectively always cached by the time the button can be clicked. A
pre-`daUrl` click is a harmless no-op (keep waiting) — no pending-intent machinery.

## Error handling

- Empty/non-JSON body (404 unknown job, or any transition response) → inner
  try/catch; `daUrl` stays null → no redirect. **Never** redirect to a guessed URL.
- A `daUrl` that isn't a `https://da.live/canvas#/…` URL is ignored (open-redirect
  guard).
- Per-fetch `AbortController` (unchanged); idempotent `startPolling`; one-shot
  `navigate`.
- Reading the cross-origin body relies on the worker's CORS headers — already
  required for today's status read; the un-authenticated mode is public.

## Testing

- `node --check scripts/waiting.js scripts/status-target.js`.
- `test/status-target.test.mjs` (mirrors `branch-redirect.test.mjs`): unit-test
  `welcomeUrl()` — `…/index` → `…/welcome`, trailing slash tolerated, the `#`
  fragment preserved, a non-`index` last segment swapped — and `isDaCanvasUrl()` —
  accepts a full `owner/site/<id>/<doc>` canvas URL, rejects `http:`/other
  hosts/`null`/non-strings **and** the degenerate bare-prefix
  `https://da.live/canvas#/` (too few path segments).
- Preview: a `201` with a `{daUrl}` body redirects to that `daUrl`; the CTA → the
  welcome variant; an unknown id (`404`) keeps waiting (no redirect).

## Interaction with the branch redirect (unaffected)

The other redirect — `scripts/branch-redirect.js` (`getBranchRedirectUrl`), called
from `scripts.js#redirectToMatchingBranch` during `loadPage()` — is not touched and
not affected:

- `404.html` loads **both** `scripts.js` and `waiting.js`. On `/status/<id>`,
  `getBranchRedirectUrl` returns `null` because `status` is in its
  `RESERVED_SEGMENTS`, so the branch redirect is a no-op and `waiting.js` owns the
  page. This change keeps `RESERVED_SEGMENTS = ['status']` untouched.
- The new redirect target is a `https://da.live/canvas#/…` URL. `da.live` is outside
  the branch redirect's host filter (`*.aem.page` / `*.aem.live` /
  `*.preview.da.live`), and we navigate off-site, so it can never re-enter the branch
  redirect.
- `status-target.js` and `branch-redirect.js` are independent pure modules with no
  shared state. This change edits only `waiting.js` and adds `status-target.js`;
  `branch-redirect.js`, `scripts.js`, `404.html`, and `RESERVED_SEGMENTS` are
  unchanged.

## Out of scope

- Authenticated mode / the full result body, `previewUrl`, `status`/`stage` fields,
  and any failure-specific UX (un-authed can't see success vs failure).
- The animation, iframe isolation, `status` routing, and the poll cadence.
