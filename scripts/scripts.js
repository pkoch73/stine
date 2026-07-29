import {
  buildBlock,
  loadHeader,
  loadFooter,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  isWelcome,
} from './aem.js';
import { getBranchRedirectUrl } from './branch-redirect.js';

/**
 * Builds hero block and prepends to main in a new section.
 * @param {Element} main The container element
 */
function buildHeroBlock(main) {
  const h1 = main.querySelector('h1');
  const picture = main.querySelector('picture');
  // eslint-disable-next-line no-bitwise
  if (h1 && picture && (h1.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_PRECEDING)) {
    // Check if h1 or picture is already inside a hero block
    if (h1.closest('.hero') || picture.closest('.hero')) {
      return; // Don't create a duplicate hero block
    }
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1] }));
    main.prepend(section);
  }
}

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS('/styles/fonts.css');
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    // auto load `*/fragments/*` references
    const fragments = [...main.querySelectorAll('a[href*="/fragments/"]')].filter((f) => !f.closest('.fragment'));
    if (fragments.length > 0) {
      // eslint-disable-next-line import/no-cycle
      import('../blocks/fragment/fragment.js').then(({ loadFragment }) => {
        fragments.forEach(async (fragment) => {
          try {
            const { pathname } = new URL(fragment.href);
            const frag = await loadFragment(pathname);
            fragment.parentElement.replaceWith(...frag.children);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error('Fragment loading failed', error);
          }
        });
      });
    }

    buildHeroBlock(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates formatted links to style them as buttons.
 * @param {HTMLElement} main The main container element
 */
function decorateButtons(main) {
  main.querySelectorAll('p a[href]').forEach((a) => {
    a.title = a.title || a.textContent;
    const p = a.closest('p');
    const text = a.textContent.trim();

    if (a.querySelector('img')) return;

    // skip URL display links
    try {
      if (new URL(a.href).href === new URL(text, window.location).href) return;
    } catch { /* continue */ }

    // outer pattern: <strong><a> or <em><a>
    const strong = a.closest('strong');
    const em = a.closest('em');

    if (strong || em) {
      // p must contain only this link's text
      if (p.textContent.trim() !== text) return;
    } else {
      // inner pattern: <a><strong> or <a><em> — p must contain only links, no surrounding prose
      if (!a.querySelector('strong, em')) return;
      const linksText = [...p.querySelectorAll('a[href]')].map((l) => l.textContent.trim()).join('');
      if (p.textContent.trim() !== linksText) return;
    }

    const innerStrong = !strong && a.querySelector('strong');
    const innerEm = !em && a.querySelector('em');

    p.className = 'button-wrapper';
    a.className = 'button';
    if ((strong || innerStrong) && (em || innerEm)) {
      a.classList.add('accent');
      if (strong || em) {
        const outer = strong?.contains(em) ? strong : em;
        outer.replaceWith(a);
      }
    } else if (strong || innerStrong) {
      a.classList.add('primary');
      if (strong) strong.replaceWith(a);
    } else {
      a.classList.add('secondary');
      if (em) em.replaceWith(a);
    }
  });
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
  decorateButtons(main);
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), (section) => {
      if (document.body.classList.contains('quick-edit')) return Promise.resolve();
      return waitForFirstImage(section);
    });
  }

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  loadHeader(doc.querySelector('header'));

  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadFooter(doc.querySelector('footer'));

  loadCSS('/styles/lazy-styles.css');
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

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

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

/**
 * Pages that bring their own full layout (built from their own blocks) and must
 * never take the static-to-EDS template overlay applied downstream (the snowflake
 * migration adds an overlay engine on top of this boilerplate). e.g. the
 * self-contained `welcome` demo page.
 */
const SELF_CONTAINED_PAGES = new Set(['welcome']);

/**
 * Marks the current page so the downstream template-overlay engine skips it.
 * Setting the template to `none` makes the engine's template-name discovery skip
 * the page — today via a graceful template-not-found, and cleanly with no change
 * here once the engine treats `none` as an explicit opt-out. Path-based so it
 * covers a 404 too; called from loadPage so it re-applies on every (re)decoration
 * (e.g. after an editor replaces the body). A real 404 already gets no overlay via
 * `main.error`, so we skip there to avoid a needless failed fetch.
 */
function markSelfContainedPage() {
  const page = window.location.pathname.split('/').filter(Boolean).pop();
  if (!SELF_CONTAINED_PAGES.has(page)) return;
  if (document.querySelector('main')?.classList.contains('error')) return;
  document.body.dataset.template = 'none';
}

export async function loadPage() {
  if (redirectToMatchingBranch()) return;
  if (isWelcome()) loadCSS('/styles/styles.css');
  markSelfContainedPage();
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();

(() => {
  const hasQE = new URL(window.location.href).searchParams.has('quick-edit');
  // eslint-disable-next-line import/no-cycle
  if (hasQE) import('../tools/quick-edit/quick-edit.js').then((mod) => mod.default());
})();
