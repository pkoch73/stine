/**
 * Per-layer config keyed by image filename.
 * Positions are % of the 1440×1030 stage (captured from Figma).
 * role: 'bg' = static base, 'mockup' = staggered entrance + slight scroll
 * parallax, 'float' = gentle bob (logos), 'avatar' = lively collaboration motion.
 */
const LAYERS = {
  'background.png': {
    role: 'circles', left: 0, top: 0, width: 100, depth: 0.15,
  },
  'hero-editor.png': {
    role: 'mockup', left: 28.33, top: 41.75, width: 42.08, depth: 0.45, order: 2,
  },
  'hero-doc-left.png': {
    role: 'mockup', left: 13.96, top: 60.1, width: 29.65, depth: 0.6, order: 3,
  },
  'hero-panel.png': {
    role: 'mockup', left: 53.13, top: 48.93, width: 32.57, depth: 0.7, order: 4,
  },
  'hero-small.png': {
    role: 'mockup', left: 66.94, top: 59.32, width: 29.58, depth: 0.85, order: 5,
  },
  'hero-publish.png': {
    role: 'mockup', left: 68.96, top: 41.75, width: 11.74, depth: 0.9, order: 1,
  },
  'logo-adobe.png': {
    role: 'float', left: 17.92, top: 42.62, width: 3.96, dur: 6, delay: -0.5,
  },
  'logo-claude.png': {
    role: 'float', left: 30.07, top: 46.02, width: 4.17, dur: 7, delay: -2,
  },
  'avatar-1.png': {
    role: 'avatar', left: 72.96, top: 73.55, width: 9.2, dur: 4.2, delay: 0, depth: 1.15,
  },
  'avatar-2.png': {
    role: 'avatar', left: 34.96, top: 54.85, width: 10.76, dur: 5.1, delay: -1.6, depth: 1.05,
  },
  'avatar-3.png': {
    role: 'avatar', left: 75.41, top: 36.44, width: 10.54, dur: 4.6, delay: -3, depth: 1.25,
  },
  'avatar-4.png': {
    role: 'avatar', left: 12.67, top: 77.57, width: 10.4, dur: 5.8, delay: -0.8, depth: 1.1,
  },
};

const DEFAULT_LAYER_FILES = Object.keys(LAYERS);

/**
 * Inject repo hero assets when authored content still has the placeholder.
 * @param {Element} content hero content wrapper
 * @returns {Element[]} picture elements to decorate
 */
function ensureHeroPictures(content) {
  const pictures = [...content.querySelectorAll('picture')];
  const onlyPlaceholder = pictures.length === 1
    && !pictures[0].querySelector('img')?.src?.includes('/img/');
  if (!onlyPlaceholder) return pictures;

  pictures.forEach((picture) => {
    const owner = picture.closest('p');
    picture.remove();
    if (owner && !owner.textContent.trim()) owner.remove();
  });

  return DEFAULT_LAYER_FILES.map((file) => {
    const picture = document.createElement('picture');
    const img = document.createElement('img');
    img.src = `/img/${file}`;
    img.loading = 'eager';
    if (file === 'hero-editor.png') img.alt = 'Experience Workspace editor';
    else if (file === 'hero-panel.png') img.alt = 'Pre-flight checker';
    else img.alt = '';
    picture.append(img);
    content.append(picture);
    return picture;
  });
}

/**
 * loads and decorates the hero
 * @param {Element} block The hero block element
 */
export default async function decorate(block) {
  const content = block.querySelector(':scope > div > div') || block;
  content.classList.add('hero-content');
  const row = content.parentElement || block;

  // group the CTA button paragraphs into one actions row
  const buttons = [...content.querySelectorAll('p.button-wrapper')];
  if (buttons.length) {
    const actions = document.createElement('div');
    actions.className = 'hero-actions';
    buttons[0].before(actions);
    actions.append(...buttons);
  }

  const pictures = ensureHeroPictures(content);
  if (!pictures.length) return;

  const stage = document.createElement('div');
  stage.className = 'hero-stage';
  const mockups = [];
  const avatars = [];

  pictures.forEach((picture) => {
    const owner = picture.closest('p');
    if (owner && !owner.textContent.trim()) owner.remove();
    const img = picture.querySelector('img');
    const file = (img ? img.getAttribute('src') : '').split('/').pop();
    const cfg = LAYERS[file] || { role: 'mockup' };

    if (cfg.role === 'bg') {
      const scene = document.createElement('div');
      scene.className = 'hero-scene';
      scene.append(picture);
      stage.append(scene);
      return;
    }

    const layer = document.createElement('div');
    layer.style.left = `${cfg.left}%`;
    layer.style.width = `${cfg.width}%`;
    if (cfg.bottom !== undefined) layer.style.bottom = `${cfg.bottom}%`;
    else layer.style.top = `${cfg.top}%`;

    // hide gracefully until the transparent PNG is supplied
    if (img) {
      const hideIfMissing = () => {
        if (img.complete && img.naturalWidth === 0) layer.style.display = 'none';
      };
      img.addEventListener('error', () => { layer.style.display = 'none'; });
      img.addEventListener('load', hideIfMissing);
      hideIfMissing();
    }

    if (cfg.role === 'circles') {
      layer.className = 'hero-circles';
      layer.dataset.depth = cfg.depth || 0.15;
      layer.append(picture);
      mockups.push(layer); // shares the scroll-parallax loop
    } else if (cfg.role === 'avatar') {
      layer.className = 'hero-avatar';
      layer.dataset.depth = cfg.depth || 1;
      const bob = document.createElement('div');
      bob.className = 'hero-avatar-bob';
      bob.style.animationDuration = `${cfg.dur}s`;
      bob.style.animationDelay = `${cfg.delay}s`;
      bob.append(picture);
      layer.append(bob);
      avatars.push(layer);
    } else if (cfg.role === 'float') {
      layer.className = 'hero-float';
      const bob = document.createElement('div');
      bob.className = 'hero-float-bob';
      bob.style.animationDuration = `${cfg.dur}s`;
      bob.style.animationDelay = `${cfg.delay}s`;
      bob.append(picture);
      layer.append(bob);
    } else {
      layer.className = 'hero-mockup';
      layer.style.setProperty('--enter-delay', `${0.22 * (cfg.order || 1)}s`);
      layer.dataset.depth = cfg.depth || 0.4;
      const inner = document.createElement('div');
      inner.className = 'hero-mockup-in';
      inner.append(picture);
      layer.append(inner);
      mockups.push(layer);
    }

    stage.append(layer);
  });

  row.append(stage);

  if (mockups.length) {
    // eslint-disable-next-line no-use-before-define
    enableStageParallax(block, mockups);
  }

  if (avatars.length) {
    // eslint-disable-next-line no-use-before-define
    enableAvatarCollaboration(block, avatars);
  }
}

