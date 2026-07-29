# Migration status waiting page — design

**Date:** 2026-06-11
**Status:** Approved (pending implementation)
**Scope:** `scripts/branch-redirect.js` (modify), `scripts/waiting.js` (new), `404.html` (modify)

## Summary

Give `main--sendto--aemcoder.<domain>/status/<id>` a dedicated, DA-styled
"your page is being prepared" page. It 404s (there is no such content), and a
new module takes over instead of the generic branch redirect: it polls a
migration backend for job `<id>` and, once the job is terminal, sends the user to
the DA canvas to view/edit the result.

```
main--sendto--aemcoder.<domain>/status/<id>
  → 404 → DA-styled "processing…" page
  → poll GET https://migration-backend-worker.paolo-moz.workers.dev/jobs/snowflake/<id>
  → 201 → https://da.live/canvas#/aemcoder/sendto/<id>/index
```

This is deliberately a **separate path** (`/status/...`) so it does not overload
the existing `/<id>` → branch-host redirect, which stays exactly as-is.

## Backend contract (given)

`GET /jobs/snowflake/:jobId`, called **without** an `Authorization` token (so the
client carries no secret). The no-token response is **status-only, empty body**:

| Status | Meaning | Page action |
|--------|---------|-------------|
| `200` | job queued or running | keep polling |
| `201` | job terminal (succeeded **or** failed) | redirect to DA canvas |
| `404` | unknown jobId | keep polling (tolerates registration race) |
| network error | — | keep polling |

CORS verified: the worker returns `access-control-allow-origin: *` (+ `GET, POST,
OPTIONS`), so the page can read the status cross-origin.

**Note on `201`:** terminal includes *failed*. Without a token we cannot tell
success from failure, so we redirect to the canvas on any `201`; if the job
failed (no doc created) the canvas shows its own "document not found" state for
`/aemcoder/sendto/<id>/index`. Distinguishing would require an authed call and is
out of scope.

## Components

### 1. `scripts/branch-redirect.js` — reserve the `status` segment

Today `getBranchRedirectUrl` would treat `status` as an id and bounce
`/status/<id>` to `status--sendto--aemcoder.<domain>`. Reserve it so `/status/…`
stays on `main` and 404s:

```js
const RESERVED_SEGMENTS = ['status'];
// ...inside getBranchRedirectUrl, after computing `segment`:
if (RESERVED_SEGMENTS.includes(segment)) return null;
```

This is the **only** change to existing redirect behavior, and it is surgical:
every other id still redirects exactly as before; there is no `isErrorPage` guard
and `scripts.js` is untouched. (On branch hosts the redirect already returns null
because `ref !== 'main'`, so this check only takes effect on `main`.)

### 2. `scripts/waiting.js` — the waiting page (new)

Triggered by the path, not the host (so it is testable on a branch preview):

```js
const STATUS_SEGMENT = 'status';
const WORKER_URL = 'https://migration-backend-worker.paolo-moz.workers.dev/jobs/snowflake/';
const CANVAS_URL = 'https://da.live/canvas#/aemcoder/sendto/';   // + <id> + '/index'
const POLL_INTERVAL_MS = 30000;
const TIMEOUT_MS = 20 * 60 * 1000;
const ID_RE = /^[A-Za-z0-9_-]+$/;
```

Flow:
1. Parse `pathname`: require `segments[0] === 'status'` and a valid
   `segments[1]` (matches `ID_RE`). Otherwise do nothing — the normal 404 shows.
2. Take over the page: hide the default 404 chrome (header/footer/error markup)
   and render the DA-styled "processing…" UI, with no flash of the default 404
   content.
3. Poll `GET ${WORKER_URL}${encodeURIComponent(id)}` (`cache: 'no-store'`, **no
   `Authorization` header**) immediately, then every `POLL_INTERVAL_MS`:
   - `201` → `window.location.replace(`${CANVAS_URL}${id}/index`)`
   - anything else / error → keep polling
   - once elapsed ≥ `TIMEOUT_MS` → stop and reveal the normal "Page not found"

### 3. `404.html` — load the module + hold the markup

- Add `<script nonce="aem" src="/scripts/waiting.js" type="module"></script>`.
- Keep the existing "Page not found" markup (used for the fallback and all
  non-`/status/` 404s).
- Add the DA-styled processing markup + scoped CSS that `waiting.js` reveals
  (clean, light, centered: a subtle spinner + a heading like "We're preparing
  your page…" and a short subline).

`scripts.js` still loads on the 404 page and still runs the branch-redirect for
normal ids (preserving today's behavior); for `/status/…` the reserved-segment
check returns null, so it does not redirect and `waiting.js` owns the page.

## Constants / configuration

Worker base URL, canvas base URL, `status` keyword, `aemcoder/sendto` org/site,
30s interval, and 20-min cap are named constants (the worker is a `.workers.dev`
dev URL today and easy to change).

## Error handling

The page must never get stuck: any non-`201` status, JSON parse irrelevance
(body is ignored), or network error keeps the poll loop alive until the 20-min
cap, after which it falls back to the standard 404. The poll loop is guarded so a
single failed fetch does not abort it.

## Testing

- `scripts/branch-redirect.js`: add a unit case `/status/<id>` → `null` to
  `test/branch-redirect.test.mjs`; existing cases still pass.
- `scripts/waiting.js`: browser/network behavior (poll + redirect) is not
  unit-testable without a DOM and the live worker; verify manually on the branch
  preview (the trigger is path-based, so
  `https://status-waiting-page--sendto--aemcoder.aem.page/status/<test-id>` will
  exercise it). Confirm: the DA-styled page renders, the worker is polled every
  30s, a `201` redirects to the canvas URL, and the 20-min fallback reveals the
  normal 404.
- `npm run lint` clean.

## Out of scope

- Distinguishing job success vs failure (needs an authed call).
- Any change to the existing `/<id>` → branch redirect beyond reserving `status`.
