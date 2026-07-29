# Branch-matching redirect — design

**Date:** 2026-06-10
**Status:** Approved (pending implementation)
**Scope:** `scripts/branch-redirect.js` (new), `scripts/scripts.js`

## Summary

On the **main** preview/live host, redirect the visitor to the branch host named
by the first path segment, so the host's branch always matches the path. The
canonical example:

```
https://main--sendto--aemcoder.aem.page/1234/
  → https://1234--sendto--aemcoder.aem.page/1234/
```

This turns the `main` host into a small **router**: its job is to bounce
`/<branch>/…` to `<branch>--sendto--aemcoder.<domain>`.

## Requirements (decided with the user)

- **Match rule — "any non-matching segment":** redirect whenever the first path
  segment differs from the host's branch. (User explicitly accepted that, on the
  main host, this means normal content paths such as `/products/` also redirect —
  the main host is treated as a pure router and only serves `/` and `/main/*`.)
- **Source hosts — main only:** the check runs *only* when the current host's
  branch is `main`. Other branch hosts never redirect away. This also guarantees
  no redirect loop.
- **Environments — preview + live:** applies to both `*.aem.page` and
  `*.aem.live`. Localhost and any custom production domain are excluded.

## Approach (selected: B′ — tested module)

The pure URL function lives in a new zero-dependency module
`scripts/branch-redirect.js` and is imported by `scripts/scripts.js`, which
defines a thin side-effecting wrapper. The wrapper is called as the **first
statement of `loadPage()`** and returns early before `loadEager`. Because the
boilerplate keeps `body { display: none }` until `loadEager` adds `body.appear`,
redirecting before that point is **zero-flash** — no content renders and no
sections are fetched on a redirected hit.

The pure logic is split into its own module (rather than inlined in
`scripts.js`) for one concrete reason: `scripts.js` imports `aem.js`, which calls
`init()` → `sampleRUM('top')` at module load, touching `window`, `document`,
`addEventListener`, `CustomEvent`, etc. That makes `scripts.js` impossible to
import in Node, so an inlined function could not be unit-tested (and `aem.js`
must never be modified). A standalone, import-free `branch-redirect.js` is
unit-testable in plain Node. The cost is one tiny (~0.5 KB), same-origin module
request — fetched in parallel with the `aem.js` request already in flight,
HTTP/2-multiplexed and cached after first load. Production behavior and redirect
timing are identical to the inline version.

Rejected alternatives:
- **A — inline nonce'd script in `head.html`:** earliest possible (can skip the
  app modules on the router), but not unit-testable and edits critical-path HTML
  under CSP. Not worth it for a few KB.
- **B (pure inline in `scripts.js`):** simplest, but not unit-testable because
  `scripts.js` cannot be imported in Node (see above).

## Control flow

```js
async function loadPage() {
  if (redirectToMatchingBranch()) return;   // navigation in progress, stop
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}
```

## Functions

`scripts/branch-redirect.js` (new, zero-dependency, exports the pure function):

```js
const DEFAULT_BRANCH = 'main';

/**
 * Computes the branch-matching redirect target for the main router host.
 * Pure: depends only on the passed location-like object.
 * @param {{hostname:string, pathname:string, search:string, hash:string, protocol:string}} loc
 * @returns {string|null} absolute redirect URL, or null when no redirect applies
 */
export function getBranchRedirectUrl(loc) { /* see algorithm */ }
```

`scripts/scripts.js` (imports the pure function, defines the wrapper):

```js
import { getBranchRedirectUrl } from './branch-redirect.js';

/**
 * Redirects to the branch host matching the first path segment, when on the
 * main router host. Returns true if a redirect was initiated.
 */
function redirectToMatchingBranch() {
  try {
    const url = getBranchRedirectUrl(window.location);
    if (url) { window.location.replace(url); return true; }
  } catch (e) {
    // A bug in the redirect guard must never block the page from loading.
  }
  return false;
}
```

`window.location.replace` (not `assign`) is used so the Back button does not
ping-pong between the main host and the branch host.

## Algorithm (`getBranchRedirectUrl`)

1. **Host gate:** `hostname` must end with `.aem.page` or `.aem.live`; otherwise
   return `null`. Excludes localhost and custom domains.
2. **Branch host gate:** `hostname` must contain `--`. Split at the **first**
   `--`: `ref` = substring before it, `rest` = substring from it onward
   (`--repo--owner.aem.page|live`).
3. **Source gate:** if `ref !== DEFAULT_BRANCH` return `null`. (main-only; also
   guarantees the redirect target — whose ref becomes the segment — never
   re-triggers.)
4. **Segment:** `segment = pathname.split('/')[1]`. If empty (root) or equal to
   `DEFAULT_BRANCH`, return `null`.
5. **Safety:** `segment` must match `^[A-Za-z0-9-]+$`; otherwise return `null`.
   Ensures we only construct DNS-valid branch hosts (drops e.g.
   `/Hello%20World/`).
6. **Build:** return
   `` `${protocol}//${segment}${rest}${pathname}${search}${hash}` ``.
   Full path, query string, and hash are preserved.

## Edge cases

| URL | Result |
|---|---|
| `main--sendto--aemcoder.aem.page/1234/` | → `https://1234--sendto--aemcoder.aem.page/1234/` (canonical) |
| `main--sendto--aemcoder.aem.live/1234/x?q=1#h` | → `https://1234--sendto--aemcoder.aem.live/1234/x?q=1#h` (live + query + hash preserved) |
| `main--sendto--aemcoder.aem.page/` (root) | no redirect |
| `main--sendto--aemcoder.aem.page/main/foo` | no redirect (main host serves `/main/*`) |
| `1234--sendto--aemcoder.aem.page/1234/` | no redirect (ref ≠ main → no loop) |
| `5678--sendto--aemcoder.aem.page/1234/` | no redirect (source = main only) |
| `localhost:3000/1234/` | no redirect (dev untouched) |
| `main--sendto--aemcoder.aem.page/Hello%20World/` | no redirect (segment not DNS-safe) |
| `main--sendto--aemcoder.aem.page/products/` | → `https://products--sendto--aemcoder.aem.page/products/` (router behavior, accepted) |

## Error handling

The wrapper's `try/catch` protects site availability: if the guard ever throws,
the page falls through to a normal load instead of bricking every request. The
catch is deliberate and commented — it guards availability, not an expected
error.

## Testing

- No test runner ships with the boilerplate (lint only). The pure
  `getBranchRedirectUrl` is exported from a zero-dependency module, so the
  edge-case table is verified with a plain Node script
  (`node test/branch-redirect.test.mjs`) that imports the real function and
  asserts each row. No test framework is added (keeps the zero-build ethos); the
  script uses `node:assert` and a non-zero exit on failure.
- `npm run lint` (Airbnb + Stylelint) must pass.
- **Limitation:** end-to-end activation only occurs on the **main** host. A
  feature-branch preview has `ref = <branch> ≠ main`, so the redirect does not
  fire there. Pre-merge confidence comes from the pure-function checks, lint, and
  code review; full e2e verification happens post-merge on the main host. This
  makes the AGENTS.md "preview link" PR requirement awkward for a main-only
  redirect — to be flagged at the PR step.
