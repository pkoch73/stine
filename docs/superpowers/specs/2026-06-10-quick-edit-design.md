# Quick Edit support — design

**Date:** 2026-06-10
**Status:** Approved (pending implementation)
**Scope:** `tools/quick-edit/quick-edit.js` (new), `scripts/scripts.js` (modify)
**Reference:** https://docs.da.live/about/early-access/quick-edit · ground truth `aemsites/author-kit`

## Summary

Enable da.live **Quick Edit** (in-preview visual authoring) for this Edge
Delivery Services project. Quick Edit loads the editor plugin from da.live on
demand — triggered either by the AEM Sidekick "Quick Edit" button
(`custom:quick-edit` event) or by a `?quick-edit` URL parameter — and edits the
DA content document that backs the current page.

## Context & key findings

- `aemsites/author-kit` (the canonical reference) uses a different core
  (`ak.js`/`loadArea`) and **ships no CSP**. Our repo is standard aem-boilerplate
  with the boilerplate's strict CSP, so the da.live docs' *"existing project"*
  snippets are the correct reference, plus one CSP adaptation (below).
- The module ground truth (`author-kit/tools/quick-edit/quick-edit.js`) matches
  the docs. It contains an upstream typo `loadMoudle` which we correct to
  `loadModule`.
- **CSP nonce (verified empirically):** the edge substitutes a *random
  per-request* nonce — observed `content-security-policy: script-src
  'nonce-wRyLJf2t1xJwemsBTmt7UCpi' 'strict-dynamic' 'unsafe-inline' http:
  https:; …`. The static `aem` placeholder in `head.html` is replaced at serve
  time. Therefore the injected `<script type="importmap">` must carry the
  **runtime** nonce, read via the `.nonce` IDL property of an existing trusted
  script (Chrome blanks the `nonce` content attribute but preserves `.nonce`).
  Hardcoding `aem` would fail.

## Interaction with the merged branch-redirect — no change needed

The branch-redirect runs first in `loadPage()` and only fires on the `main` host
for a first path segment that isn't `main`. It **preserves the query string**
(covered by its unit test). Traced through:

- `main--…/1234/?quick-edit` → redirect carries `?quick-edit` to
  `1234--…/1234/?quick-edit` → there `ref=1234≠main` so no further redirect → the
  `?quick-edit` IIFE inits QE **on the branch host**. ✅
- `main--…/1234/` + Sidekick button → redirect lands the author on
  `1234--…/1234/`; `loadLazy` runs there and the `custom:quick-edit` listener is
  attached → button works. ✅
- `main--…/` and `main--…/main/*` → no redirect → QE works directly on main. ✅

`generateSidekickPayload` derives `mountpoint` and `pathname` from the
host/location, so the edited DA doc is identical regardless of which host the
author arrives on. The redirect simply routes the author to the correct branch
host first. **The redirect guard is left untouched.**

## Components

### 1. `tools/quick-edit/quick-edit.js` (new)

Ground-truth module with two deltas: (a) `addImportmap()` sets the runtime nonce
on the importmap element; (b) `loadMoudle` → `loadModule`.

```js
// eslint-disable-next-line import/no-cycle
import { loadPage } from '../../scripts/scripts.js';

const importMap = {
  imports: {
    'da-lit': 'https://da.live/deps/lit/dist/index.js',
    'da-y-wrapper': 'https://da.live/deps/da-y-wrapper/dist/index.js',
  },
};

function addImportmap() {
  const importmapEl = document.createElement('script');
  importmapEl.type = 'importmap';
  // CSP: this site serves a random per-request nonce under 'strict-dynamic';
  // reuse the live nonce so the injected importmap is allowed.
  const nonce = document.querySelector('script[src$="/scripts/scripts.js"]')?.nonce;
  if (nonce) importmapEl.nonce = nonce;
  importmapEl.textContent = JSON.stringify(importMap);
  document.head.appendChild(importmapEl);
}

async function loadModule(origin, payload) {
  const { default: loadQuickEdit } = await import(`${origin}/nx/public/plugins/quick-edit/quick-edit.js`);
  loadQuickEdit(payload, loadPage);
}

// creates sidekick payload when loading QE from query param
function generateSidekickPayload() {
  let { hostname } = window.location;
  if (hostname === 'localhost') {
    hostname = document.querySelector('meta[property="hlx:proxyUrl"]').content;
  }
  const parts = hostname.split('.')[0].split('--');
  const [, repo, owner] = parts;

  return {
    detail: {
      config: { mountpoint: `https://content.da.live/${owner}/${repo}/` },
      location: { pathname: window.location.pathname },
    },
  };
}

