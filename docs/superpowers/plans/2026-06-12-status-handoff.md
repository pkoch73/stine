# Status Waiting Experience (handoff-v3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal `/status/<id>` spinner with the handoff-v3 "Preparing your page…" experience, rendered full-screen in an iframe, while `scripts/waiting.js` keeps polling the migration worker and redirects to the DA canvas on `201`.

**Architecture:** The handoff ships as a self-contained page under `tools/status/` (its own HTML/CSS/JS/woff2 fonts, demo controls stripped, real pacing). `scripts/waiting.js` embeds it in a full-viewport `<iframe>` and polls the worker in the parent → on `201` redirects the top window. The iframe loads no `scripts.js`, so it's fully isolated.

**Tech Stack:** Vanilla ES module JavaScript (no build), AEM Edge Delivery Services, a Cloudflare Worker status API, da.live canvas, woff2 fonts. Repo lint tooling was removed in #5 → `node --check` for syntax.

---

## Critical context for the implementer

- **Source handoff:** `/Users/kpauls/Downloads/handoff-v3/` (`index.html`, `styles.css`, `script.js`, `fonts/*.otf`). Copy + transform these; do **not** copy `shots/` or `assets/` (unreferenced design storyboard).
- **No linter** (removed in #5). Validate JS with `node --check <file>`. Do not add a linter or test framework.
- `tools/` files are served by EDS (confirmed for `tools/status/status.html`). The iframe page loads no `scripts.js`, so the branch-redirect/waiting logic never runs inside it.
- The `status` path is already reserved in `scripts/branch-redirect.js`, so `/status/<id>` 404s and is handled by `waiting.js` — **no change to `branch-redirect.js` or `404.html`** (it already loads `waiting.js`).
- Do NOT modify `scripts/aem.js`, `scripts/scripts.js`, or `scripts/branch-redirect.js`.

## File Structure

- `tools/status/fonts/*.woff2` — **new.** 6 Adobe Clean faces converted from the handoff OTFs.
- `tools/status/status.css` — **new.** `styles.css` verbatim, `@font-face` repointed to woff2.
- `tools/status/status.js` — **new.** `script.js` with demo controls stripped + real pacing fixed.
- `tools/status/status.html` — **new.** `index.html` with presenter elements removed + css/js refs repointed.
- `scripts/waiting.js` — **modify.** Embed the iframe; poll until `201`; drop the 20-min cap.

---

## Task 1: Convert fonts to woff2

**Files:**
- Create: `tools/status/fonts/AdobeClean-Regular.woff2`, `AdobeClean-Medium.woff2`, `AdobeClean-Bold.woff2`, `AdobeClean-ExtraBold.woff2`, `AdobeCleanDisplay-Bold.woff2`, `AdobeCleanDisplay-Black.woff2`

- [ ] **Step 1: Install the converter**

Run:
```bash
python3 -m pip install --quiet --user fonttools brotli
```

- [ ] **Step 2: Convert each OTF → woff2**

Run (from the repo root):
```bash
mkdir -p tools/status/fonts
SRC="/Users/kpauls/Downloads/handoff-v3/fonts"
for f in AdobeClean-Regular AdobeClean-Medium AdobeClean-Bold AdobeClean-ExtraBold AdobeCleanDisplay-Bold AdobeCleanDisplay-Black; do
  python3 -m fontTools.ttLib.woff2 compress -o "tools/status/fonts/$f.woff2" "$SRC/$f.otf"
done
ls -l tools/status/fonts/
```
Expected: six `.woff2` files, each materially smaller than its `.otf` source (~1.1MB total OTF → ~300KB total woff2).

- [ ] **Step 3: Commit**

```bash
git add tools/status/fonts
git commit -m "feat: add Adobe Clean woff2 fonts for the status experience"
```
End the commit body with:
`Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`

---

## Task 2: `tools/status/status.css`

**Files:**
- Create: `tools/status/status.css`

- [ ] **Step 1: Copy the handoff stylesheet**

```bash
cp /Users/kpauls/Downloads/handoff-v3/styles.css tools/status/status.css
```

- [ ] **Step 2: Repoint `@font-face` to woff2**

The six `@font-face` rules near the top use `src: url("fonts/<name>.otf") format("opentype");`. Replace every `.otf") format("opentype")` with `.woff2") format("woff2")`:
```bash
sed -i '' 's/\.otf") format("opentype")/.woff2") format("woff2")/g' tools/status/status.css
grep -nE 'src: url\("fonts/' tools/status/status.css
```
Expected: all six `src:` lines now reference `fonts/<name>.woff2` with `format("woff2")`, e.g. `src: url("fonts/AdobeClean-Regular.woff2") format("woff2");`.

- [ ] **Step 3: Commit**

```bash
git add tools/status/status.css
git commit -m "feat: status experience stylesheet (woff2 fonts)"
```
End with the `Co-Authored-By` trailer.

---

## Task 3: `tools/status/status.js` (strip demo controls, real pacing)

**Files:**
- Create: `tools/status/status.js`

- [ ] **Step 1: Copy the handoff script**

```bash
cp /Users/kpauls/Downloads/handoff-v3/script.js tools/status/status.js
```

- [ ] **Step 2: Fix real pacing**

In `tools/status/status.js`, the `clock` object starts with `speed: 1`. Change that one property so the page always runs the real ~10-minute pacing:
```js
// before
const clock = {
  t: 0, running: true, speed: 1, last: null,
// after
const clock = {
  t: 0, running: true, speed: COMPRESSED_END / REAL_SECONDS, last: null,
```
(`COMPRESSED_END` and `REAL_SECONDS` are already defined above `clock`.)

- [ ] **Step 3: Remove the replay-button handler**

Delete this line:
```js
$('#replay-btn').addEventListener('click', () => seek(0));
```

- [ ] **Step 4: Remove the toast helper**

Delete the whole toast block:
```js
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 3400);
}
```

- [ ] **Step 5: Remove the presenter keyboard handler**

Delete the whole `keydown` listener (it handles space/arrows/1–5/R/T/H/?/Esc and is the only caller of `toast`, `#help`, `#pacing-badge`):
```js
document.addEventListener('keydown', (e) => {
  if (e.key === ' ') {
    ...
  } else if (e.key === 'Escape') {
    $('#help').hidden = true;
  }
});
```
(Delete from `document.addEventListener('keydown'` through its closing `});`.)

- [ ] **Step 6: Remove the deep-link block (keep the loop start)**

Delete the `?t=`/`?paused` deep-link lines but KEEP the final `requestAnimationFrame(loop);`:
```js
// delete these three lines:
const params = new URLSearchParams(location.search);
if (params.has('t')) seek(Math.min(parseFloat(params.get('t')) || 0, COMPRESSED_END));
if (params.has('paused')) clock.running = false;

// keep this line:
requestAnimationFrame(loop);
```

- [ ] **Step 7: Verify nothing dangling + syntax check**

Run:
```bash
grep -nE "toast\(|#replay-btn|#pacing-badge|#help|params\.|keydown" tools/status/status.js
node --check tools/status/status.js && echo "syntax OK"
```
Expected: the grep prints **nothing** (all presenter references removed), and `syntax OK`. (The kept handlers `#snav-dots`, `#snav-prev`, `#snav-next`, `#chapters`, `#sidekick-cta`, `#close-status-text` and the `setInterval` close-status cycling remain.)

- [ ] **Step 8: Commit**

```bash
git add tools/status/status.js
git commit -m "feat: status experience timeline (demo controls stripped, real pacing)"
```
End with the `Co-Authored-By` trailer.

---

## Task 4: `tools/status/status.html` (remove presenter elements, repoint refs)

**Files:**
- Create: `tools/status/status.html`

- [ ] **Step 1: Copy the handoff markup**

```bash
cp /Users/kpauls/Downloads/handoff-v3/index.html tools/status/status.html
```

- [ ] **Step 2: Repoint the stylesheet and script refs**

```bash
sed -i '' 's#href="styles.css"#href="status.css"#; s#src="script.js"#src="status.js"#' tools/status/status.html
grep -nE 'href="status.css"|src="status.js"' tools/status/status.html
```
Expected: `<link rel="stylesheet" href="status.css">` and `<script src="status.js"></script>`.

- [ ] **Step 3: Remove the presenter-only elements**

Read `tools/status/status.html` and delete these four elements (find by id/class):
1. The replay paragraph:
   ```html
   <p class="close-replay"><button type="button" id="replay-btn">Watch the tour again</button></p>
   ```
2. The toast:
   ```html
   <div class="toast" id="toast" role="status"></div>
   ```
3. The help panel — the entire element `<div class="help" id="help" hidden> … </div>` (it contains a `.help-card` with the keyboard-shortcut `<dl>`; delete from the opening `<div class="help" id="help" hidden>` through its matching closing `</div>`).
4. The pacing badge:
   ```html
   <div class="pacing-badge" id="pacing-badge" hidden>Real-time pacing</div>
   ```
KEEP everything else, including the HUD, all five `.act` sections, `#sidekick-cta`, and the story nav (`#snav-prev`, `#snav-dots`, `#snav-next`, `#chapters`).

- [ ] **Step 4: Verify removals**

Run:
```bash
grep -cE 'id="replay-btn"|id="toast"|id="help"|id="pacing-badge"' tools/status/status.html
grep -cE 'id="snav-dots"|id="chapters"|id="sidekick-cta"' tools/status/status.html
```
Expected: first grep prints `0` (presenter elements gone); second prints `3` (story nav + CTA kept).

- [ ] **Step 5: Commit**

```bash
git add tools/status/status.html
git commit -m "feat: status experience page (presenter elements removed)"
```
End with the `Co-Authored-By` trailer.

---

## Task 5: Embed the experience in `scripts/waiting.js`

**Files:**
- Modify: `scripts/waiting.js` (replace the overlay build with an iframe embed; drop the timeout cap)

- [ ] **Step 1: Replace the file contents**

Overwrite `scripts/waiting.js` with exactly:
```js
/*
 * Migration status waiting page.
 *
 * On a `/status/<id>` URL (served as a 404 because there is no such content),
 * embed the handoff "Preparing your page…" experience full-screen in an iframe
 * (tools/status/status.html) and poll the migration worker. On a terminal job
 * (HTTP 201) redirect the top window to the DA canvas. Any other status keeps
 * polling. Polls with no Authorization header (the worker's no-token path
 * returns status only).
 */

const STATUS_SEGMENT = 'status';
const WORKER_URL = 'https://vibemig-migration-backend-worker.franklin-prod.workers.dev/jobs/snowflake/';
const CANVAS_URL = 'https://da.live/canvas#/aemcoder/sendto/';
const EXPERIENCE_URL = '/tools/status/status.html';
const POLL_INTERVAL_MS = 30000;
const ID_RE = /^[A-Za-z0-9_-]+$/;

/**
 * Extracts the job id from a `/status/<id>` pathname.
 * @param {string} pathname location pathname
 * @returns {string|null} the id, or null when this is not a status path
 */
function statusId(pathname) {
  const parts = pathname.split('/');
  const segment = parts[1];
  const value = parts[2];
  if (segment !== STATUS_SEGMENT || !value || !ID_RE.test(value)) return null;
  return value;
}

/**
 * Hides the default 404 chrome and styles the full-viewport iframe.
 */
function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    html.status-waiting body { display: block; margin: 0; }
    html.status-waiting body > header,
    html.status-waiting body > footer,
    html.status-waiting body > main { display: none; }
    .status-frame {
      position: fixed; inset: 0; width: 100%; height: 100%;
      border: 0; z-index: 9999; background: #fff;
    }
  `;
  document.head.append(style);
}

