/**
 * loads and decorates the cta band
 * @param {Element} block The cta block element
 */
export default async function decorate(block) {
  const content = block.querySelector(':scope > div > div') || block;
  content.classList.add('cta-content');

  // scroll-reveal: opt into animation only when JS runs (no-JS stays visible)
  if (window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
    block.classList.add('cta-animated');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        // reveal when in view, or already scrolled past (e.g. reload mid-page)
        if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
          entry.target.classList.add('cta-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });
    observer.observe(block);
  }
}