export default function init(payload) {
  const { search } = window.location;
  const ref = new URLSearchParams(search).get('quick-edit');
  // `ref` flows into a dynamic import() origin. Restrict it to a DNS-safe da-nx
  // branch token so a crafted ?quick-edit= value cannot point import() at an
  // attacker-controlled origin (`#`, `?`, `@`, `/` would break out of the
  // authority). Anything unexpected falls back to the trusted default.
  let origin;
  if (!ref || ref === 'on') {
    origin = 'https://da.live';
  } else if (ref === 'local') {
    origin = 'http://localhost:6456';
  } else if (/^[a-z0-9-]{1,63}$/i.test(ref)) {
    origin = `https://${ref}--da-nx--adobe.aem.live`;
  } else {
    origin = 'https://da.live';
  }
  addImportmap();
  loadModule(origin, payload || generateSidekickPayload());
}
```

> **Security note (deviation from upstream):** the upstream/author-kit module
> interpolates the raw `?quick-edit` value straight into the `import()` origin.
> Under our `strict-dynamic` CSP that is a reflected-XSS → RCE vector (trusted-
> chain imports bypass the host allowlist). We validate `ref` against
> `^[a-z0-9-]{1,63}$` before interpolation, which fully closes it — no character
> that could alter the URL authority survives the allowlist, so no further
> `new URL()` hostname assertion is needed.

### 2. `scripts/scripts.js` (modify)

Four edits; the redirect guard is unchanged.

- **Export `loadPage`:** `async function loadPage()` → `export async function loadPage()`.
- **`loadEager` — guard `waitForFirstImage`:**
  ```js
  await loadSection(main.querySelector('.section'), (section) => {
    if (document.body.classList.contains('quick-edit')) return Promise.resolve();
    return waitForFirstImage(section);
  });
  ```
- **`loadLazy` — attach the Sidekick listener** (append at end of the function):
  ```js
  const loadQuickEdit = async (...args) => {
    // eslint-disable-next-line import/no-cycle
    const { default: initQuickEdit } = await import('../tools/quick-edit/quick-edit.js');
    initQuickEdit(...args);
  };
  const addSidekickListeners = (sk) => {
    sk.addEventListener('custom:quick-edit', loadQuickEdit);
  };
  const sk = document.querySelector('aem-sidekick');
  if (sk) {
    addSidekickListeners(sk);
  } else {
    document.addEventListener('sidekick-ready', () => {
      addSidekickListeners(document.querySelector('aem-sidekick'));
    }, { once: true });
  }
  ```
- **Bottom — `?quick-edit` param** (keep the existing `loadPage();` call, add after it):
  ```js
  (() => {
    const hasQE = new URL(window.location.href).searchParams.has('quick-edit');
    // eslint-disable-next-line import/no-cycle
    if (hasQE) import('../tools/quick-edit/quick-edit.js').then((mod) => mod.default());
  })();
  ```

## External configuration (owned by the user; documented, not in repo)

- **AEM Sidekick** project config — add a custom plugin:
  ```json
  { "id": "quick-edit", "title": "Quick Edit", "environments": ["dev", "preview"], "event": "quick-edit" }
  ```
- **da.live org config sheet** (`https://da.live/config#/aemcoder/`): add a row
  with key `quick-edit` and value `sendto` (comma-separated repo list).

## Error handling

Matches upstream — no added wrapping. Quick Edit runs only on explicit author
action or `?quick-edit`, so a failed plugin load cannot affect normal visitors.
The `loadEager` guard returns `Promise.resolve()` when the `quick-edit` body
class is present so re-renders aren't blocked on the first image.

## Testing

- `npm run lint` must pass for the new/changed JS (airbnb-base). The
  `import/no-cycle` disable comments are kept to match the documented integration
  (the scripts.js ↔ quick-edit.js dynamic/static import relationship).
- The existing `node test/branch-redirect.test.mjs` still passes (branch-redirect
  logic is untouched).
- **No automated test for the QE wiring** — it requires a browser, the AEM
  Sidekick, and da.live authentication. **Limitation:** full Quick Edit only
  functions after the external config (org sheet + Sidekick plugin) is applied by
  the user. Pre-config verification on the branch preview:
  1. Open `…?quick-edit` and confirm in DevTools that the importmap is injected
     **with a nonce** and there are **no CSP violations** for it in the console.
  2. Confirm the `da.live/nx/public/plugins/quick-edit/quick-edit.js` request fires.
- Post-config: the Sidekick "Quick Edit" button loads the editor on a preview
  page and edits persist to the DA document.
