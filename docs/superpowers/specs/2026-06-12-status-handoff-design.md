# Status waiting experience (handoff-v3) — design

**Date:** 2026-06-12
**Status:** Approved (pending implementation)
**Scope:** `tools/status/` (new), `scripts/waiting.js` (modify)
**Source handoff:** `/Users/kpauls/Downloads/handoff-v3`

## Summary

Replace the minimal "Preparing your page…" spinner overlay on
`main--sendto--aemcoder.<domain>/status/<id>` with the **handoff-v3** experience —
a polished, timeline-driven 5-act narrative ("a safe private environment → what
you can do → why the wait → an AEM tour → a quiet close"). The handoff is **pure
visual filler** (it never detects completion), so the real driver stays the same:
`scripts/waiting.js` keeps polling the migration worker and, on a terminal job
(`201`), redirects to the DA canvas.

The experience is rendered inside a **full-screen iframe** for complete CSS/JS
isolation; `waiting.js` polls in the parent and redirects the top window.

## Decisions (agreed)

- **Handoff is the visual; keep the poll → `201` → DA-canvas redirect** (driven by
  the parent, not the timeline).
- **Strip the demo/presenter controls; keep the original snappy pacing**
  (`speed: 1`, ~130s for the full narrative; Act 5's "Still preparing…" loop
  covers the remaining wait). *(We initially tried real ~10-min pacing but it
  dragged at 4.6× slower per beat, so reverted to the author's default.)*
- **Convert the bundled Adobe Clean OTFs to woff2** (~1.1MB → ~300KB).
- **Keep the on-screen story nav** (dot nav, chapter tabs, prev/next).
- **Drop the hard 20-minute cap** — poll until `201`; the handoff's Act 5 "Still
  preparing…" loop covers long waits.
- **Iframe isolation** — the handoff is a standalone page; no collision with the
  site's `styles.css`/`scripts.js`, and the handoff stays essentially verbatim
  (easy to re-sync future handoff versions).

## Why an iframe (not inline injection)

The handoff's 40KB CSS styles generic selectors (`body`, `header`, `.hud`, …). The
`/status/<id>` page is served via `404.html`, which loads the site's
`styles.css`/`lazy-styles.css` and runs `scripts.js` decoration — inline injection
would collide on those selectors and require scoping all 40KB. An iframe pointed
at a self-contained page eliminates that entirely. The iframe loads **no**
`scripts.js`, so the branch-redirect/waiting logic never re-runs inside it.

## Components

### New: `tools/status/` (the handoff as a standalone page)

- **`tools/status/status.html`** — `handoff-v3/index.html` with the **presenter-only
  elements removed** (help panel `#help`, replay button `#replay-btn`, pacing badge
  `#pacing-badge`, toast `#toast`), and its `<link>`/`<script>` pointed at
  `status.css`/`status.js`.
- **`tools/status/status.css`** — `handoff-v3/styles.css` verbatim, with the six
  `@font-face` `url(...)` repointed to local **woff2**.
- **`tools/status/status.js`** — `handoff-v3/script.js` with the demo controls
  removed and **real pacing fixed on**:
  - Remove: the `keydown` presenter handler (space/arrows/1–5/R/T/H/?/Esc), the
    `?t=`/`?paused` deep-link block, the pacing toggle (`T` + `#pacing-badge`), the
    replay handler (`#replay-btn`), the help toggle (`#help`), and the `toast()`
    helper (presenter feedback only).
  - Keep `clock.speed = 1` (the author's snappy default); remove the pacing
    toggle so it can't be switched to the slow real-time mode.
  - Keep: the clock/cues/acts timeline, `setAct`, all five acts, the **on-screen
    story nav** (`#snav-dots`, `#snav-prev`, `#snav-next`, `#chapters` handlers via
    `seek`/`goAct`), the `#sidekick-cta` link, and the Act 5 "Still preparing…"
    status cycling (`setInterval`).
- **`tools/status/fonts/*.woff2`** — the six Adobe Clean faces converted from OTF
  (AdobeClean Regular/Medium/Bold + AdobeCleanDisplay Black/Bold). Adobe Clean is
  Adobe's font; committing it in Adobe's own repo is appropriate.

### Modify: `scripts/waiting.js`

Keep `statusId` parsing, `WORKER_URL`, `CANVAS_URL`, and the `201` → canvas
redirect. Replace the small-overlay build with an iframe embed and drop the cap:

- On `/status/<id>`: add the `status-waiting` class, set the title, hide the 404
  chrome, and append a **full-viewport iframe** with
  `src="/tools/status/status.html"` (`title="Preparing your page"`).
- Poll `GET ${WORKER_URL}${id}` (no auth) every 30s **indefinitely** until `201` →
  `window.location.replace(`${CANVAS_URL}${id}/index`)`. Any other status / network
  error keeps polling. (Remove `TIMEOUT_MS` and `showFallback404`.)

### Excluded from the repo

`handoff-v3/shots/` (~3.5MB design storyboard) and `handoff-v3/assets/` (the
wordmark is already inlined in the markup) — neither is referenced by the page.

## Data flow

```
main--…/status/<id>  →  404  →  404.html  →  waiting.js
  waiting.js: hide 404 chrome, embed iframe → /tools/status/status.html
              (handoff plays the narrative, isolated)
  waiting.js (parent): poll worker every 30s
              → 201 → location.replace(top → https://da.live/canvas#/aemcoder/sendto/<id>/index)
```

## Error handling

A failed/terminal job still returns `201` → we redirect to the canvas (which shows
its own not-found state if nothing was created). A job stuck "running" (`200`) or
an unknown id (`404`) keeps polling; the handoff's "Still preparing…" loop is the
long-wait UX. The poll loop is guarded so a single failed fetch doesn't abort it.

## Testing

- Lint tooling was removed in #5 → `node --check tools/status/status.js` and
  `node --check scripts/waiting.js` for syntax.
- Browser-only behavior verified headlessly on the branch preview (as with the
  earlier cache bug): open `/status/<id>` and confirm (a) the iframe loads
  `/tools/status/status.html` and the narrative renders with Adobe Clean, (b) the
  parent polls `vibemig-…/jobs/snowflake/<id>` every 30s, (c) a `201` redirects the
  top window to the canvas URL.
- `/tools/status/status.html` is served as static HTML by EDS (confirmed), so the
  iframe `src` approach is used (no `srcdoc` fallback needed).

## Out of scope

- Distinguishing job success vs failure (needs an authed call).
- Re-designing the handoff visuals — it ships essentially as authored.
