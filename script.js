const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const touch = matchMedia('(hover:none)').matches;
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
const mouse = { x: innerWidth * .6, y: innerHeight * .45, moved: false };
addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; });

/* ---------- hero: halftone wordmark ---------- */
// A giant word, cropped by the hero's bottom edge, printed as a field of dots. Each dot is sized by how much of the
// letter covers its cell (area-true), so the type keeps its edges at any scale. The dots part around the pointer on
// springs and warm toward red as they are pushed off their place; a click sends a shock ring through the word.
const cv = $('#grid'), ctx = cv.getContext('2d'), hero = $('#hero'), glow = $('#glow');
const lite = touch || innerWidth < 900;
const HW = {
  word: 'продажи', face: '"Inter","Helvetica Neue",Arial,sans-serif', weight: 900,
  gap: lite ? 3 : 6, radius: lite ? 50 : 90, crop: lite ? .1 : .26,
  ink: [196, 196, 196], warm: [255, 31, 45], bg: '#050505'
};
let W = 0, H = 0, dpr = 1, dots = new Float32Array(0), count = 0;
let px = -1e5, py = -1e5, ring = { x: 0, y: 0, t: -1 };
let raf = 0, visible = true, awake = true, sx = innerWidth * .62, sy = innerHeight * .38;

function layout() {
  const m = document.createElement('canvas').getContext('2d');
  W = Math.max(1, Math.round(hero.getBoundingClientRect().width));
  m.font = `${HW.weight} 100px ${HW.face}`;
  const measured = m.measureText(HW.word).width;
  const size = measured > 0 ? W * 1.02 / measured * 100 : 100;
  m.font = `${HW.weight} ${size}px ${HW.face}`;
  const box = m.measureText(HW.word);
  const cap = box.actualBoundingBoxAscent || size * .72;

  // the hero grows to leave room for the visible part of the word under the text
  hero.style.setProperty('--word-h', Math.round(cap * (1 - HW.crop)) + 'px');
  H = Math.max(1, Math.round(hero.getBoundingClientRect().height));
  dpr = Math.min(devicePixelRatio || 1, lite ? 1.5 : 2);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);

  const mask = document.createElement('canvas'); mask.width = W; mask.height = H;
  const mc = mask.getContext('2d', { willReadFrequently: true });
  mc.font = `${HW.weight} ${size}px ${HW.face}`; mc.fillStyle = '#000'; mc.textBaseline = 'alphabetic';
  mc.fillText(HW.word, (W - box.width) / 2, H + cap * HW.crop);
  const img = mc.getImageData(0, 0, W, H).data;

  const gap = HW.gap, cols = Math.ceil(W / gap), rows = Math.ceil(H / gap), tmp = [];
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      let sum = 0; // coverage: average alpha over a 3x3 sample of the cell
      for (let sy2 = 0; sy2 < 3; sy2++) for (let sx2 = 0; sx2 < 3; sx2++) {
        const x = Math.min(W - 1, Math.floor(gx * gap + (sx2 + .5) * gap / 3));
        const y = Math.min(H - 1, Math.floor(gy * gap + (sy2 + .5) * gap / 3));
        sum += img[(y * W + x) * 4 + 3];
      }
      const cov = sum / (9 * 255);
      if (cov < .06) continue;
      const hx = gx * gap + gap / 2, hy = gy * gap + gap / 2;
      tmp.push(hx, hy, 0, 0, hx, hy, Math.sqrt(cov) * gap * .56); // x y vx vy homeX homeY radius
    }
  }
  dots = new Float32Array(tmp); count = tmp.length / 7;
  awake = true;
}

