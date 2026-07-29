# Branch-matching Redirect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the `main` preview/live host, redirect `…/<segment>/` to the branch host named by that segment (e.g. `main--sendto--aemcoder.aem.page/1234/` → `1234--sendto--aemcoder.aem.page/1234/`).

**Architecture:** A pure, zero-dependency module `scripts/branch-redirect.js` computes the redirect target from a location-like object (unit-tested under Node). `scripts/scripts.js` imports it, wraps it in a side-effecting guard, and calls that guard as the first statement of `loadPage()` — before `loadEager` adds `body.appear`, so nothing renders on a redirected hit (zero flash).

**Tech Stack:** Vanilla ES module JavaScript (no build), Node for tests (`node:assert`), ESLint (airbnb-base).

---

## Why a separate module (context for the implementer)

- `scripts/scripts.js` imports `scripts/aem.js`, which runs `init()` → `sampleRUM('top')` at module load, touching `window`/`document`/`addEventListener`/`CustomEvent`. So `scripts.js` **cannot be imported in Node**, and `aem.js` must never be modified. Putting the pure logic in its own import-free module makes it Node-testable.
- `scripts/*.js` use ESM `export`. Node treats `.js` as CommonJS unless the nearest `package.json` says `"type": "module"`. Adding `scripts/package.json` with exactly `{ "type": "module" }` makes Node parse the module as ESM. The browser ignores `package.json`; `.hlxignore` already excludes any `package.json` from being served; ESLint does not lint JSON.
- The test file uses the `.mjs` extension. `npm run lint` runs `eslint .`, which only lints `.js` by default, so the `.mjs` test is not linted. `.hlxignore` already contains `test/*`, so it is not served.

---

## File Structure

- `scripts/branch-redirect.js` — **new.** Pure function `getBranchRedirectUrl(loc)`. No DOM, no imports.
- `scripts/package.json` — **new.** `{ "type": "module" }` so Node parses `scripts/*.js` as ESM for tests.
- `test/branch-redirect.test.mjs` — **new.** Node test asserting the full edge-case table against the real exported function.
- `scripts/scripts.js` — **modified.** Import the pure function, add `redirectToMatchingBranch()` wrapper, call it first in `loadPage()`.

---

## Task 1: Pure redirect module + Node test

**Files:**
- Create: `scripts/package.json`
- Create: `test/branch-redirect.test.mjs`
- Create: `scripts/branch-redirect.js`

- [ ] **Step 1: Add the ESM marker so Node parses `scripts/*.js` as modules**

Create `scripts/package.json`:

```json
{
  "type": "module"
}
```

- [ ] **Step 2: Write the failing test (full edge-case table)**

Create `test/branch-redirect.test.mjs`:

```js
import assert from 'node:assert/strict';
import { getBranchRedirectUrl } from '../scripts/branch-redirect.js';

const loc = (hostname, pathname, search = '', hash = '', protocol = 'https:') => ({
  hostname, pathname, search, hash, protocol,
});

const cases = [
  ['canonical page', loc('main--sendto--aemcoder.aem.page', '/1234/'),
    'https://1234--sendto--aemcoder.aem.page/1234/'],
  ['live + query + hash', loc('main--sendto--aemcoder.aem.live', '/1234/x', '?q=1', '#h'),
    'https://1234--sendto--aemcoder.aem.live/1234/x?q=1#h'],
  ['root path', loc('main--sendto--aemcoder.aem.page', '/'), null],
  ['already main path', loc('main--sendto--aemcoder.aem.page', '/main/foo'), null],
  ['target host (no loop)', loc('1234--sendto--aemcoder.aem.page', '/1234/'), null],
  ['non-main source', loc('5678--sendto--aemcoder.aem.page', '/1234/'), null],
  ['localhost dev', loc('localhost', '/1234/'), null],
  ['non-dns segment', loc('main--sendto--aemcoder.aem.page', '/Hello%20World/'), null],
  ['router word path', loc('main--sendto--aemcoder.aem.page', '/products/'),
    'https://products--sendto--aemcoder.aem.page/products/'],
];

let failures = 0;
for (const [name, input, expected] of cases) {
  try {
    assert.equal(getBranchRedirectUrl(input), expected);
    process.stdout.write(`PASS  ${name}\n`);
  } catch (err) {
    failures += 1;
    process.stdout.write(`FAIL  ${name}: ${err.message}\n`);
  }
}
process.stdout.write(failures ? `\n${failures} FAILED\n` : '\nALL PASS\n');
process.exit(failures ? 1 : 0);
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node test/branch-redirect.test.mjs`
Expected: FAIL — `Cannot find module '.../scripts/branch-redirect.js'` (the module does not exist yet).

- [ ] **Step 4: Implement the pure module**

Create `scripts/branch-redirect.js`:

