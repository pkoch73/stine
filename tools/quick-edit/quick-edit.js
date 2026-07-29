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
