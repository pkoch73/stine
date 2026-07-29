/**
 * Gallery block — category heading + 4-column image grid.
 *
 * Authoring rows (positional):
 *   1. <h2> category title (e.g. "Knitting")
 *   2..N: one image per row (<picture>/<img>), or empty cells for placeholders
 *
 * The block also supports DA-flattened single-cell shapes:
 * all content collapsed into one cell with flat siblings.
 *
 * Image cells left empty render as placeholder rectangles via CSS.
 */
export default async function decorate(block) {
  /* ---- collect nodes from any cell shape ---- */
  const nodes = [];
  block.querySelectorAll(':scope > div > div').forEach((cell) => {
    const kids = [...cell.children];
    if (kids.length) {
      nodes.push(...kids);
    } else if (cell.textContent.trim()) {
      const p = document.createElement('p');
      p.textContent = cell.textContent.trim();
      nodes.push(p);
    }
  });

  /* ---- also check if section default content has the heading ---- */
  const sectionWrap = block.closest('.block-content')?.previousElementSibling
    || block.closest('.gallery-container')?.querySelector('.default-content-wrapper, .default-content');
  let sectionHead = null;
  if (sectionWrap && (sectionWrap.classList.contains('default-content-wrapper')
    || sectionWrap.classList.contains('default-content'))) {
    sectionHead = sectionWrap.querySelector('h2, h3');
  }

  /* ---- identify the heading ---- */
  const heading = sectionHead
    || nodes.find((n) => n.matches?.('h1, h2, h3'));

  /* ---- collect images ---- */
  const images = nodes.filter((n) => {
    if (n.matches?.('picture, img')) return true;
    if (n.querySelector?.('picture, img')) return true;
    return false;
  });

  /* ---- count the authored rows that are image-like (including empty rows) ---- */
  const rows = [...block.querySelectorAll(':scope > div')];
  const imageRowCount = rows.filter((r) => {
    const cell = r.querySelector(':scope > div');
    if (!cell) return false;
    // row has an image, or row is empty (placeholder)
    if (cell.querySelector('picture, img')) return true;
    if (!cell.textContent.trim() && !cell.querySelector('h1, h2, h3, h4')) return true;
    return false;
  }).length;

  const totalSlots = Math.max(images.length, imageRowCount, 4);

  /* ---- build decorated DOM ---- */
  const wrap = document.createElement('div');
  wrap.className = 'gallery-wrap';

  if (heading) {
    const h = document.createElement('h2');
    const inner = heading.querySelector('h1, h2, h3, h4, h5, h6') || heading;
    [...inner.childNodes].forEach((n) => h.append(n.cloneNode(true)));
    wrap.append(h);
  }

  /* remove the default-content wrapper if we reabsorbed it */
  if (sectionHead && sectionWrap) {
    sectionWrap.remove();
  }

  const grid = document.createElement('div');
  grid.className = 'gallery-grid';

  for (let i = 0; i < totalSlots; i += 1) {
    const item = document.createElement('div');
    item.className = 'gallery-item';
    const img = images[i];
    if (img) {
      const media = img.matches?.('picture, img') ? img : img.querySelector('picture, img');
      if (media) item.append(media.cloneNode(true));
    }
    // empty items render as placeholder boxes via CSS
    grid.append(item);
  }

  wrap.append(grid);
  block.replaceChildren(wrap);
}
