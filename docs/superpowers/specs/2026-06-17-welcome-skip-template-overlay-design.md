# Welcome page skips the template overlay — design

**Date:** 2026-06-17
**Status:** Implemented
**Scope:** `scripts/scripts.js` (boilerplate only — the overlay engine is **not** touched)

## Problem

Downstream of this boilerplate, the snowflake migration adds a static-to-EDS
**overlay engine** (`scripts/overlay-engine.js`) that wraps a page's content in a
named template. Its template-name discovery is:

```js
function resolveTemplateName() {
  const meta = getMetadata('template');
  if (meta) return meta;
  return document.body.getAttribute('data-template')
    || (document.querySelector('main')?.classList.contains('error') ? null : 'wheelercat');
}
```

The `welcome` page is a **self-contained demo** built from its own `welcome-*`
blocks; it must never take the site template overlay. But because it carries no
`template` metadata, discovery falls through to the `'wheelercat'` default and
overlays it. Desired behavior (template applied?):

| page | 404, no qe | 404, quick-edit | 200 |
|------|-----------|-----------------|-----|
| index (and other) | no | **yes** | yes |
| welcome | no | no | no |

The single invariant: **applyTemplate = !isWelcome && (pageExists || quickEdit)**.
Index already satisfies its row via the existing `main.error` branch (a real 404 →
`null`; while editing, an editor `set-body` clears `main.error` so the `wheelercat`
default applies). Only `welcome` (200 and 404-while-editing) wrongly defaults.

## Decision

Fix it in the **boilerplate only**, without editing the overlay engine, by feeding
the engine a signal it already honors: mark self-contained pages with
`body[data-template="none"]`. `resolveTemplateName()` then returns `'none'`, and
`applyTemplateOverlay` fetches `/templates/none.html`, gets a non-ok response, and
skips the overlay (`return false`).

- **Forward-compatible:** works today via graceful template-not-found; once the
  engine is taught to treat `'none'` as an explicit opt-out (`return null`), the
  behavior is identical and **this boilerplate code is unchanged** — the only
  difference is the transient `console.warn`/404 fetch disappears.
- **Rejected `main.error`:** it's a semantic lie (welcome isn't an error) that
  works only because nothing styles `.error` *yet* — a landmine in a foundation —
  and on a welcome 404 edited in Experience Workspace the `404.html` inline
  `main.error { display:flex; align-items:center }` would center the editor content.

## Implementation (`scripts/scripts.js`)

```js
const SELF_CONTAINED_PAGES = new Set(['welcome']);

function markSelfContainedPage() {
  const page = window.location.pathname.split('/').filter(Boolean).pop();
  if (!SELF_CONTAINED_PAGES.has(page)) return;
  // A real 404 already gets no overlay via main.error — skip there to avoid a
  // needless failed fetch; only force the opt-out where the engine would default.
  if (document.querySelector('main')?.classList.contains('error')) return;
  document.body.dataset.template = 'none';
}

export async function loadPage() {
  if (redirectToMatchingBranch()) return;
  markSelfContainedPage();
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}
```

- **Path-based** so it also covers a not-yet-existing (404) welcome page.
- Called from `loadPage` so it **re-applies on every (re)decoration**, including
  after an editor replaces the body and re-invokes `loadPage` (Quick Edit /
  Experience Workspace `set-body`).
- Skips when `main.error` is already present (real 404), which the engine already
  resolves to no overlay — avoids an unnecessary failed fetch there.

## Assumptions

- The welcome page carries **no** `template` metadata (true today — it's exactly
  why it currently defaults to `wheelercat`). If it ever sets `template` meta,
  `getMetadata('template')` would win before `data-template`; we'd mark via meta.
- The overlay engine's call site runs during/after `loadEager` (i.e. after
  `loadPage` has run `markSelfContainedPage`).

## Cost / follow-up

- A `console.warn('[overlay] template not found: none')` + one 404 fetch on
  welcome-200 and welcome-while-editing, until the engine learns the `'none'`
  opt-out. Console-only; never seen by visitors.
- **Follow-up (separate, in the overlay-engine source):** treat
  `getMetadata('template') === 'none'` / `data-template === 'none'` as `return null`
  in `resolveTemplateName()` to drop the transient warning. No boilerplate change
  needed when that lands.

## Out of scope

- The overlay engine itself, Quick Edit booting, `index`/other-page behavior
  (unchanged), and the branch redirect (untouched).
