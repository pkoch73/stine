/*
 * Pure helpers for the migration status redirect target.
 *
 * The worker's un-authenticated status body returns a DA canvas URL pointing at the
 * page's index doc (…/<id>/index). We navigate there verbatim when the page is
 * ready, and to its welcome variant (…/<id>/welcome) when the user opts into the
 * demo. Pure module: no DOM or global access, so it can be unit-tested under Node.
 */

const DA_CANVAS_PREFIX = 'https://da.live/canvas#/';

/**
 * True when `url` is a DA canvas editor URL we are willing to redirect to: the
 * da.live/canvas host AND an owner/site/<id>/<doc> path (>= 4 segments after the
 * `#/`). The segment-count check means welcomeUrl() always swaps a real doc
 * segment and can't degrade a malformed input (e.g. the bare prefix) into a
 * non-canvas same-host URL.
 * @param {unknown} url candidate URL
 * @returns {boolean}
 */
export function isDaCanvasUrl(url) {
  if (typeof url !== 'string' || !url.startsWith(DA_CANVAS_PREFIX)) return false;
  const rest = url.slice(DA_CANVAS_PREFIX.length).replace(/\/+$/, '');
  return rest.split('/').filter(Boolean).length >= 4;
}

/**
 * Returns the welcome-doc variant of a DA canvas URL by replacing its last path
 * segment (e.g. `…/<id>/index` → `…/<id>/welcome`). Tolerates a trailing slash.
 * @param {string} daUrl a `…/<id>/index` DA canvas URL
 * @returns {string} the `…/<id>/welcome` URL
 */
export function welcomeUrl(daUrl) {
  const u = daUrl.replace(/\/+$/, '');
  return `${u.slice(0, u.lastIndexOf('/') + 1)}welcome`;
}