/**
 * Embeds the handoff experience as a full-screen iframe.
 */
function renderExperience() {
  const frame = document.createElement('iframe');
  frame.className = 'status-frame';
  frame.src = EXPERIENCE_URL;
  frame.title = 'Preparing your page';
  document.body.append(frame);
}

/**
 * Polls the migration worker until the job is terminal, then redirects the top
 * window to the DA canvas.
 * @param {string} jobId the migration job id
 */
function pollUntilReady(jobId) {
  const target = `${CANVAS_URL}${jobId}/index`;
  async function poll() {
    try {
      const res = await fetch(`${WORKER_URL}${encodeURIComponent(jobId)}`, { cache: 'no-store' });
      if (res.status === 201) {
        window.location.replace(target);
        return;
      }
    } catch (e) {
      // network blip — keep polling
    }
    window.setTimeout(poll, POLL_INTERVAL_MS);
  }
  poll();
}

const id = statusId(window.location.pathname);
if (id) {
  document.documentElement.classList.add('status-waiting');
  document.title = 'Preparing your page…';
  injectStyles();
  renderExperience();
  pollUntilReady(id);
}
```

- [ ] **Step 2: Syntax check**

Run:
```bash
node --check scripts/waiting.js && echo "syntax OK"
```
Expected: `syntax OK`.

- [ ] **Step 3: Commit**

```bash
git add scripts/waiting.js
git commit -m "feat: embed the handoff status experience and poll until terminal"
```
End with the `Co-Authored-By` trailer.

---

## Task 6: Push and verify on the preview

- [ ] **Step 1: Push**

```bash
git push -u origin status-handoff
```

- [ ] **Step 2: Verify the experience is served**

After Code Sync builds the branch, run:
```bash
BASE="https://status-handoff--sendto--aemcoder.aem.page"
curl -sI "$BASE/tools/status/status.html" | grep -iE "^HTTP|content-type"
curl -sI "$BASE/tools/status/status.css"  | grep -iE "^HTTP|content-type"
curl -sI "$BASE/tools/status/status.js"   | grep -iE "^HTTP|content-type"
curl -sI "$BASE/tools/status/fonts/AdobeClean-Regular.woff2" | grep -iE "^HTTP|content-type"
```
Expected: each returns `200`.

- [ ] **Step 3: Verify the parent embeds the iframe (headless)**

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PROFILE=$(mktemp -d)
timeout 30 "$CHROME" --headless=new --disable-gpu --no-sandbox --no-first-run --user-data-dir="$PROFILE" --disk-cache-dir=/dev/null --virtual-time-budget=5000 --dump-dom "https://status-handoff--sendto--aemcoder.aem.page/status/probe-1" > /tmp/sh.html 2>/dev/null
grep -oE 'class="status-frame"|src="/tools/status/status.html"' /tmp/sh.html
```
Expected: the `status-frame` iframe with `src="/tools/status/status.html"` is present in the rendered parent DOM.

