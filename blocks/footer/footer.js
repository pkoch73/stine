import { getMetadata } from '../../scripts/aem.js';
import { loadFragment } from '../fragment/fragment.js';

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  // load footer as fragment
  const footerMeta = getMetadata('footer');
  const footerPath = footerMeta ? new URL(footerMeta, window.location).pathname : '/footer';
  const fragment = await loadFragment(footerPath);

  // decorate footer DOM
  block.textContent = '';
  const footer = document.createElement('div');
  while (fragment.firstElementChild) footer.append(fragment.firstElementChild);

  // keep the copyright line authored: replace a `{year}` token with the current year
  const walker = document.createTreeWalker(footer, NodeFilter.SHOW_TEXT);
  const year = `${new Date().getFullYear()}`;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeValue.includes('{year}')) {
      node.nodeValue = node.nodeValue.replaceAll('{year}', year);
    }
  }

  block.append(footer);
}
