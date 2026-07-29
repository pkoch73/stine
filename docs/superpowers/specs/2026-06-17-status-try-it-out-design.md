# Status: "Try it out" button + index/welcome split (no timeout) — design

**Date:** 2026-06-17
**Status:** Approved (pending implementation)
**Scope:** `tools/status/status.html`, `tools/status/status.js`, `scripts/waiting.js`
**Builds on:** the poll-after-animation work (branch `status-poll-after-animation`, PR #10, still open). This **supersedes** that branch's timeout behavior.

## Summary

Revise the `/status/<id>` flow so it never auto-redirects on a timeout. Instead:

1. Play the handoff animation, then start polling the worker (after the
   `status:animation-complete` signal, or a fallback that just *starts* polling).
2. **Poll indefinitely.** When the page is ready (worker `201`) → redirect to the
   DA canvas **`…/<id>/index`** (the now-ready editor page).
3. The Act-5 CTA is repurposed: text **"Try it out while you wait"**, a **play ▶
   icon**, and on click → redirect to the DA canvas **`…/<id>/welcome`** (the demo
   page). It's the user's escape hatch.
4. Otherwise → keep waiting (no auto-redirect).

So: **ready first → `/index`**, **button → `/welcome`**, **else wait**.

## Amendment (2026-06-17): poll immediately

Originally polling started only after the animation finished (the
`status:animation-complete` signal) or a `FALLBACK_MS` safety timer. We now
**start polling on load**, so an already-ready page redirects to `/index` at once
instead of sitting through the animation. This makes the `status:animation-complete`
signal and the fallback timer dead code, so both are removed (including the emitter
in `status.js` and the `ANIMATION_DONE`/`FALLBACK_MS` constants in `waiting.js`).
The iframe now only provides the visuals and the "Try it out" CTA — polling no
longer depends on it, which also means a broken iframe still reaches `/index`. The
message listener handles only `status:try-it-out`. Everything below describes the
original animation-gated flow; the one-shot `goTo`/idempotent `startPolling`/
abort-timer logic is otherwise unchanged.

Final CTA copy: the button reads **"Try AEM on a demo page"** and the `optional`
badge (`<s>optional</s>`) is **removed** (the `.close-cta s` style in `status.css`
went with it). The play ▶ icon is kept. The button `id` was also renamed
`#sidekick-cta` → `#demo-cta` (it no longer relates to the Sidekick); the JS hook
in `status.js` was updated to match. References to `#sidekick-cta` below are the
original id.

## Decisions (agreed)

- No timeout — remove the 60s hard-deadline window; poll indefinitely.
- Ready (`201`) → `…/<id>/index`. Button → `…/<id>/welcome`. (Shared one-shot;
  whichever fires first wins.)
- Button icon: **play triangle ▶**. Keep the small `optional` badge.
- The fallback timer still **starts polling** if the iframe never signals
  `status:animation-complete` (so a broken iframe can still reach `/index`); it no
  longer triggers a redirect.

## Components

### `tools/status/status.html` — repurpose `#sidekick-cta`
```html
<button class="close-cta" id="sidekick-cta" type="button">
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
  Try it out while you wait
  <s>optional</s>
</button>
```
- Icon: download-arrow → filled play triangle (`M8 5v14l11-7z`, `fill="currentColor"`), keeping the 24×24 / 16px box used by the old icon.
- Text: "Install the Sidekick extension while you wait" → "Try it out while you wait".
- Keep `<s>optional</s>`. (The `id` stays `sidekick-cta` to minimise churn — it's internal.)

### `tools/status/status.js` — CTA posts a message instead of opening docs
Replace the current handler:
```js
$('#sidekick-cta').addEventListener('click', () => {
  window.open('https://www.aem.live/docs/sidekick', '_blank', 'noopener');
});
```
with one that tells the parent (same-origin) to open the welcome demo:
```js
$('#sidekick-cta').addEventListener('click', () => {
  window.parent.postMessage({ type: 'status:try-it-out' }, window.location.origin);
});
```
(The `status:animation-complete` signal added on this branch stays unchanged.)

### `scripts/waiting.js` — poll indefinitely; 201→index, button→welcome; no timeout
Remove `POLL_WINDOW_MS` and the hard-deadline redirect. Keep `POLL_INTERVAL_MS`
(10s), `FALLBACK_MS` (start-polling safety), `canvasBaseUrl()`, per-fetch
`AbortController`, and message source+origin+type validation. New core:
```js
const ANIMATION_DONE = 'status:animation-complete';
const TRY_IT_OUT = 'status:try-it-out';
// …inside `if (id) { … const frame = renderExperience();`
let redirected = false;
const goTo = (doc) => {
  if (redirected) return;
  redirected = true;
  window.location.replace(`${canvasBaseUrl()}${id}/${doc}`);
};
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
window.addEventListener('message', (e) => {
  if (e.source !== frame.contentWindow || e.origin !== window.location.origin || !e.data) return;
  if (e.data.type === ANIMATION_DONE) startPolling();
  if (e.data.type === TRY_IT_OUT) goTo('welcome');
});
window.setTimeout(startPolling, FALLBACK_MS);
```

## Data flow

```
/status/<id> → iframe animation
  iframe → 'status:animation-complete' (or 3-min fallback) → startPolling()
     poll worker every 10s, indefinitely → 201 → goTo('index')   [canvas/<id>/index]
  iframe → '#sidekick-cta' click → 'status:try-it-out' → goTo('welcome')  [canvas/<id>/welcome]
  neither → keep waiting
```

## Error handling

- `goTo` is one-shot (`redirected` guard) — a `201` and a button click can't both
  navigate, whichever happens first wins.
- `startPolling` is idempotent (`polling` guard) — the signal and the fallback
  can't spawn two loops.
- Each fetch is aborted after 10s so a hung worker can't wedge the loop.
- Messages validated by source (`=== frame.contentWindow`), origin, and type.
- The button works whenever it's shown (Act 5); its listener is registered up
  front, independent of polling.

## Testing

- No linter (removed in #5) → `node --check` all three files.
- Browser/headless on the preview: confirm the CTA shows "Try it out while you
  wait" with a ▶ icon; clicking it navigates to `…/<id>/welcome`; a worker `201`
  navigates to `…/<id>/index`; and **no auto-redirect** happens otherwise (no
  timeout). The full ~130s animation gate is unchanged; quick checks can shrink
  constants on a throwaway commit.

## Out of scope

- The animation content/pacing, the iframe isolation, the `status` routing.
