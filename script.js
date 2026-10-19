const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const touch = matchMedia('(hover:none)').matches;
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
const mouse = { x: innerWidth * .6, y: innerHeight * .45, moved: false };
addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; });

/* ---------- hero: generative flow field (b/w lines, red near cursor) ---------- */
const cv = $('#grid'), ctx = cv.getContext('2d');
const lite = touch || innerWidth < 900;
const dpr = Math.min(devicePixelRatio || 1, lite ? 1.5 : 2);
let W, H, ps = [];
const glow = $('#glow');
let heroVisible = true, sx = innerWidth * .6, sy = innerHeight * .45;
function spawn(p) { p.x = Math.random() * W; p.y = Math.random() * H; p.px = p.x; p.py = p.y; p.life = 80 + Math.random() * 220; return p; }
function resize() {
  const r = cv.getBoundingClientRect();
  W = r.width; H = r.height;
  cv.width = W * dpr; cv.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, W, H);
  ps = Array.from({ length: lite ? Math.min(380, Math.round(W * H / 4200)) : Math.min(1100, Math.round(W * H / 1700)) }, () => spawn({}));
}
let lastW = innerWidth;
addEventListener('resize', () => { if (innerWidth !== lastW) { lastW = innerWidth; resize(); } });
resize();
new IntersectionObserver(e => heroVisible = e[0].isIntersecting).observe($('#hero'));

function field(x, y, t) {
  return Math.sin(x * .0028 + t * .00018) * 2.4 + Math.cos(y * .0035 - t * .00014) * 2.1 + Math.sin((x + y) * .0016 + t * .0001) * 1.6;
}
function frame(t) {
  requestAnimationFrame(frame);
  if (!heroVisible) return;
  const r = cv.getBoundingClientRect();
  const tx = mouse.moved ? mouse.x - r.left : W * .65 + Math.cos(t / 1700) * W * .12;
  const ty = mouse.moved ? mouse.y - r.top : H * .45 + Math.sin(t / 1300) * H * .12;
  sx += (tx - sx) * .1; sy += (ty - sy) * .1;
  glow.style.transform = `translate(${sx}px,${sy}px)`;

  ctx.fillStyle = 'rgba(5,5,5,.1)'; ctx.fillRect(0, 0, W, H);
  ctx.lineWidth = .9;
  const R = 260;
  for (const p of ps) {
    let a = field(p.x, p.y, t);
    const dx = p.x - sx, dy = p.y - sy, dist = Math.hypot(dx, dy), k = Math.max(0, 1 - dist / R);
    if (k > 0) a += (Math.atan2(dy, dx) + 1.9 - a) * k * k * .9;
    p.px = p.x; p.py = p.y;
    p.x += Math.cos(a) * (1 + k * 2.2); p.y += Math.sin(a) * (1 + k * 2.2);
    if (--p.life < 0 || p.x < 0 || p.x > W || p.y < 0 || p.y > H) { spawn(p); continue; }
    ctx.strokeStyle = k > .04 ? `rgba(255,${40 + (1 - k) * 150 | 0},${48 + (1 - k) * 150 | 0},${.35 + k * .65})` : 'rgba(255,255,255,.22)';
    ctx.beginPath(); ctx.moveTo(p.px, p.py); ctx.lineTo(p.x, p.y); ctx.stroke();
  }
}
requestAnimationFrame(frame);

/* ---------- cursor ---------- */
const cur = $('#cursor');
if (!touch) {
  let cx = 0, cy = 0;
  addEventListener('pointermove', () => cur.classList.add('on'), { once: true });
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
