import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * loads and decorates the hero
 *
 * Authored as a single row of one or two cells. The cell holding a picture becomes the
 * media side — in either order, so an image-left layout needs no variant. A single cell
 * renders as a text-only page header.
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const row = block.firstElementChild;
  if (!row) return;

  const cells = [...row.children]
    .filter((cell) => cell.textContent.trim() || cell.querySelector('picture'));

  cells.forEach((cell) => {
    const pictures = [...cell.querySelectorAll('picture')];
    const isMedia = pictures.length > 0 && !cell.querySelector('h1, h2, h3');
    cell.className = isMedia ? 'hero-media' : 'hero-content';
    if (!isMedia) return;

    // several pictures in the media cell render as a strip rather than one cover image
    cell.dataset.images = pictures.length;
    const width = pictures.length > 1 ? '400' : '900';
    pictures.forEach((picture, i) => {
      const img = picture.querySelector('img');
      if (!img) return;
      // the first hero image is the LCP candidate on most pages
      picture.replaceWith(createOptimizedPicture(img.src, img.alt, i === 0, [
        { media: '(min-width: 900px)', width },
        { width: '750' },
      ]));
    });
  });

  if (block.classList.contains('article')) {
    const content = block.querySelector('.hero-content');
    const back = content?.firstElementChild;
    if (back?.tagName === 'P' && back.children.length === 1 && back.firstElementChild.tagName === 'A') {
      back.classList.add('hero-back');
    }
    const heading = content?.querySelector('h1, h2');
    if (heading?.nextElementSibling?.tagName === 'P') {
      heading.nextElementSibling.classList.add('hero-meta');
    }
  }

  block.replaceChildren(...cells);
}