/**
 * Scroll + pointer parallax on stage layers. Closer items (higher depth) drift
 * more on scroll and react more to cursor position. Skipped under reduced-motion
 * or on coarse pointers. Entrance animation lives on an inner wrapper so it does
 * not fight these transforms.
 * @param {Element} block the hero block
 * @param {Element[]} layers the parallax layers
 */
function enableStageParallax(block, layers) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const stage = block.querySelector('.hero-stage');
  const surface = block.querySelector(':scope > div') || block;
  if (!stage || !surface) return;

  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  let scrollProgress = 0;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;
  let hovering = false;
  let ticking = false;
  let animating = false;

  const apply = () => {
    ticking = false;
    const ease = hovering ? 0.08 : 0.06;
    currentX += (targetX - currentX) * ease;
    currentY += (targetY - currentY) * ease;

    const settling = !hovering
      && Math.abs(currentX) < 0.002
      && Math.abs(currentY) < 0.002;
    if (settling) {
      currentX = 0;
      currentY = 0;
    }

    layers.forEach((layer) => {
      const depth = parseFloat(layer.dataset.depth) || 0.4;
      const scrollY = (-scrollProgress * 0.05 * depth);
      const moveX = currentX * depth * 26;
      const moveY = currentY * depth * 18;
      layer.style.transform = `translate3d(${moveX.toFixed(2)}px, ${(scrollY + moveY).toFixed(2)}px, 0)`;

      const inner = layer.querySelector('.hero-mockup-in');
      if (inner) {
        if (!settling) {
          inner.style.transform = `translate3d(${(currentX * depth * 10).toFixed(2)}px, ${(currentY * depth * 7).toFixed(2)}px, 0)`;
        } else {
          inner.style.transform = '';
        }
      }
    });

    animating = hovering || !settling;
    if (animating) request();
  };

  const request = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(apply);
    }
  };

  const onScroll = () => {
    scrollProgress = block.getBoundingClientRect().top;
    request();
  };

  const onPointerMove = (e) => {
    if (!canHover) return;
    const rect = stage.getBoundingClientRect();
    targetX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
    targetY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
    request();
  };

  const onPointerEnter = () => {
    if (!canHover) return;
    hovering = true;
    stage.classList.add('hero-stage-hover');
    request();
  };

  const onPointerLeave = () => {
    if (!canHover) return;
    hovering = false;
    targetX = 0;
    targetY = 0;
    stage.classList.remove('hero-stage-hover');
    request();
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  surface.addEventListener('pointerenter', onPointerEnter);
  surface.addEventListener('pointerleave', onPointerLeave);
  surface.addEventListener('pointermove', onPointerMove);
  onScroll();
}

/**
 * Ambient wander on collaborator avatars. Each avatar drifts to its own target
 * on a loose timer while the inner bob keeps a lively 2D float. Skipped under
 * reduced-motion.
 * @param {Element} block the hero block
 * @param {Element[]} avatars the avatar layers
 */
function enableAvatarCollaboration(block, avatars) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const actors = avatars.map((layer, index) => ({
    layer,
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    nextWander: performance.now() + index * 900,
    wanderX: 28 + (index % 3) * 8,
    wanderY: 22 + (index % 2) * 6,
  }));

  let ticking = false;

  const apply = (time) => {
    ticking = false;

    actors.forEach((actor) => {
      if (time >= actor.nextWander) {
        actor.targetX = (Math.random() - 0.5) * actor.wanderX * 2;
        actor.targetY = (Math.random() - 0.5) * actor.wanderY * 2;
        actor.nextWander = time + 2800 + Math.random() * 3200;
      }

      actor.x += (actor.targetX - actor.x) * 0.01;
      actor.y += (actor.targetY - actor.y) * 0.01;

      actor.layer.style.transform = `translate3d(${actor.x.toFixed(2)}px, ${actor.y.toFixed(2)}px, 0)`;
    });

    request();
  };

  const request = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(apply);
    }
  };

  request();
}