function draw(now) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = HW.bg; ctx.fillRect(0, 0, W, H);

  // soft red light that follows the pointer
  const tx = px > -1e4 ? px : W * .62, ty = py > -1e4 ? py : H * .38;
  sx += (tx - sx) * .12; sy += (ty - sy) * .12;
  glow.style.transform = `translate(${sx}px,${sy}px)`;

  const r = reduce ? 0 : HW.radius;
  const age = ring.t < 0 ? 1e9 : now - ring.t, ringR = age * .9;
  const [ir, ig, ib] = HW.ink, [wr, wg, wb] = HW.warm;
  const rest = new Path2D();
  let moving = false;
  for (let i = 0; i < count; i++) {
    const j = i * 7;
    let x = dots[j], y = dots[j + 1], vx = dots[j + 2], vy = dots[j + 3];
    const hx = dots[j + 4], hy = dots[j + 5], rad = dots[j + 6];
    if (!reduce) {
      if (age < 900) { // shock ring from a click
        const dx = hx - ring.x, dy = hy - ring.y, d = Math.sqrt(dx * dx + dy * dy) + .001;
        const band = 1 - Math.min(1, Math.abs(d - ringR) / 26);
        if (band > 0) { const f = band * 3.2 * (1 - age / 900); vx += dx / d * f; vy += dy / d * f; }
      }
      const ddx = x - px, ddy = y - py, d2 = ddx * ddx + ddy * ddy;
      if (r > 0 && d2 < r * r) { // push away from the pointer
        const d = Math.sqrt(d2) + .001, f = (1 - d / r) * 2.6;
        vx += ddx / d * f; vy += ddy / d * f;
      }
      vx = (vx + (hx - x) * .05) * .84; vy = (vy + (hy - y) * .05) * .84; // spring back home
      x += vx; y += vy;
      if (Math.abs(vx) + Math.abs(vy) > .02 || Math.abs(x - hx) + Math.abs(y - hy) > .05) moving = true;
      else { x = hx; y = hy; vx = 0; vy = 0; }
      dots[j] = x; dots[j + 1] = y; dots[j + 2] = vx; dots[j + 3] = vy;
    }
    const k = Math.min(1, Math.hypot(x - hx, y - hy) / 28); // warmth: 0 at home, 1 when far
    if (k > .02) {
      ctx.fillStyle = `rgb(${Math.round(ir + (wr - ir) * k)},${Math.round(ig + (wg - ig) * k)},${Math.round(ib + (wb - ib) * k)})`;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.2832); ctx.fill();
    } else { rest.moveTo(x + rad, y); rest.arc(x, y, rad, 0, 6.2832); }
  }
  ctx.fillStyle = `rgb(${ir},${ig},${ib})`; ctx.fill(rest);
  awake = !reduce && (moving || age < 900 || px > -1e4); // sleep once everything is home and nothing pushes
}
function loop(now) { raf = 0; if (!visible) return; draw(now); if (awake) raf = requestAnimationFrame(loop); }
function wake() { awake = true; if (!raf && visible) raf = requestAnimationFrame(loop); }

const local = e => { const b = hero.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
hero.addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; [px, py] = local(e); wake(); });
hero.addEventListener('pointerleave', () => { px = py = -1e5; wake(); });
hero.addEventListener('pointerdown', e => {
  if (reduce || e.target.closest('a,button')) return;
  const p = local(e); ring = { x: p[0], y: p[1], t: performance.now() }; wake();
});
new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) wake(); }).observe(hero);

// re-lay out only when the hero's size really changes (fonts landing, text reflow, window resize)
let pending = 0;
new ResizeObserver(() => {
  if (pending) return;
  pending = requestAnimationFrame(() => {
    pending = 0;
    const b = hero.getBoundingClientRect();
    if (Math.round(b.width) !== W || Math.round(b.height) !== H) { layout(); wake(); }
  });
}).observe(hero);

layout(); draw(performance.now()); wake();
// the word is set in the real face once it has loaded
if (document.fonts && document.fonts.load) document.fonts.load(`${HW.weight} 100px Inter`, HW.word).then(() => { layout(); wake(); });

/* ---------- cursor ---------- */
const cur = $('#cursor');
if (!touch) {
  let cx = 0, cy = 0;
  const dot = $('#cursorDot'), root = document.documentElement;
  // the system arrow is hidden only once the custom cursor is actually running (mouse/pen, never touch)
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    root.classList.add('cursor-on'); cur.classList.add('on'); dot.classList.add('on');
    dot.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
  });
  root.addEventListener('mouseleave', () => { cur.classList.remove('on'); dot.classList.remove('on'); });
  (function loop() {
    cx += (mouse.x - cx) * .2; cy += (mouse.y - cy) * .2;
    cur.style.transform = `translate(${cx}px,${cy}px)`;
    requestAnimationFrame(loop);
  })();
  $$('a,summary').forEach(el => {
    el.addEventListener('pointerenter', () => cur.classList.add('big'));
    el.addEventListener('pointerleave', () => cur.classList.remove('big'));
  });
}

