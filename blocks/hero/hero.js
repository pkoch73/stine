/**
 * Hero block — eyebrow + headline + description.
 *
 * Authoring (single cell, flat siblings):
 *   <p>     eyebrow text (short, uppercase label)
 *   <h1>    page headline
 *   <p>     description paragraph
 *
 * The block queries by tag rather than positional index so it
 * tolerates both multi-row and DA-flattened single-cell shapes.
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

  /* ---- identify parts ---- */
  const h1 = nodes.find((n) => n.matches?.('h1'));
  const paras = nodes.filter((n) => n.matches?.('p') && !n.querySelector('a'));
  // eyebrow = short <p> before the heading; description = <p> after it
  const h1Index = nodes.indexOf(h1);
  const eyebrow = paras.find((p) => nodes.indexOf(p) < h1Index);
  const description = paras.find((p) => nodes.indexOf(p) > h1Index);

  /* ---- build decorated DOM ---- */
  const wrap = document.createElement('div');
  wrap.className = 'hero-wrap';

  if (eyebrow) {
    eyebrow.className = 'hero-eyebrow';
    wrap.append(eyebrow);
  }

  if (h1) {
    wrap.append(h1);
  }

  if (description) {
    description.className = 'hero-description';
    wrap.append(description);
  }

  block.replaceChildren(wrap);
}
