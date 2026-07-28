import { toClassName } from '../../scripts/aem.js';

/**
 * Reads one authored row into a post record.
 * Cells are positional — category | title (linked) | dek | date | read time — and every
 * cell after the title is optional.
 * @param {Element} row The row element
 * @returns {Object} the post fields
 */
function readPost(row) {
  const [category, title, dek, date, readTime] = [...row.children].map((cell) => cell);
  return {
    category: category?.textContent.trim() ?? '',
    link: title?.querySelector('a'),
    title: title?.textContent.trim() ?? '',
    dek: dek?.textContent.trim() ?? '',
    date: date?.textContent.trim() ?? '',
    readTime: readTime?.textContent.trim() ?? '',
  };
}

/**
 * Builds the list item for one post.
 * The title carries the only link; a stretched pseudo-element in CSS makes the whole
 * teaser clickable without swallowing the dek into the link's accessible name.
 * @param {Object} post The post fields
 * @param {string} headingLevel The heading tag to use for the title
 * @returns {Element} the list item
 */
function buildPost(post, headingLevel) {
  const li = document.createElement('li');
  li.className = 'posts-item';
  if (post.category) li.dataset.category = toClassName(post.category);

  if (post.category) {
    const category = document.createElement('p');
    category.className = 'posts-category';
    category.textContent = post.category;
    li.append(category);
  }

  const body = document.createElement('div');
  body.className = 'posts-body';

  const heading = document.createElement(headingLevel);
  heading.className = 'posts-title';
  if (post.link) {
    const a = document.createElement('a');
    a.href = post.link.href;
    a.textContent = post.title;
    heading.append(a);
  } else {
    heading.textContent = post.title;
  }
  body.append(heading);

  if (post.dek) {
    const dek = document.createElement('p');
    dek.className = 'posts-dek';
    dek.textContent = post.dek;
    body.append(dek);
  }
  li.append(body);

  const meta = [post.date, post.readTime].filter((part) => part);
  if (meta.length) {
    const p = document.createElement('p');
    p.className = 'posts-meta';
    p.textContent = meta.join(' · ');
    li.append(p);
  }

  return li;
}

/**
 * Builds the category filter, derived from the categories actually present.
 * @param {Element[]} items The rendered list items
 * @returns {Element} the filter group
 */
function buildFilter(items) {
  const categories = [];
  items.forEach((item) => {
    const key = item.dataset.category;
    if (key && !categories.some(([existing]) => existing === key)) {
      categories.push([key, item.querySelector('.posts-category').textContent]);
    }
  });

  const group = document.createElement('div');
  group.className = 'posts-filter';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Filter by category');

  const status = document.createElement('p');
  status.className = 'posts-filter-status';
  status.setAttribute('role', 'status');

  const apply = (key, label) => {
    let shown = 0;
    items.forEach((item) => {
      const match = !key || item.dataset.category === key;
      item.hidden = !match;
      if (match) shown += 1;
    });
    group.querySelectorAll('button').forEach((chip) => {
      chip.setAttribute('aria-pressed', String(chip.dataset.category === key));
    });
    status.textContent = `${shown} ${shown === 1 ? 'note' : 'notes'}${key ? ` in ${label}` : ''}`;
  };

  [['', 'All'], ...categories].forEach(([key, label]) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'posts-chip';
    chip.dataset.category = key;
    chip.setAttribute('aria-pressed', String(!key));
    chip.textContent = label;
    chip.addEventListener('click', () => apply(key, label));
    group.append(chip);
  });

  apply('', 'All');
  group.append(status);
  return group;
}

/**
 * loads and decorates the posts list
 * @param {Element} block The block element
 */
export default function decorate(block) {
  const isList = block.classList.contains('list');
  const headingLevel = isList ? 'h2' : 'h3';

  const ul = document.createElement('ul');
  ul.className = 'posts-list';
  const items = [...block.children]
    .map((row) => readPost(row))
    .filter((post) => post.title)
    .map((post) => buildPost(post, headingLevel));
  ul.append(...items);

  block.replaceChildren(ul);
  if (block.classList.contains('filter') && items.length) {
    block.prepend(buildFilter(items));
  }
}
