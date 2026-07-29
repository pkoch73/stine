/* ============ The Bridge v2 — trust-first timeline ============ */
/* Static page: no user data, no design data, no fabricated progress.
   Acts: 1 reassure (0–24) · 2 capabilities (24–46) · 3 why-the-wait (46–76) ·
   4 AEM tour, 6 chapters (76–121) · 5 quiet close (121+). */

const COMPRESSED_END = 130;
const REAL_SECONDS = 600;
const ACT_STARTS = { 1: 0, 2: 30, 3: 52, 4: 82, 5: 127 };

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const clock = {
  t: 0, running: true, speed: 1, last: null,
  tick(now) {
    if (this.last == null) this.last = now;
    if (this.running && this.t < COMPRESSED_END) this.t += ((now - this.last) / 1000) * this.speed;
    this.last = now;
    this.t = Math.min(this.t, COMPRESSED_END);
  },
};

const LAYERS = $$('.layer');
const BLOCK_MAP = [
  { src: 'Navigation', block: 'Header' },
  { src: 'Opening section', block: 'Hero' },
  { src: 'Link row', block: 'Columns' },
  { src: 'Card grid', block: 'Cards' },
  { src: 'Copy section', block: 'Text' },
  { src: 'Call to action', block: 'Banner' },
  { src: 'Page footer', block: 'Footer' },
];

const cues = [];
const cue = (t, fn) => cues.push({ t, fn });

function setAct(n) {
  document.body.dataset.act = String(n);
  $$('.act').forEach((a, i) => a.classList.toggle('on', i === n - 1));
  const dots = $$('#snav-dots button');
  dots.forEach((d, i) => d.classList.toggle('active', i === n - 1));
  // no previous on the first section, no next on the last section
  $('#snav-prev').hidden = n <= 1;
  $('#snav-next').hidden = n >= dots.length;
}

/* ---------- Act 1: big centered intro lines, second one docks ---------- */
cue(0, () => {
  setAct(1);
  $('#narr-1').classList.add('on', 'hero');
});
cue(6, () => $('#narr-1').classList.remove('on'));
/* second line is informational: it appears directly at its final size */
cue(7, () => $('#narr-2').classList.add('on'));
cue(8.5, () => $('#iso').classList.add('s1'));
cue(11, () => $('#fact-1').classList.add('on'));
cue(13.5, () => $('#fact-2').classList.add('on'));
cue(16, () => $('#fact-3').classList.add('on'));
cue(19.5, () => {
  $('#narr-2').classList.remove('on');
  $('#narr-2b').classList.add('on');
});
cue(21, () => $('#iso').classList.add('s2'));

/* ---------- Act 2: capabilities ---------- */
cue(30, () => setAct(2));
cue(32, () => $('#cap-1').classList.add('on'));
cue(37, () => $('#cap-2').classList.add('on'));
cue(42, () => $('#cap-3').classList.add('on'));
cue(47, () => $('#cap-note').classList.add('on'));

/* ---------- Act 3: why the wait ---------- */
cue(52, () => {
  setAct(3);
  $('#narr-3').classList.add('on');
  document.body.classList.add('arrived');
});
cue(56, () => document.body.classList.add('exploded'));

const railList = $('#rail-list');
BLOCK_MAP.forEach((m, i) => {
  cue(59 + i * 2.9, () => {
    LAYERS.forEach((l, j) => l.classList.toggle('lit', j === i));
    let li = railList.children[i];
    if (!li) {
      li = document.createElement('li');
      li.innerHTML = `<span class="tick">✓</span><span class="src">${m.src}</span><span class="arr">→</span><b>${m.block} block</b>`;
      railList.appendChild(li);
    }
    requestAnimationFrame(() => li.classList.add('on'));
    [...railList.children].forEach((el, j) => el.classList.toggle('now', j === i));
  });
});
cue(80, () => {
  LAYERS.forEach((l) => l.classList.remove('lit'));
  [...railList.children].forEach((el) => el.classList.remove('now'));
  $('#rail-note').classList.add('on');
});

