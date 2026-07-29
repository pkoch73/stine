/**
 * loads and decorates the FAQ accordion
 * @param {Element} block The accordion block element
 */
export default function decorate(block) {
  const rows = [...block.children];
  rows.forEach((row, i) => {
    const [qCell, aCell] = [...row.children];
    const details = document.createElement('details');
    details.className = 'accordion-item';
    if (i === 1) details.open = true; // open the second item by default

    const summary = document.createElement('summary');
    summary.className = 'accordion-q';
    const label = document.createElement('span');
    label.textContent = (qCell ? qCell.textContent : '').trim();
    const chevron = document.createElement('span');
    chevron.className = 'accordion-chevron';
    chevron.innerHTML = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M5 7.5l5 5 5-5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    summary.append(label, chevron);

    const panel = document.createElement('div');
    panel.className = 'accordion-a';
    const inner = document.createElement('div');
    inner.className = 'accordion-a-inner';
    if (aCell) inner.innerHTML = aCell.innerHTML;
    panel.append(inner);

    details.append(summary, panel);
    row.replaceWith(details);
  });
}
