/*
 * Branch-matching redirect for the main router host.
 *
 * On the default-branch preview/live host, redirect to the branch host named by
 * the first path segment, e.g.
 *   https://main--sendto--aemcoder.aem.page/1234/
 *     -> https://1234--sendto--aemcoder.aem.page/1234/
 * Applies to aem.page, aem.live, and preview.da.live hosts.
 *
 * Pure module: no DOM or global access, so it can be unit-tested under Node.
 */

const DEFAULT_BRANCH = 'main';
const RESERVED_SEGMENTS = ['status'];

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
  // only AEM/DA preview/live hosts (excludes localhost and custom domains)
  if (!/\.(?:aem\.(?:page|live)|preview\.da\.live)$/.test(hostname)) return null;

  // must be a branch host: split at the first '--'
  const separator = hostname.indexOf('--');
  if (separator < 0) return null;
  const ref = hostname.slice(0, separator);
  const rest = hostname.slice(separator); // '--repo--owner.<aem.page|aem.live|preview.da.live>'

  // only redirect away from the default (router) branch
  if (ref !== DEFAULT_BRANCH) return null;

  // first path segment, if any
  const segment = pathname.split('/')[1] || '';
  if (!segment || segment === DEFAULT_BRANCH) return null;

  // reserved segments are handled by dedicated pages (e.g. /status/<id> by the
  // migration waiting page), not redirected to a branch host
  if (RESERVED_SEGMENTS.includes(segment)) return null;

  // only build DNS-valid branch hosts (drops e.g. '/Hello%20World/')
  if (!/^[A-Za-z0-9-]+$/.test(segment)) return null;

  // branch host matching the path segment, preserving path/query/hash
  return `${protocol}//${segment}${rest}${pathname}${search}${hash}`;
}
