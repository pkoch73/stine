# Quick Edit Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable da.live Quick Edit (in-preview authoring) on this Edge Delivery Services site, triggered by the AEM Sidekick "Quick Edit" button or a `?quick-edit` URL parameter.

**Architecture:** A new `tools/quick-edit/quick-edit.js` loads the da.live Quick Edit plugin on demand (via an injected import map + dynamic import). `scripts/scripts.js` exports `loadPage`, wires a Sidekick `custom:quick-edit` listener and a `?quick-edit` param check, and skips `waitForFirstImage` while editing. The merged branch-redirect is left untouched — it carries `?quick-edit` to the branch host, where Quick Edit then initializes.

**Tech Stack:** Vanilla ES module JavaScript (no build), AEM Edge Delivery Services, da.live, AEM Sidekick. ESLint airbnb-base.

---

## Critical context for the implementer

- **No automated test is possible for the Quick Edit wiring** — it needs a real browser, the AEM Sidekick, and da.live authentication. The verification gates here are: `npm run lint` passes, the existing `node test/branch-redirect.test.mjs` still passes, and manual checks on the deployed preview. Do **not** add a test framework.
- **ESLint `import/no-unresolved`, `import/named`, and `import/no-cycle` are all `error`.** Therefore:
  - `tools/quick-edit/quick-edit.js` statically imports `loadPage` from `scripts.js`, so `loadPage` MUST be exported (done in Task 1, same commit).
  - `scripts.js` dynamically imports `'../tools/quick-edit/quick-edit.js'` with a literal path, which `import/no-unresolved` checks — so that file MUST exist before those lines are added (Task 1 creates it; Task 2 adds the references).
  - The scripts.js ↔ quick-edit.js import relationship is a cycle, so the `// eslint-disable-next-line import/no-cycle` comments are required exactly where shown.
- `tools/` is served (not in `.hlxignore`) and is linted by `eslint .`. Both are intended.
- **Do NOT modify `scripts/aem.js` or the branch-redirect logic** (`scripts/branch-redirect.js`, or the redirect guard inside `loadPage`).

## File Structure

- `tools/quick-edit/quick-edit.js` — **new.** Loads the da.live Quick Edit plugin; injects a nonce'd import map; builds the Sidekick payload.
- `scripts/scripts.js` — **modified.** Export `loadPage`; `loadEager` `waitForFirstImage` guard; `loadLazy` Sidekick listener; bottom `?quick-edit` IIFE.

---

## Task 1: Quick Edit module + export `loadPage`

Both changes land in one commit so the static import of `loadPage` resolves.

**Files:**
- Create: `tools/quick-edit/quick-edit.js`
- Modify: `scripts/scripts.js` (export `loadPage`)

- [ ] **Step 1: Create `tools/quick-edit/quick-edit.js`**

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
  // This site serves a random per-request CSP nonce under 'strict-dynamic';
  // reuse the live nonce so the injected import map is allowed.
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

- [ ] **Step 2: Export `loadPage` in `scripts/scripts.js`**

Find:
```js
async function loadPage() {
  if (redirectToMatchingBranch()) return;
```
Replace the first line so it reads:
```js
export async function loadPage() {
  if (redirectToMatchingBranch()) return;
```
(Leave the redirect guard and the rest of the function unchanged.)

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: exit 0, no errors. (If `node_modules` is missing, run `npm install` first — it is gitignored, do not commit it.)

- [ ] **Step 4: Confirm the branch-redirect test still passes**

Run: `node test/branch-redirect.test.mjs`
Expected: `ALL PASS`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add tools/quick-edit/quick-edit.js scripts/scripts.js
git commit -m "feat: add da.live Quick Edit module and export loadPage"
```
End the commit body with:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 2: Wire Quick Edit triggers into `scripts.js`

**Files:**
- Modify: `scripts/scripts.js` (loadEager guard, loadLazy Sidekick listener, bottom `?quick-edit` IIFE)

- [ ] **Step 1: Guard `waitForFirstImage` in `loadEager`**

In `scripts/scripts.js`, find:
```js
    await loadSection(main.querySelector('.section'), waitForFirstImage);
