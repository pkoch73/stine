import { createOptimizedPicture } from '../../scripts/aem.js';

/**
 * loads and decorates the gallery
 *
 * One row per image, with an optional second cell holding a caption.
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const ul = document.createElement('ul');
  ul.className = 'gallery-list';

  [...block.children].forEach((row) => {
    const picture = row.querySelector('picture');
    if (!picture) return;

    const li = document.createElement('li');
    const figure = document.createElement('figure');
    const img = picture.querySelector('img');
    figure.append(createOptimizedPicture(img.src, img.alt, false, [
      { media: '(min-width: 900px)', width: '600' },
      { width: '750' },
    ]));

    const caption = [...row.children].find((cell) => !cell.querySelector('picture'))?.textContent.trim();
    if (caption) {
      const figcaption = document.createElement('figcaption');
      figcaption.textContent = caption;
      figure.append(figcaption);
    }

    li.append(figure);
    ul.append(li);
  });

  block.replaceChildren(ul);
}
