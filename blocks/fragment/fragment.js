/*
 * Fragment Block
 * Include content on a page as a fragment.
 * https://www.aem.live/developer/block-collection/fragment
 */

// eslint-disable-next-line import/no-cycle
import {
  decorateMain,
} from '../../scripts/scripts.js';

import {
  loadSections,
} from '../../scripts/aem.js';

/**
 * Loads a fragment.
 * @param {string} path The path to the fragment
 * @returns {HTMLElement} The root element of the fragment
 */
export async function loadFragment(path) {
  let fetchUrl = null;
  if (path && path.startsWith('/') && !path.startsWith('//')) {
    fetchUrl = path;
  } else if (path) {
    const ALLOWED_HOSTS = [
      'adobe--sendto--aemcoder.aem.page',
      'main--sendto--aemcoder.aem.page',
    ];
    try {
      const { hostname } = new URL(path);
      if (hostname === window.location.hostname
        || ALLOWED_HOSTS.includes(hostname)) fetchUrl = path;
    } catch { /* invalid URL */ }
  }
  if (fetchUrl) {
    const resp = await fetch(`${fetchUrl}.plain.html`);
    if (resp.ok) {
      const main = document.createElement('main');
      main.innerHTML = await resp.text();

      // reset base path for media to fragment base
      const resetAttributeBase = (tag, attr) => {
        main.querySelectorAll(`${tag}[${attr}^="./media_"]`).forEach((elem) => {
          elem[attr] = new URL(elem.getAttribute(attr), new URL(path, window.location)).href;
        });
      };
      resetAttributeBase('img', 'src');
      resetAttributeBase('source', 'srcset');

      decorateMain(main);
      await loadSections(main);
      return main;
    }
  }
  return null;
}

export default async function decorate(block) {
  const link = block.querySelector('a');
  const path = link ? link.getAttribute('href') : block.textContent.trim();
  const fragment = await loadFragment(path);
  if (fragment) block.replaceChildren(...fragment.childNodes);
}