```
Replace with:
```js
    await loadSection(main.querySelector('.section'), (section) => {
      if (document.body.classList.contains('quick-edit')) return Promise.resolve();
      return waitForFirstImage(section);
    });
```

- [ ] **Step 2: Add the Sidekick listener at the end of `loadLazy`**

In `scripts/scripts.js`, find the end of `loadLazy` (the `loadFonts();` call followed by the closing brace):
```js
  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
}
```
Replace with:
```js
  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();

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
}
```

- [ ] **Step 3: Add the `?quick-edit` IIFE at the bottom of the file**

In `scripts/scripts.js`, find the final line:
```js
loadPage();
```
Replace with:
```js
loadPage();

(() => {
  const hasQE = new URL(window.location.href).searchParams.has('quick-edit');
  // eslint-disable-next-line import/no-cycle
  if (hasQE) import('../tools/quick-edit/quick-edit.js').then((mod) => mod.default());
})();
```

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: exit 0, no errors. (Confirms the dynamic import path resolves and the cycle is suppressed.)

- [ ] **Step 5: Confirm the branch-redirect test still passes**

Run: `node test/branch-redirect.test.mjs`
Expected: `ALL PASS`, exit 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/scripts.js
git commit -m "feat: wire Quick Edit into scripts.js (sidekick + ?quick-edit)"
```
End the commit body with:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 3: Verification & external config handoff

This task produces no code. It verifies what can be verified pre-config and records the external steps the user must apply.

- [ ] **Step 1: Push the branch so the preview builds**

```bash
git push -u origin quick-edit
```

- [ ] **Step 2: Pre-config browser check on the preview**

Open `https://quick-edit--sendto--aemcoder.aem.page/?quick-edit` in a browser with DevTools open. Confirm:
- In Elements/Console: a `<script type="importmap">` is injected into `<head>` carrying a `nonce` attribute, and there is **no CSP violation** logged for it.
- In Network: a request to `https://da.live/nx/public/plugins/quick-edit/quick-edit.js` (and the `da.live/deps/...` modules) fires.

Note: this branch host (`ref = quick-edit ≠ main`) does not trigger the branch-redirect, so the page loads in place and exercises the `?quick-edit` path directly. Full editing still requires the external config in Step 3.

- [ ] **Step 3: Hand the external config to the user (cannot be done from the repo)**

Provide these two items for the user to apply:

1. **AEM Sidekick** project config — add this plugin object to the project's Sidekick config:
   ```json
   { "id": "quick-edit", "title": "Quick Edit", "environments": ["dev", "preview"], "event": "quick-edit" }
   ```
2. **da.live org config sheet** at `https://da.live/config#/aemcoder/` — add a row: key `quick-edit`, value `sendto`.

- [ ] **Step 4: Post-config end-to-end (user, after Step 3 config is live)**

On a preview page with the Sidekick loaded, click **Quick Edit**; the da.live editor loads in place and edits persist to the DA document at `content.da.live/aemcoder/sendto/<path>`.

---

## Self-Review (completed by plan author)

- **Spec coverage:** new module (Task 1), export `loadPage` (Task 1), `waitForFirstImage` guard (Task 2), `loadLazy` Sidekick listener (Task 2), `?quick-edit` IIFE (Task 2), CSP nonce on import map (Task 1, in the module), redirect-unchanged (explicitly not touched), external config (Task 3), testing/limitations (Task 3) — all present. ✓
- **Placeholder scan:** none — every code/command step is complete. ✓
- **Type/name consistency:** `loadPage`, `addImportmap`, `loadModule`, `generateSidekickPayload`, `init`, `loadQuickEdit`, `addSidekickListeners`, and the path `../tools/quick-edit/quick-edit.js` / `../../scripts/scripts.js` are used identically across tasks. ✓
- **Lint ordering:** Task 1 creates the import target and the named export together (resolves `import/named` + `import/no-unresolved`); Task 2 adds the dynamic imports only after the target exists, with `import/no-cycle` suppressions. ✓