/* ---------- magnetic ---------- */
if (!touch && !reduce) $$('[data-magnetic]').forEach(el => {
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .28}px,${(e.clientY - r.top - r.height / 2) * .35}px)`;
  });
  el.addEventListener('pointerleave', () => {
    el.style.transition = 'transform .6s cubic-bezier(.2,.8,.2,1)';
    el.style.transform = '';
    setTimeout(() => el.style.transition = '', 600);
  });
});

/* ---------- spotlight cards ---------- */
$$('.spot').forEach(c => c.addEventListener('pointermove', e => {
  const r = c.getBoundingClientRect();
  c.style.setProperty('--mx', e.clientX - r.left + 'px');
  c.style.setProperty('--my', e.clientY - r.top + 'px');
}));

/* ---------- counters ---------- */
function countUp(el) {
  const end = +el.dataset.count, suf = el.dataset.suffix || '', pre = el.dataset.prefix || '', t0 = performance.now();
  (function f(t) {
    const p = Math.min((t - t0) / 1600, 1);
    el.textContent = pre + Math.round(end * (1 - Math.pow(1 - p, 4))) + suf;
    if (p < 1) requestAnimationFrame(f);
  })(t0);
}
setTimeout(() => $$('.trust [data-count]').forEach(countUp), 1300);

/* ---------- text scramble for labels ---------- */
function scramble(el) {
  const node = [...el.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
  if (!node) return;
  const final = node.textContent, chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/_', t0 = performance.now();
  (function f(t) {
    const p = Math.min((t - t0) / 900, 1), n = Math.floor(p * final.length);
    node.textContent = final.slice(0, n) + [...final.slice(n)].map(c => c === ' ' ? ' ' : chars[Math.random() * chars.length | 0]).join('');
    if (p < 1) requestAnimationFrame(f); else node.textContent = final;
  })(t0);
}

/* ---------- reveal ---------- */
const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in');
  if (e.target.hasAttribute('data-scramble') && !reduce) scramble(e.target);
  io.unobserve(e.target);
}), { threshold: .18 });
$$('.reveal').forEach(el => io.observe(el));

/* ---------- scroll-driven word highlight ---------- */
const scrub = $('#scrub');
scrub.innerHTML = scrub.textContent.trim().split(/\s+/).map(w => `<span class="wd">${w}</span>`).join(' ');
const words = $$('.wd', scrub);

/* ---------- scroll effects ---------- */
const bar = $('#progress'), nav = $('#nav'), giant = $('#giant'), sticky = $('#sticky'), services = $('#services');
const contactsEl = document.getElementById('contacts');
let lastY = scrollY;
function onScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  nav.classList.toggle('hide', scrollY > lastY && scrollY > 200);
  sticky.classList.toggle('show', scrollY > innerHeight * .8 && contactsEl.getBoundingClientRect().top > innerHeight * .35);
  lastY = scrollY;

  const r = scrub.getBoundingClientRect();
  const p = Math.min(1, Math.max(0, (innerHeight * .85 - r.top) / (r.height + innerHeight * .35)));
  const n = Math.round(p * words.length);
  words.forEach((w, i) => w.classList.toggle('lit', i < n));

  const sr = services.getBoundingClientRect();
  if (!reduce) giant.style.transform = `translateX(${-sr.top * .45}px)`;
}
addEventListener('scroll', onScroll, { passive: true }); onScroll();

/* ---------- hero stage parallax ---------- */
const fls = $$('.fl');
if (!touch && !reduce && fls.length) addEventListener('pointermove', e => {
  const nx = e.clientX / innerWidth - .5, ny = e.clientY / innerHeight - .5;
  fls.forEach(f => { const d = +f.dataset.depth; f.style.translate = `${nx * -d}px ${ny * -d}px`; });
});

/* ---------- eye follows the cursor while its block is on screen ---------- */
const iris = $('.iris'), eyeSvg = $('.eye-svg');
if (iris && eyeSvg && !reduce) {
  let eyeVisible = false, ix = 0, iy = 0;
  new IntersectionObserver(e => eyeVisible = e[0].isIntersecting).observe(eyeSvg);
  (function look() {
    requestAnimationFrame(look);
    if (!eyeVisible) return;
    const r = eyeSvg.getBoundingClientRect(), k = r.width / 240;
    const dx = mouse.x - (r.left + r.width / 2), dy = mouse.y - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy) || 1, f = Math.min(1, dist / (260 * k));
    const tx = mouse.moved ? dx / dist * 36 * f : 0, ty = mouse.moved ? dy / dist * 11 * f : 0;
    ix += (tx - ix) * .14; iy += (ty - iy) * .14;
    iris.style.transform = `translate(${ix.toFixed(2)}px,${iy.toFixed(2)}px)`;
  })();
}
