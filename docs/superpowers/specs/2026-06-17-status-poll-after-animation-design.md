# Status page: poll after the animation, then always redirect — design

**Date:** 2026-06-17
**Status:** Approved (pending implementation)
**Scope:** `tools/status/status.js` (iframe), `scripts/waiting.js` (parent)

## Summary

Change the `/status/<id>` waiting behavior. Today `scripts/waiting.js` polls the
migration worker immediately and indefinitely, redirecting to the DA canvas only
on a `201`. The handoff animation just loops forever if the job never finishes.

New behavior:
1. The handoff animation plays **fully** (no redirect during it, even if the job
   finishes early).
2. **When the animation finishes**, start polling the worker.
3. Poll for **up to 1 minute**.
4. **Redirect to DA** on the **first `201`** *or* when the 1-minute window elapses
   — whichever comes first. We **always** land in DA within (animation + ≤1 min).

The redirect target changes from `…/<id>/index` to **`…/<id>/welcome`**.

## Decisions (agreed)

- Poll cadence during the window: **every 10s** (≈6 checks).
- Poll window: **60s**, after which we redirect regardless of job status.
- Safety **fallback**: if the iframe never signals "animation complete" (e.g. it
  failed to load), start the poll-and-redirect anyway after **~3 minutes**
  (comfortably past the ~130s animation), so the page never hangs.
- Redirect path: **`/welcome`** (not `/index`).
- It **always** redirects (on `201` or on timeout). Implication: if the migration
  takes longer than ~3.2 min total, the user lands in DA **before the doc exists**
  — DA shows its own not-ready/not-found state. This is the intended "kick to DA
  on timeout" behavior.

## Components

### `tools/status/status.js` (the iframe) — signal completion once

The timeline advances `clock.t` to `COMPRESSED_END` (130) then loops Act 5. Post a
single message to the parent the first time it reaches the end. In `loop(now)`,
after `clock.tick(now)`:

```js
if (!doneSignaled && clock.t >= COMPRESSED_END) {
  doneSignaled = true;
  // same-origin iframe → target the parent's origin (== ours), not '*'
  window.parent.postMessage({ type: 'status:animation-complete' }, window.location.origin);
}
```

with a module-scoped `let doneSignaled = false;`. One-shot.

### `scripts/waiting.js` (the parent) — poll only after completion, then redirect

- New constants: `POLL_WINDOW_MS = 60000`, `FALLBACK_MS = 180000` (and keep a
  10s interval — change `POLL_INTERVAL_MS` to `10000`).
- `renderExperience()` returns the created iframe so the listener can validate the
  message **source** (not just origin+type).
- Replace the immediate `pollUntilReady(id)` with a **one-shot `start()`** that
  fires on whichever comes first:
  - the iframe's `status:animation-complete` message — validated
    `event.source === frame.contentWindow` **and** `event.origin === window.location.origin`
    **and** `event.data?.type === 'status:animation-complete'`; or
  - the fallback `window.setTimeout(start, FALLBACK_MS)`.
- `start()` (guarded by a `started` flag) → `pollWindow(id)`. The poll window uses
  an **independent hard-deadline timer** and an **abortable per-request timeout**, so
  a hung worker fetch can never delay the redirect past 60s, and a single one-shot
  `go()` guard prevents the 201-path and the deadline-path from double-redirecting:

```js
function pollWindow(jobId) {
  const target = `${canvasBaseUrl()}${jobId}/welcome`;
  let redirected = false;
  const go = () => { if (!redirected) { redirected = true; window.location.replace(target); } };
  // hard deadline: redirect at 60s regardless of any in-flight fetch
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

It polls immediately (catches an already-done job at once), then every 10s; each
fetch is aborted after 10s so a stuck worker can't hang the loop; the hard timer
guarantees the redirect by 60s. `canvasBaseUrl()` is reused unchanged (per-repo
owner/site derivation).

## Data flow / timing

```
/status/<id> → iframe plays animation (~130s)
  iframe → postMessage 'status:animation-complete' at clock.t ≥ 130
  parent start() (or fallback at ~180s) → pollWindow:
     poll worker every 10s, up to 60s
       → 201       → location.replace(canvas/<id>/welcome)
       → deadline  → location.replace(canvas/<id>/welcome)
Total: ~130s animation + ≤60s poll ≈ ≤3.2 min before landing in DA.
```

## Error handling

- Message is validated by **source** (`event.source === frame.contentWindow`),
  **origin** (`=== location.origin`), and **type**; anything else ignored.
- Network errors and slow fetches during the poll window are handled: each fetch is
  aborted after 10s (AbortController) and the error swallowed, so the loop keeps
  going and a stuck worker can't hang it.
- A **hard-deadline timer** redirects at 60s regardless of any in-flight fetch, so
  the "always redirect within 60s" guarantee holds even if the worker is
  unresponsive. A one-shot `go()` guard prevents a double redirect.
- The fallback timer guarantees the flow completes even if the iframe never loads
  or never signals; `start()` is idempotent (one-shot) so the message and the
  fallback can't both spawn two poll loops.

## Testing

- No linter (removed in #5) → `node --check` both files for syntax.
- Browser-only behavior; verify headlessly on the branch preview at
  `/status/<id>`: the worker is **not** polled during the animation, polling
  begins after it completes, and a redirect to `…/<id>/welcome` fires on `201` or
  at the ~60s cap. For a quick end-to-end check, the constants can be temporarily
  shrunk (small window/fallback) to observe the transition without waiting ~130s.

## Out of scope

- Changing the animation itself, the pacing, or the iframe isolation.
- Distinguishing job success vs failure (still just HTTP status).
