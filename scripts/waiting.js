/*
 * Migration status waiting page.
 *
 * On a `/status/<id>` URL (served as a 404 because there is no such content),
 * embed the handoff "Preparing your page…" experience full-screen in an iframe
 * (tools/status/status.html) and immediately start polling the migration worker.
 * Polling continues indefinitely — there is no timeout. The worker's un-authenticated
 * status body carries the DA canvas URL for this job's (per-user) repo, which we
 * cache. As soon as the page is ready (worker HTTP 201) the top window is redirected
 * to that daUrl (the `…/<id>/index` editor), even while the animation is still
 * playing. If the user clicks the in-iframe "Try AEM on a demo page" CTA, the iframe
 * posts 'status:try-it-out' and the top window goes to the welcome variant of the
 * daUrl (`…/<id>/welcome`) instead. Whichever fires first wins; otherwise the page
 * keeps waiting. Without a daUrl we never redirect (the router host is the wrong,
 * per-user repo). Polls with no Authorization header (the worker's no-token path
 * returns the daUrl only).
 */

import { isDaCanvasUrl, welcomeUrl } from './status-target.js';

const STATUS_SEGMENT = 'status';
const WORKER_URL = 'https://vibemig-migration-backend-worker.franklin-prod.workers.dev/jobs/snowflake/';
const EXPERIENCE_URL = '/tools/status/status.html';
const TRY_IT_OUT = 'status:try-it-out';
const POLL_INTERVAL_MS = 10000;
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
 * @returns {HTMLIFrameElement} the created iframe
 */
function renderExperience() {
  const frame = document.createElement('iframe');
  frame.className = 'status-frame';
  frame.src = EXPERIENCE_URL;
  frame.title = 'Preparing your page';
  document.body.append(frame);
  return frame;
}

const id = statusId(window.location.pathname);
if (id) {
  document.documentElement.classList.add('status-waiting');
  document.title = 'Preparing your page…';
  injectStyles();
  const frame = renderExperience();

  // The worker's status body hands us the DA canvas URL for this job's per-user
  // repo. Cache it (validated), then redirect there — index when ready, welcome on
  // the CTA. A ready page (201) and a "try it out" click can't both navigate; first
  // to fire wins.
  let daUrl = null;
  let redirected = false;
  const navigate = (url) => {
    if (redirected) return;
    redirected = true;
    window.location.replace(url);
  };

  // Poll the worker indefinitely (no timeout). On 201 the job is terminal →
  // redirect to the ready editor page. Idempotent guard so we never spawn two
  // loops. Each fetch is aborted after POLL_INTERVAL_MS so a hung worker can't
  // wedge the loop.
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
        try {
          const body = await res.json();
          if (body && isDaCanvasUrl(body.daUrl)) daUrl = body.daUrl;
        } catch (e) {
          // empty / non-JSON body (e.g. 404 unknown job) — nothing to cache
        }
        if (res.status === 201 && daUrl) { navigate(daUrl); return; }
      } catch (e) {
        // network blip / aborted slow fetch — keep polling
      } finally {
        window.clearTimeout(abortTimer);
      }
      if (!redirected) window.setTimeout(poll, POLL_INTERVAL_MS);
    }
    poll();
  };

  // The CTA is the user's escape hatch to the demo (welcome) page. Validate
  // source, origin, and type; only navigate once we have a daUrl to derive it from.
  window.addEventListener('message', (e) => {
    if (e.source !== frame.contentWindow || e.origin !== window.location.origin || !e.data) return;
    if (e.data.type === TRY_IT_OUT && daUrl) navigate(welcomeUrl(daUrl));
  });

  // Start polling right away — if the page is already ready, redirect at once
  // (independent of the animation, which only provides the visuals and the CTA).
  startPolling();
}
