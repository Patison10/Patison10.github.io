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
  word: 'patson', face: '"Inter","Helvetica Neue",Arial,sans-serif', weight: 900,
  gap: lite ? 3 : 6, radius: lite ? 50 : 90, crop: lite ? .12 : .46,
  ink: [196, 196, 196], warm: [255, 31, 45], bg: '#050505'
};
let W = 0, H = 0, dpr = 1, dots = new Float32Array(0), count = 0;
let px = -1e5, py = -1e5, lastMove = 0, ring = { x: 0, y: 0, t: -1 };
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
  ctx.clearRect(0, 0, W, H); // transparent: the ASCII layer shows through behind the word

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
  awake = !reduce && (moving || age < 900 || (px > -1e4 && now - lastMove < 500)); // sleep once everything is home and nothing pushes
}
function loop(now) { raf = 0; if (!visible) return; draw(now); if (awake) raf = requestAnimationFrame(loop); }
function wake() { awake = true; if (!raf && visible) raf = requestAnimationFrame(loop); }

const local = e => { const b = hero.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
hero.addEventListener('pointermove', e => { if (e.pointerType === 'touch') return; [px, py] = local(e); lastMove = performance.now(); wake(); });
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

/* ---------- hero: ASCII reaction front (live Gray-Scott reaction-diffusion) ---------- */
// The simulation grid IS the glyph grid: every character is one cell of a real chemical solver. Luminance is not the
// concentration; each cell is inked by the gradient of V and only the RIDGE of that gradient survives (non-maximum
// suppression), so every reaction front collapses to a thin crawling line instead of a wash. The pointer is a pipette:
// it raises V and eats U in a small gaussian, which nucleates a new front under the cursor.
(() => {
  const canvas = $('#ascii');
  if (!canvas) return;
  const area = $('#hero'), g = canvas.getContext('2d');
  const RAMP = ' .:-=+*#%@', BUCKETS = 6;
  const DU = 1, DV = .5, FEED = .018, KILL = .051; // worm/front regime: sparse AND moving
  const SUB = lite ? 3 : 4, WARM = lite ? 420 : 520, REDUCED_EXTRA = 400;
  const CELL = lite ? 18 : 16, FONT = '"JetBrains Mono",ui-monospace,Menlo,Consolas,monospace';
  const SEEDS = 7, SEED_R = 4, GRAD_SCALE = .14, INK_FLOOR = .08;
  const W_DIAG = .05, W_ORTHO = .8;
  const INJ_TAU = .4, INJ_R = 3.5, INJ_V = .42, INJ_U = .2;
  const GRAY = '#cfcfcf', RED = '#ff1f2d';

  let cellW = CELL, cellH = CELL, cols = 0, rows = 0, dpr = 1, sized = false;
  let U, V, Un, Vn, lf, rt, up, dn, charBuf, gradBuf;
  let wx = W_ORTHO / 4, wy = W_ORTHO / 4;
  const buckets = Array.from({ length: BUCKETS }, () => []);
  let warmLeft = 0, raf = 0, last = 0, visible = true, lastW = 0, lastH = 0, timer = 0, tick = 0, cost = 0, skip = lite;
  const ptr = { gx: -1e5, gy: -1e5, has: false, strength: 0 };

  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const wrap = (v, n) => ((v % n) + n) % n;

  function seed() {
    U.fill(1); V.fill(0);
    const rnd = rng(0x5eed1);
    for (let s = 0; s < SEEDS; s++) {
      const cx = Math.floor(rnd() * cols), cy = Math.floor(rnd() * rows);
      for (let dy = -SEED_R; dy <= SEED_R; dy++) for (let dx = -SEED_R; dx <= SEED_R; dx++) {
        if (dx * dx + dy * dy > SEED_R * SEED_R) continue;
        const i = wrap(cy + dy, rows) * cols + wrap(cx + dx, cols);
        V[i] = .5; U[i] = .25;
      }
    }
  }

  // one Gray-Scott substep with a 9-point laplacian and toroidal wrap
  function step() {
    for (let y = 0; y < rows; y++) {
      const yc = y * cols, ym = up[y] * cols, yp = dn[y] * cols;
      for (let x = 0; x < cols; x++) {
        const xm = lf[x], xp = rt[x], i = yc + x, u = U[i], v = V[i];
        const lapU = -u + wx * (U[yc + xm] + U[yc + xp]) + wy * (U[ym + x] + U[yp + x]) + W_DIAG * (U[ym + xm] + U[ym + xp] + U[yp + xm] + U[yp + xp]);
        const lapV = -v + wx * (V[yc + xm] + V[yc + xp]) + wy * (V[ym + x] + V[yp + x]) + W_DIAG * (V[ym + xm] + V[ym + xp] + V[yp + xm] + V[yp + xp]);
        const uvv = u * v * v;
        Un[i] = u + (DU * lapU - uvv + FEED * (1 - u));
        Vn[i] = v + (DV * lapV + uvv - (FEED + KILL) * v);
      }
    }
    let t = U; U = Un; Un = t; t = V; V = Vn; Vn = t;
  }

  function inject(gx, gy, strength) {
    if (strength < .01) return;
    const r = Math.ceil(INJ_R), cx = Math.round(gx), cy = Math.round(gy);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > INJ_R * INJ_R) continue;
      const i = wrap(cy + dy, rows) * cols + wrap(cx + dx, cols), k = Math.exp(-d2 / 6);
      V[i] = Math.min(1, V[i] + INJ_V * strength * k);
      U[i] = Math.max(0, U[i] - INJ_U * strength * k);
    }
  }

  function draw() {
    if (!sized) return;
    g.clearRect(0, 0, cols * cellW, rows * cellH);
    for (let b = 0; b < BUCKETS; b++) buckets[b].length = 0;
    // gradient magnitude of V over the whole grid
    for (let y = 0; y < rows; y++) {
      const yc = y * cols, ym = up[y] * cols, yp = dn[y] * cols;
      for (let x = 0; x < cols; x++) {
        const gx = (V[yc + rt[x]] - V[yc + lf[x]]) * .5, gy = (V[yp + x] - V[ym + x]) * .5;
        gradBuf[yc + x] = Math.abs(gx) + Math.abs(gy);
      }
    }
    // keep only the ridge (local maximum along EITHER axis), ramp-index it, bucket it by luminance
    for (let y = 0; y < rows; y++) {
      const yc = y * cols, ym = up[y] * cols, yp = dn[y] * cols;
      for (let x = 0; x < cols; x++) {
        const i = yc + x, gr = gradBuf[i];
        charBuf[i] = 0;
        const onRidge = (gr >= gradBuf[yc + rt[x]] && gr >= gradBuf[yc + lf[x]]) || (gr >= gradBuf[yp + x] && gr >= gradBuf[ym + x]);
        if (!onRidge) continue;
        let lum = gr / GRAD_SCALE;
        lum = lum < 0 ? 0 : lum > 1 ? 1 : lum;
        if (lum < INK_FLOOR) continue;
        const ci = Math.floor(lum * (RAMP.length - 1));
        charBuf[i] = ci;
        if (ci === 0) continue;
        buckets[Math.min(BUCKETS - 1, Math.floor(lum * BUCKETS))].push(i);
      }
    }
    // one alpha write per bucket; the strongest fronts are red, the rest grey
    for (let b = 0; b < BUCKETS; b++) {
      const list = buckets[b];
      if (!list.length) continue;
      g.globalAlpha = .1 + b / (BUCKETS - 1) * .9;
      g.fillStyle = b >= BUCKETS - 2 ? RED : GRAY;
      for (let k = 0; k < list.length; k++) {
        const idx = list[k], x = idx % cols, y = (idx - x) / cols;
        g.fillText(RAMP[charBuf[idx]], x * cellW + cellW / 2, y * cellH + cellH / 2);
      }
    }
    g.globalAlpha = 1;
  }

  function resize() {
    const b = area.getBoundingClientRect(), width = b.width, height = b.height;
    if (width < 2 || height < 2) { sized = false; return; }
    lastW = Math.round(width); lastH = Math.round(height);
    dpr = Math.min(devicePixelRatio || 1, 1.5);
    canvas.width = Math.max(1, Math.round(width * dpr)); canvas.height = Math.max(1, Math.round(height * dpr));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const m = document.createElement('canvas').getContext('2d');
    m.font = `${CELL}px ${FONT}`;
    cellW = Math.max(4, m.measureText('MMMMMMMMMM').width / 10); cellH = CELL;
    g.font = `${CELL}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    cols = Math.max(8, Math.ceil(width / cellW)); rows = Math.max(8, Math.ceil(height / cellH));
    // split the orthogonal laplacian budget by 1/dx^2 : 1/dy^2 so the field is isotropic ON SCREEN despite the tall cell
    const a2 = (cellH / cellW) * (cellH / cellW);
    wx = W_ORTHO / 2 * (a2 / (1 + a2)); wy = W_ORTHO / 2 * (1 / (1 + a2));
    const n = cols * rows;
    U = new Float32Array(n); V = new Float32Array(n); Un = new Float32Array(n); Vn = new Float32Array(n);
    charBuf = new Uint8Array(n); gradBuf = new Float32Array(n);
    lf = new Int32Array(cols); rt = new Int32Array(cols); up = new Int32Array(rows); dn = new Int32Array(rows);
    for (let x = 0; x < cols; x++) { lf[x] = (x - 1 + cols) % cols; rt[x] = (x + 1) % cols; }
    for (let y = 0; y < rows; y++) { up[y] = (y - 1 + rows) % rows; dn[y] = (y + 1) % rows; }
    sized = true; seed();
    // warm-up, so the first paint is not a blank grid; spread over a few frames to avoid one long freeze
    if (reduce) { for (let s = 0; s < WARM + REDUCED_EXTRA; s++) step(); draw(); warmLeft = 0; } else warmLeft = WARM;
  }

  function loop(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    if (skip && (++tick & 1)) { raf = requestAnimationFrame(loop); return; } // phones: 30 fps; slow PCs: halve the rate
    const dt = last ? Math.min(.1, (now - last) / 1000) : 1 / 60; last = now;
    if (sized) {
      if (warmLeft > 0) {
        const n = Math.min(warmLeft, 130);
        for (let s = 0; s < n; s++) step();
        warmLeft -= n;
        if (warmLeft > 0) { raf = requestAnimationFrame(loop); return; }
      }
      ptr.strength += ((ptr.has ? 1 : 0) - ptr.strength) * Math.min(1, dt / INJ_TAU);
      if (ptr.strength > .01 && ptr.gx > -1e4) inject(ptr.gx, ptr.gy, ptr.strength);
      const t0 = performance.now();
      for (let s = 0; s < SUB; s++) step();
      draw();
      cost += (performance.now() - t0 - cost) * .1; // moving average of the work per frame
      skip = lite || cost > 9;
    }
    raf = requestAnimationFrame(loop);
  }
  const wake = () => { if (!raf && !reduce && visible && !document.hidden) { last = 0; raf = requestAnimationFrame(loop); } };

  if (!reduce) {
    area.addEventListener('pointermove', e => {
      if (e.pointerType === 'touch') return;
      const b = area.getBoundingClientRect();
      ptr.gx = (e.clientX - b.left) / cellW; ptr.gy = (e.clientY - b.top) / cellH; ptr.has = true;
    });
    area.addEventListener('pointerleave', () => { ptr.has = false; });
  }
  new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible) wake(); }).observe(area);
  document.addEventListener('visibilitychange', wake);
  // re-create the dish only when the hero really changes size
  new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const b = area.getBoundingClientRect();
      if (Math.abs(Math.round(b.width) - lastW) > 1 || Math.abs(Math.round(b.height) - lastH) > 40) { resize(); wake(); }
    }, 200);
  }).observe(area);

  const start = () => { resize(); wake(); };
  const fonts = document.fonts && document.fonts.load ? document.fonts.load(`${CELL}px "JetBrains Mono"`, 'M') : Promise.resolve();
  fonts.then(() => document.fonts.ready).then(start, start);
})();

/* ---------- cursor: a single ring that replaces the system arrow ---------- */
const cur = $('#cursor');
if (!touch) {
  let cx = 0, cy = 0, raf2 = 0;
  const root = document.documentElement;
  const follow = () => {
    cx += (mouse.x - cx) * .32; cy += (mouse.y - cy) * .32;
    cur.style.transform = `translate(${cx.toFixed(1)}px,${cy.toFixed(1)}px)`;
    raf2 = Math.abs(mouse.x - cx) + Math.abs(mouse.y - cy) > .3 ? requestAnimationFrame(follow) : 0; // idle = no loop
  };
  // the system arrow is hidden only once the ring is actually running (mouse/pen, never touch)
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    if (!root.classList.contains('cursor-on')) { cx = e.clientX; cy = e.clientY; }
    root.classList.add('cursor-on'); cur.classList.add('on');
    if (!raf2) raf2 = requestAnimationFrame(follow);
  });
  root.addEventListener('mouseleave', () => cur.classList.remove('on'));
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
let lastY = scrollY, ticking = false, litN = -1;
function update() {
  ticking = false;
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  nav.classList.toggle('hide', scrollY > lastY && scrollY > 200);
  sticky.classList.toggle('show', scrollY > innerHeight * .8 && contactsEl.getBoundingClientRect().top > innerHeight * .35);
  lastY = scrollY;

  const r = scrub.getBoundingClientRect();
  if (r.bottom > -200 && r.top < innerHeight + 200) {
    const p = Math.min(1, Math.max(0, (innerHeight * .85 - r.top) / (r.height + innerHeight * .35)));
    const n = Math.round(p * words.length);
    if (n !== litN) { words.forEach((w, i) => w.classList.toggle('lit', i < n)); litN = n; }
  }

  const sr = services.getBoundingClientRect();
  if (!reduce && sr.bottom > -300 && sr.top < innerHeight + 300) giant.style.transform = `translateX(${-sr.top * .45}px)`;
}
function onScroll() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }
addEventListener('scroll', onScroll, { passive: true }); update();

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

/* ---------- pricing calculator: «Ваш вкус» ---------- */
// Every price lives in CFG. Source: the Kwork offer: base 7 000 (Эконом), «+5 блоков» 4 000, «Telegram-бот» 3 000.
// The options of the packages are 750 each: the 3 000 ₽ step between the packages split over its 4 options, so a full
// «Стандарт» adds up to 10 000 and a full «Бизнес» to 13 000, exactly like the packages.
(() => {
  const root = $('#custom');
  if (!root) return;
  const kworkHref = $('a[href*="kwork.ru/website-development"]').href;
  const TG = 'https://t.me/Patisonooochik';
  const CFG = {
    base: { price: 7000, blocks: 7, days: 3 },
    pack: { size: 5, price: 4000, max: 8 },
    styles: ['Тёмный минимализм', 'Светлый и чистый', 'Яркий и дерзкий', 'Строгий деловой', 'Свой вариант'],
    options: [
      { id: 'domain', group: 'std', label: 'Доменное имя', desc: 'Подключение домена к сайту', price: 750 },
      { id: 'seo', group: 'std', label: 'SEO-оптимизация', desc: 'Заголовки и описание для поиска', price: 750 },
      { id: 'form', group: 'std', label: 'Форма обратной связи', desc: 'Заявки в Telegram или на почту', price: 750 },
      { id: 'pics', group: 'std', label: 'Подбор картинок', desc: 'Изображения под ваш бизнес', price: 750 },
      { id: 'order', group: 'biz', label: 'Форма заказа', desc: 'Клиент оформляет заказ на сайте', price: 750 },
      { id: 'chat', group: 'biz', label: 'Онлайн-консультант', desc: 'Чат для быстрых вопросов', price: 750 },
      { id: 'content', group: 'biz', label: 'Наполнение контентом', desc: 'Тексты и материалы за вас', price: 750 },
      { id: 'metrika', group: 'biz', label: 'Яндекс Метрика', desc: 'Аналитика посещений', price: 750 },
      { id: 'bot', group: 'extra', label: 'Telegram-бот на вашем облаке', desc: 'Бот для заявок и уведомлений', price: 3000 },
      { id: 'admin', group: 'extra', label: 'Админ-панель', desc: 'Цену назову после обсуждения', price: 0, ask: true }
    ]
  };
  const fmt = n => n.toLocaleString('ru-RU') + ' ₽';
  const state = { packs: 0, style: CFG.styles[0], qty: Object.fromEntries(CFG.options.map(o => [o.id, 0])) };
  const ids = g => CFG.options.filter(o => o.group === g).map(o => o.id);
  const GROUPS = { std: ids('std'), biz: ids('biz') };

  // ---- build the rows ----
  const row = (id, label, desc, price, value) => `<div class="cu-row" data-id="${id}">
    <div class="cu-info"><b>${label}</b><span>${desc}</span></div><em class="cu-price">${price}</em>
    <div class="stp"><button type="button" data-d="-1" aria-label="Убрать: ${label}">−</button><output>${value}</output><button type="button" data-d="1" aria-label="Добавить: ${label}">+</button></div></div>`;
  $('#cuBlocks').innerHTML = row('blocks', 'Количество блоков', `В основе до ${CFG.base.blocks}, добавляем по ${CFG.pack.size}`, '+' + fmt(CFG.pack.price) + ' за +' + CFG.pack.size, CFG.base.blocks);
  for (const g of ['std', 'biz', 'extra']) {
    $('#cu' + g[0].toUpperCase() + g.slice(1)).innerHTML = CFG.options.filter(o => o.group === g)
      .map(o => row(o.id, o.label, o.desc, o.ask ? 'по договорённости' : '+' + fmt(o.price), 0)).join('');
  }
  $('#cuStyles').innerHTML = CFG.styles.map(s => `<button type="button" class="cu-style" aria-pressed="false">${s}</button>`).join('');
  const presets = [['econ', 'Как «Эконом»'], ['std', 'Как «Стандарт»'], ['biz', 'Как «Бизнес»']];
  $('#cuPresets').insertAdjacentHTML('beforeend', presets.map(p => `<button type="button" data-preset="${p[0]}">${p[1]}</button>`).join(''));

  // ---- logic ----
  const selected = g => GROUPS[g].filter(id => state.qty[id] > 0);
  const calc = () => {
    let total = CFG.base.price + state.packs * CFG.pack.price, ask = false;
    const lines = [['Основа: адаптивный лендинг, хостинг, правки без лимита', CFG.base.price]];
    if (state.packs) lines.push([`+${state.packs * CFG.pack.size} блоков`, state.packs * CFG.pack.price]);
    for (const o of CFG.options) {
      if (!state.qty[o.id]) continue;
      if (o.ask) { ask = true; lines.push([o.label + ' (цена по договорённости)', null]); continue; }
      total += o.price * state.qty[o.id]; lines.push([o.label, o.price * state.qty[o.id]]);
    }
    const std = selected('std').length, biz = selected('biz').length;
    const days = biz ? 7 : std ? 5 : CFG.base.days;
    const sameSet = (sel, want) => sel.length === want.length && want.every(id => sel.includes(id));
    let pkg = null;
    if (!state.qty.admin) {
      if (!std && !biz) pkg = 'Эконом';
      else if (sameSet(selected('std'), GROUPS.std) && !biz) pkg = 'Стандарт';
      else if (sameSet(selected('std'), GROUPS.std) && sameSet(selected('biz'), GROUPS.biz)) pkg = 'Бизнес';
    }
    return { total, ask, lines, days, pkg };
  };

  let shown = CFG.base.price, tween = 0;
  const showTotal = to => {
    cancelAnimationFrame(tween);
    const from = shown, t0 = performance.now();
    if (reduce) { shown = to; $('#cuTotal').textContent = fmt(to); return; }
    (function f(t) {
      const p = Math.min(1, (t - t0) / 260);
      shown = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3)));
      $('#cuTotal').textContent = fmt(shown);
      if (p < 1) tween = requestAnimationFrame(f);
    })(t0);
  };

  const message = r => [
    'Здравствуйте, Максим! Хочу лендинг «Ваш вкус».',
    'Стиль: ' + state.style,
    'Блоков: ' + (CFG.base.blocks + state.packs * CFG.pack.size),
    'Опции: ' + (CFG.options.filter(o => state.qty[o.id]).map(o => o.label).join(', ') || 'без дополнительных'),
    ($('#cuWish').value.trim() ? 'Пожелания: ' + $('#cuWish').value.trim() : ''),
    `Ориентировочно: ${fmt(r.total)}${r.ask ? ' + админ-панель (по договорённости)' : ''}, срок от ${r.days} дней`
  ].filter(Boolean).join('\n');

  function render() {
    const r = calc();
    showTotal(r.total);
    $('#cuDays').textContent = `срок: от ${r.days} дней, правки без лимита${r.ask ? ', админ-панель обсудим' : ''}`;
    $('#cuList').innerHTML = r.lines.map(l => `<li><span>${l[0]}</span><b>${l[1] === null ? '—' : fmt(l[1])}</b></li>`).join('');
    const extras = state.packs || state.qty.bot;
    $('#cuAdvice').textContent = r.pkg
      ? `Это пакет «${r.pkg}»${extras ? ' с доп. услугами' : ''}: его можно оформить сразу на Kwork.`
      : 'Индивидуальный набор: напишите в Telegram, соберём точное предложение и оформим заказ на Kwork.';
    $('#cuKwork').classList.toggle('primary', !!r.pkg); $('#cuKwork').classList.toggle('ghost', !r.pkg);
    $('#cuTg').classList.toggle('primary', !r.pkg); $('#cuTg').classList.toggle('ghost', !!r.pkg);
    $('#cuKwork').href = kworkHref;
    $('#cuTg').href = TG + '?text=' + encodeURIComponent(message(r));
    $$('.cu-row', root).forEach(el => {
      const id = el.dataset.id, v = id === 'blocks' ? state.packs : state.qty[id];
      const max = id === 'blocks' ? CFG.pack.max : 1;
      $('output', el).textContent = id === 'blocks' ? CFG.base.blocks + state.packs * CFG.pack.size : v;
      el.classList.toggle('on', v > 0);
      el.querySelector('[data-d="-1"]').disabled = v <= 0;
      el.querySelector('[data-d="1"]').disabled = v >= max;
    });
    $$('.cu-style', root).forEach(b => { const on = b.textContent === state.style; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    syncSticky();
  }

  root.addEventListener('click', e => {
    const step = e.target.closest('[data-d]'), st = e.target.closest('.cu-style'), pr = e.target.closest('[data-preset]');
    if (step) {
      const id = step.closest('.cu-row').dataset.id, d = +step.dataset.d;
      if (id === 'blocks') state.packs = Math.max(0, Math.min(CFG.pack.max, state.packs + d));
      else state.qty[id] = Math.max(0, Math.min(1, state.qty[id] + d));
    } else if (st) state.style = st.textContent;
    else if (pr) {
      const want = pr.dataset.preset === 'econ' ? [] : pr.dataset.preset === 'std' ? GROUPS.std : GROUPS.std.concat(GROUPS.biz);
      [...GROUPS.std, ...GROUPS.biz].forEach(id => state.qty[id] = want.includes(id) ? 1 : 0);
    } else return;
    render();
  });
  $('#cuWish').addEventListener('input', () => { $('#cuTg').href = TG + '?text=' + encodeURIComponent(message(calc())); });
  // best effort: put the order text on the clipboard when the client goes to Telegram / Kwork
  const copy = () => {
    const text = message(calc()), note = $('#cuCopied');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => { note.hidden = false; setTimeout(() => note.hidden = true, 6000); }, () => {});
  };
  $('#cuTg').addEventListener('click', copy); $('#cuKwork').addEventListener('click', copy);

  // phones: while the calculator is on screen the bottom button shows the live total and jumps to the summary
  const sticky = $('#sticky');
  const stickyOrig = { text: sticky.textContent, href: sticky.getAttribute('href'), target: sticky.getAttribute('target') };
  let inView = false;
  function syncSticky() {
    if (inView) { sticky.textContent = `Итого ${fmt(calc().total)} · к оформлению ↓`; sticky.setAttribute('href', '#cuSum'); sticky.removeAttribute('target'); }
    else { sticky.textContent = stickyOrig.text; sticky.setAttribute('href', stickyOrig.href); if (stickyOrig.target) sticky.setAttribute('target', stickyOrig.target); }
  }
  new IntersectionObserver(e => { inView = e[0].isIntersecting && matchMedia('(max-width:900px)').matches; syncSticky(); }, { threshold: .05 }).observe($('.cu-form', root));
  render();
})();

/* ---------- pause the CSS animations of everything that is off screen ---------- */
const offObs = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('off', !e.isIntersecting)), { rootMargin: '120px' });
$$('section, .marquee').forEach(el => offObs.observe(el));