```js
/*
 * Branch-matching redirect for the main router host.
 *
 * On the default-branch preview/live host, redirect to the branch host named by
 * the first path segment, e.g.
 *   https://main--sendto--aemcoder.aem.page/1234/
 *     -> https://1234--sendto--aemcoder.aem.page/1234/
 *
 * Pure module: no DOM or global access, so it can be unit-tested under Node.
 */

const DEFAULT_BRANCH = 'main';

/**
 * Computes the branch-matching redirect target for the main router host.
 * @param {{hostname: string, pathname: string, search: string,
 *   hash: string, protocol: string}} loc location-like object
 * @returns {string|null} absolute redirect URL, or null when no redirect applies
 */
// eslint-disable-next-line import/prefer-default-export
export function getBranchRedirectUrl({
  hostname, pathname, search, hash, protocol,
}) {
  // only AEM preview/live hosts (excludes localhost and custom domains)
  if (!/\.aem\.(page|live)$/.test(hostname)) return null;

  // must be a branch host: split at the first '--'
  const separator = hostname.indexOf('--');
  if (separator < 0) return null;
  const ref = hostname.slice(0, separator);
  const rest = hostname.slice(separator); // '--repo--owner.aem.page|live'

  // only redirect away from the default (router) branch
  if (ref !== DEFAULT_BRANCH) return null;

  // first path segment, if any
  const segment = pathname.split('/')[1] || '';
  if (!segment || segment === DEFAULT_BRANCH) return null;

  // only build DNS-valid branch hosts (drops e.g. '/Hello%20World/')
  if (!/^[A-Za-z0-9-]+$/.test(segment)) return null;

  // branch host matching the path segment, preserving path/query/hash
  return `${protocol}//${segment}${rest}${pathname}${search}${hash}`;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node test/branch-redirect.test.mjs`
Expected: 9 × `PASS`, then `ALL PASS`, exit code 0.

- [ ] **Step 6: Lint the new production module**

Run: `npm run lint:js`
Expected: no errors. (`scripts/branch-redirect.js` is linted; the `.mjs` test and `.json` are not.)

- [ ] **Step 7: Commit**

```bash
git add scripts/branch-redirect.js scripts/package.json test/branch-redirect.test.mjs
git commit -m "feat: pure branch-redirect URL helper with Node tests"
```

---

## Task 2: Wire the redirect into `scripts.js`

**Files:**
- Modify: `scripts/scripts.js` (import at top; new `redirectToMatchingBranch()`; guard call in `loadPage()`)

- [ ] **Step 1: Add the import**

In `scripts/scripts.js`, immediately after the existing `} from './aem.js';` import block, add:

```js
import { getBranchRedirectUrl } from './branch-redirect.js';
```

- [ ] **Step 2: Add the wrapper function**

In `scripts/scripts.js`, directly above `async function loadPage() {`, add:

```js
/**
 * Redirects to the branch host matching the first path segment when the page is
 * served from the default (router) branch host. Runs before any content render.
 * @returns {boolean} true if a redirect was initiated
 */
function redirectToMatchingBranch() {
  try {
    const url = getBranchRedirectUrl(window.location);
    if (url) {
      window.location.replace(url);
      return true;
    }
  } catch (e) {
    // A bug in the redirect guard must never block the page from loading.
  }
  return false;
}
```

- [ ] **Step 3: Guard `loadPage()`**

In `scripts/scripts.js`, change `loadPage` from:

```js
async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}
```

to:

```js
async function loadPage() {
  if (redirectToMatchingBranch()) return;
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}
```

Leave the existing `loadPage();` call at the bottom of the file unchanged.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors (JS + CSS).

- [ ] **Step 5: Re-run the unit test (unchanged, still green)**

Run: `node test/branch-redirect.test.mjs`
Expected: `ALL PASS`, exit code 0.

- [ ] **Step 6: Commit**

```bash
git add scripts/scripts.js
git commit -m "feat: redirect main router host to branch host matching the path"
```

---

## Task 3: Manual verification & PR notes

- [ ] **Step 1: Local sanity check (dev server does not trigger the redirect)**

Start dev server if desired: `npx -y @adobe/aem-cli up --no-open --forward-browser-logs`.
On `http://localhost:3000/1234/` the host is `localhost` → **no redirect** (by design); the page loads normally. This confirms dev is unaffected; it does **not** exercise the redirect.

- [ ] **Step 2: Record the e2e limitation in the PR**

End-to-end activation only happens on the **main** host (`ref === 'main'`). A feature-branch preview has `ref = <branch> ≠ main`, so the redirect does not fire there — it cannot be demonstrated on `branch-redirect--sendto--aemcoder.aem.page`. State this in the PR description, and point reviewers at:
- `node test/branch-redirect.test.mjs` (the asserted edge-case table), and
- the post-merge check below.

- [ ] **Step 3: Post-merge verification on main**

After merge, confirm in a browser:
- `https://main--sendto--aemcoder.aem.page/1234/` → lands on `https://1234--sendto--aemcoder.aem.page/1234/`
- `https://main--sendto--aemcoder.aem.page/` → stays (root, no redirect)
- `https://1234--sendto--aemcoder.aem.page/1234/` → stays (no loop)

---

## Self-Review (completed by plan author)

- **Spec coverage:** host gate, `--` split, main-only source, first-segment match, DNS-safe segment guard, path/query/hash preservation, `replace` semantics, zero-flash placement, error handling, and the testing/limitation notes from the spec each map to a step above. ✓
- **Placeholder scan:** none — every code/command step is complete. ✓
- **Type/name consistency:** `getBranchRedirectUrl`, `redirectToMatchingBranch`, `DEFAULT_BRANCH`, and `scripts/branch-redirect.js` / `test/branch-redirect.test.mjs` paths are used identically across all tasks. ✓