/* ---------- Act 4: AEM tour (6 chapters) ---------- */
const CHAP_AT = [82, 89.5, 97, 104.5, 112, 119.5];
const CHAP_DUR = 7.5;
cue(82, () => setAct(4));
CHAP_AT.forEach((at, i) => {
  cue(at, () => {
    $$('.chap').forEach((c, j) => {
      c.classList.toggle('active', j === i);
      c.classList.toggle('done', j < i);
      c.classList.toggle('playing', j === i);
      if (j === i) c.style.setProperty('--chap-dur', `${CHAP_DUR / clock.speed}s`);
      if (j > i) c.classList.remove('done', 'playing');
    });
    $$('.panel').forEach((p, j) => {
      p.classList.toggle('on', j === i);
      p.classList.toggle('off', j < i);
    });
    if (i === 4) $('#tb-menu').classList.remove('open');
    if (i === 5) { $('#sk-env').textContent = 'Preview ⌄'; $('#sk-env').classList.remove('live'); }
  });
});
cue(114.5, () => $('#tb-menu').classList.add('open'));
cue(124.5, () => { const e = $('#sk-env'); e.textContent = 'Live ⌄'; e.classList.add('live'); });

/* ---------- Act 5: quiet close ---------- */
cue(127, () => setAct(5));

/* ---------- reset + seek ---------- */
function resetAll() {
  document.body.classList.remove('arrived', 'exploded');
  $$('.act').forEach((a) => a.classList.remove('on'));
  $$('.narr-line').forEach((n) => n.classList.remove('on', 'hero'));
  $('#iso').classList.remove('s1', 's2');
  $$('.capsule-facts li').forEach((f) => f.classList.remove('on'));
  $$('.cap-step, #cap-note').forEach((c) => c.classList.remove('on'));
  LAYERS.forEach((l) => l.classList.remove('lit'));
  railList.innerHTML = '';
  $('#rail-note').classList.remove('on');
  $$('.chap').forEach((c) => c.classList.remove('active', 'done', 'playing'));
  $$('.panel').forEach((p) => p.classList.remove('on', 'off'));
  $('#tb-menu').classList.remove('open');
  const env = $('#sk-env'); env.textContent = 'Preview ⌄'; env.classList.remove('live');
}

let fired = new Set();
function seek(t) {
  document.body.classList.add('instant');
  resetAll();
  cues.filter((c) => c.t <= t).sort((a, b) => a.t - b.t).forEach((c) => c.fn());
  fired = new Set(cues.map((c, i) => (c.t <= t ? i : -1)).filter((i) => i >= 0));
  clock.t = t;
  clock.last = null;
  document.body.offsetHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('instant')));
}

/* ---------- interactions ---------- */
$('#demo-cta').addEventListener('click', () => {
  // same-origin iframe → target the parent's origin (== ours), not '*'
  window.parent.postMessage({ type: 'status:try-it-out' }, window.location.origin);
});

/* keep the close screen visibly alive for minutes: cycle honest status lines
   on the wall clock (independent of the demo timeline) */
const CLOSE_STATUS = [
  'Still preparing your page',
  'Still working, this can take a few minutes',
  'Thanks for your patience',
  'Still at it, nothing has stalled',
];
let closeStatusIdx = 0;
setInterval(() => {
  closeStatusIdx = (closeStatusIdx + 1) % CLOSE_STATUS.length;
  $('#close-status-text').textContent = CLOSE_STATUS[closeStatusIdx];
}, 14000);

/* ---------- story navigation (dots + arrows) ---------- */
function currentAct() { return parseInt(document.body.dataset.act, 10) || 1; }
function goAct(n) {
  const clamped = Math.max(1, Math.min(5, n));
  seek(ACT_STARTS[clamped]);
}
$('#snav-dots').addEventListener('click', (e) => {
  const dot = e.target.closest('button[data-go]');
  if (dot) goAct(parseInt(dot.dataset.go, 10));
});
$('#snav-prev').addEventListener('click', () => goAct(currentAct() - 1));
$('#snav-next').addEventListener('click', () => goAct(currentAct() + 1));

/* tour chapter tabs jump straight to their chapter */
$('#chapters').addEventListener('click', (e) => {
  const chap = e.target.closest('.chap');
  if (!chap) return;
  seek(CHAP_AT[parseInt(chap.dataset.chap, 10)]);
});

/* ---------- main loop ---------- */
function loop(now) {
  clock.tick(now);
  cues.forEach((c, i) => {
    if (c.t <= clock.t && !fired.has(i)) { fired.add(i); c.fn(); }
  });
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