- [ ] **Step 4: Manual browser confirmation (record for the PR)**

Open `https://status-handoff--sendto--aemcoder.aem.page/status/<id>` in a browser and confirm: the handoff narrative renders (Adobe Clean fonts, the 5 acts, story nav), the Network tab polls `vibemig-…/jobs/snowflake/<id>` every 30s, and (with a real terminal job id) a `201` redirects the top window to `https://da.live/canvas#/aemcoder/sendto/<id>/index`. An unknown id stays on the experience (expected).

---

## Self-Review (completed by plan author)

- **Spec coverage:** woff2 fonts (Task 1), status.css + woff2 refs (Task 2), status.js demo-strip + real pacing (Task 3), status.html presenter-strip + ref repoint (Task 4), iframe embed + poll-until-201 + drop-cap (Task 5), exclusion of shots/assets (never copied), verification incl. served-static + iframe presence (Task 6). ✓
- **Placeholder scan:** none — every step has concrete commands/code. ✓
- **Type/name consistency:** `status.html`/`status.css`/`status.js`, `tools/status/fonts/`, `WORKER_URL`/`CANVAS_URL`/`EXPERIENCE_URL`/`statusId`/`injectStyles`/`renderExperience`/`pollUntilReady`, and the `status-waiting`/`status-frame` classes are used identically across tasks. ✓
- **Strip completeness:** the kept handlers (`#snav-*`, `#chapters`, `#sidekick-cta`, `#close-status-text`) only reference elements retained in Task 4; all removed JS (`toast`, keydown, deep-link, replay) references only elements removed in Task 4. ✓
