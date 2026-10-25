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
// Kept cheap on purpose: the canvas covers only the band under the word, the dots are drawn on the GPU (WebGL points,
// one draw call) with a Canvas 2D fallback, the pointer is handled once per frame, and nothing runs unless the pointer
// is near the word or dots are still moving. The band is always repainted as a whole (partial repaints left seams).
let cv = $('#grid'), ctx = null, gl = null, glLost = false;
const hero = $('#hero');
const lite = touch || innerWidth < 900;
const HW = {
  word: 'patson', face: '"Geologica","Helvetica Neue",Arial,sans-serif', weight: 900,
  gap: lite ? 3 : 6, radius: lite ? 50 : 90, crop: lite ? .12 : .08, margin: lite ? 40 : 70, fill: lite ? .94 : .9,
  ink: [196, 196, 196], warm: [255, 31, 45]
};
const LK = 9; // warmth levels (Canvas 2D fallback)
let W = 0, H = 0, heroH = 0, dpr = 1, rmax = 0, warmCols = [], dots = new Float32Array(0), vbo = new Float32Array(0), count = 0;
let px = -1e5, py = -1e5, lastMove = 0, ring = { x: 0, y: 0, t: -1 };
let raf = 0, visible = true, awake = true, cost = 0, skip = false, tick = 0;

// ---- GPU renderer: every dot is one point; the fragment shader draws the anti-aliased disc ----
const VS = `attribute vec2 a_pos; attribute float a_rad; attribute float a_k;
uniform vec2 u_res; uniform float u_dpr; varying float v_k; varying float v_r; varying float v_s;
void main() {
  gl_Position = vec4(a_pos.x / u_res.x * 2.0 - 1.0, 1.0 - a_pos.y / u_res.y * 2.0, 0.0, 1.0);
  float s = (a_rad * 2.0 + 2.0) * u_dpr;
  gl_PointSize = s; v_s = s; v_r = a_rad * u_dpr; v_k = a_k;
}`;
const FS = `precision mediump float; uniform vec3 u_ink; uniform vec3 u_warm; varying float v_k; varying float v_r; varying float v_s;
void main() {
  float d = length(gl_PointCoord - vec2(0.5)) * v_s;
  float a = clamp(v_r - d + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(mix(u_ink, u_warm, v_k) * a, a);
}`;
let glu = null;
function initGL() {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
  const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return false;
  const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  [['a_pos', 2, 0], ['a_rad', 1, 8], ['a_k', 1, 12]].forEach(([n, size, off]) => {
    const l = gl.getAttribLocation(prog, n); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 16, off);
  });
  glu = { res: gl.getUniformLocation(prog, 'u_res'), dpr: gl.getUniformLocation(prog, 'u_dpr') };
  gl.uniform3f(gl.getUniformLocation(prog, 'u_ink'), HW.ink[0] / 255, HW.ink[1] / 255, HW.ink[2] / 255);
  gl.uniform3f(gl.getUniformLocation(prog, 'u_warm'), HW.warm[0] / 255, HW.warm[1] / 255, HW.warm[2] / 255);
  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0, 0, 0, 0);
  return true;
}
function useCanvas2D() { // WebGL missing or broken: a canvas can never switch context type, so use a fresh one
  if (gl) { const fresh = cv.cloneNode(false); cv.replaceWith(fresh); cv = fresh; gl = null; }
  ctx = cv.getContext('2d');
}
if (!/[?&]gl=0\b/.test(location.search)) {
  gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
  if (gl && !initGL()) useCanvas2D();
  if (gl) {
    cv.addEventListener('webglcontextlost', e => { e.preventDefault(); glLost = true; });
    cv.addEventListener('webglcontextrestored', () => { glLost = false; if (initGL()) { layout(); draw(performance.now()); } });
  }
}
if (!gl) useCanvas2D();

function layout() {
  const m = document.createElement('canvas').getContext('2d');
  W = Math.max(1, Math.round(hero.getBoundingClientRect().width));
  m.font = `${HW.weight} 100px ${HW.face}`;
  const probe = m.measureText(HW.word), measured = probe.width;
  const capRatio = (probe.actualBoundingBoxAscent || 72) / 100; // letter height per 1px of font size
  // The word fills most of the width, but it never gets taller than the room under the hero copy (on desktop about a fifth
  // of the screen height) and it is only cropped a little: it has to stay readable, not just be a texture.
  let size = measured > 0 ? W * HW.fill / measured * 100 : 100;
  if (!lite) size = Math.min(size, Math.max(120, Math.min(220, innerHeight * .19)) / ((1 - HW.crop) * capRatio));
  m.font = `${HW.weight} ${size}px ${HW.face}`;
  const box = m.measureText(HW.word);
  const cap = capRatio * size;

  // the hero grows to leave room for the visible part of the word under the text; the canvas is only that band + a margin
  const wordH = Math.round(cap * (1 - HW.crop));
  hero.style.setProperty('--word-h', wordH + 'px');
  heroH = Math.round(hero.getBoundingClientRect().height);
  H = wordH + HW.margin;
  cv.style.height = H + 'px';
  dpr = Math.min(devicePixelRatio || 1, lite ? 1.5 : 2);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);

  const mask = document.createElement('canvas'); mask.width = W; mask.height = H;
  const mc = mask.getContext('2d', { willReadFrequently: true });
  mc.font = `${HW.weight} ${size}px ${HW.face}`; mc.fillStyle = '#000'; mc.textBaseline = 'alphabetic';
  mc.fillText(HW.word, (W - box.width) / 2, H + cap * HW.crop);
  const img = mc.getImageData(0, 0, W, H).data;

  const gap = HW.gap, cols = Math.ceil(W / gap), rows = Math.ceil(H / gap), tmp = [];
  rmax = gap * .56;
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      let sum = 0; // coverage: average alpha over a 3x3 sample of the cell
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
        const x = Math.min(W - 1, Math.floor(gx * gap + (sx + .5) * gap / 3));
        const y = Math.min(H - 1, Math.floor(gy * gap + (sy + .5) * gap / 3));
        sum += img[(y * W + x) * 4 + 3];
      }
      const cov = sum / (9 * 255);
      if (cov < .06) continue;
      const hx = gx * gap + gap / 2, hy = gy * gap + gap / 2;
      tmp.push(hx, hy, 0, 0, hx, hy, Math.sqrt(cov) * rmax); // x y vx vy homeX homeY radius
    }
  }
  dots = new Float32Array(tmp); count = tmp.length / 7;

  if (gl) { // vertex buffer: x y radius warmth per dot
    vbo = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) vbo[i * 4 + 2] = dots[i * 7 + 6];
    gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform2f(glu.res, W, H); gl.uniform1f(glu.dpr, dpr);
    gl.bufferData(gl.ARRAY_BUFFER, vbo, gl.DYNAMIC_DRAW);
  } else { // one colour per warmth level (ink -> red); dots of the same level are filled together in a single path
    warmCols = Array.from({ length: LK }, (_, k) => {
      const t = k / (LK - 1);
      return `rgb(${HW.ink.map((v, i) => Math.round(v + (HW.warm[i] - v) * t)).join(',')})`;
    });
  }
  awake = true;
}

function paint() {
  if (gl) {
    if (glLost) return;
    for (let i = 0; i < count; i++) {
      const j = i * 7, o = i * 4, x = dots[j], y = dots[j + 1], ox = x - dots[j + 4], oy = y - dots[j + 5];
      vbo[o] = x; vbo[o + 1] = y; vbo[o + 3] = ox || oy ? Math.min(1, Math.sqrt(ox * ox + oy * oy) / 28) : 0; // warmth: 0 at home
    }
    gl.clear(gl.COLOR_BUFFER_BIT); gl.bufferSubData(gl.ARRAY_BUFFER, 0, vbo); gl.drawArrays(gl.POINTS, 0, count);
    return;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const paths = [];
  for (let i = 0; i < count; i++) {
    const j = i * 7, x = dots[j], y = dots[j + 1], rad = dots[j + 6], ox = x - dots[j + 4], oy = y - dots[j + 5];
    const k = ox || oy ? Math.min(LK - 1, Math.round(Math.sqrt(ox * ox + oy * oy) / 28 * (LK - 1))) : 0;
    const pth = paths[k] || (paths[k] = new Path2D());
    pth.moveTo(x + rad, y); pth.arc(x, y, rad, 0, 6.2832);
  }
  for (let k = 0; k < LK; k++) if (paths[k]) { ctx.fillStyle = warmCols[k]; ctx.fill(paths[k]); }
}

function draw(now) {
  const t0 = performance.now();
  const r = reduce ? 0 : HW.radius, r2 = r * r;
  const age = ring.t < 0 ? 1e9 : now - ring.t, ringR = age * .9, ringOn = age < 900;
  const pointer = px > -1e4;
  let moving = false;
  if (!reduce) {
    for (let i = 0; i < count; i++) {
      const j = i * 7;
      let x = dots[j], y = dots[j + 1], vx = dots[j + 2], vy = dots[j + 3];
      const hx = dots[j + 4], hy = dots[j + 5];
      const ddx = x - px, ddy = y - py, d2 = ddx * ddx + ddy * ddy;
      const resting = vx === 0 && vy === 0 && x === hx && y === hy;
      // a resting dot far from the pointer and from a shock ring needs no work at all
      if (resting && !ringOn && !(pointer && d2 < r2)) continue;
      if (ringOn) { // shock ring from a click
        const dx = hx - ring.x, dy = hy - ring.y, d = Math.sqrt(dx * dx + dy * dy) + .001;
        const band = 1 - Math.min(1, Math.abs(d - ringR) / 26);
        if (band > 0) { const f = band * 3.2 * (1 - age / 900); vx += dx / d * f; vy += dy / d * f; }
      }
      if (pointer && d2 < r2) { // push away from the pointer
        const d = Math.sqrt(d2) + .001, f = (1 - d / r) * 2.6;
        vx += ddx / d * f; vy += ddy / d * f;
      }
      vx = (vx + (hx - x) * .05) * .84; vy = (vy + (hy - y) * .05) * .84; // spring back home
      x += vx; y += vy;
      if (Math.abs(vx) + Math.abs(vy) > .02 || Math.abs(x - hx) + Math.abs(y - hy) > .05) moving = true;
      else { x = hx; y = hy; vx = 0; vy = 0; }
      dots[j] = x; dots[j + 1] = y; dots[j + 2] = vx; dots[j + 3] = vy;
    }
  }
  paint();
  cost += (performance.now() - t0 - cost) * .1; // moving average of the work per frame
  skip = lite ? cost > 5 : cost > 7;
  awake = !reduce && (moving || ringOn || (pointer && now - lastMove < 500)); // sleep once everything is home and nothing pushes
}
function loop(now) {
  raf = 0; if (!visible) return;
  if (skip && (++tick & 1)) { raf = requestAnimationFrame(loop); return; } // slow machine: halve the rate
  draw(now); if (awake) raf = requestAnimationFrame(loop);
}
function wake() { awake = true; if (!raf && visible) raf = requestAnimationFrame(loop); }

// Only the pointer near the word counts; everywhere else in the hero the word does not even wake up.
// The pointer is read once per frame (not on every event) so no layout is forced by a burst of events.
const local = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
const near = p => p[0] > -HW.radius && p[0] < W + HW.radius && p[1] > -HW.radius && p[1] < H + HW.radius;
const away = () => { if (px > -1e4) { px = py = -1e5; wake(); } };
let pendingMove = null, pumpRaf = 0;
function applyPointer() {
  pumpRaf = 0; const e = pendingMove; pendingMove = null;
  if (!e) return;
  const p = local(e);
  if (near(p)) { px = p[0]; py = p[1]; lastMove = performance.now(); wake(); } else away();
}
hero.addEventListener('pointermove', e => {
  if (e.pointerType === 'touch') return;
  pendingMove = e; if (!pumpRaf) pumpRaf = requestAnimationFrame(applyPointer);
});
hero.addEventListener('pointerleave', () => { pendingMove = null; away(); });
hero.addEventListener('pointerdown', e => {
  if (reduce || e.target.closest('a,button')) return;
  const p = local(e);
  if (near(p)) { ring = { x: p[0], y: p[1], t: performance.now() }; wake(); }
});
new IntersectionObserver(e => { visible = e[0].isIntersecting; if (visible && awake) wake(); }).observe(hero);

// re-lay out only when the hero's size really changes (fonts landing, text reflow, window resize)
let pending = 0;
new ResizeObserver(() => {
  if (pending) return;
  pending = requestAnimationFrame(() => {
    pending = 0;
    const b = hero.getBoundingClientRect();
    if (Math.round(b.width) !== W || Math.round(b.height) !== heroH) { layout(); draw(performance.now()); }
  });
}).observe(hero);

layout(); draw(performance.now());
// the word is set in the real face once it has loaded
if (document.fonts && document.fonts.load) document.fonts.load(`${HW.weight} 100px Geologica`, HW.word).then(() => { layout(); draw(performance.now()); });

/* ---------- hero: ASCII reaction front (live Gray-Scott reaction-diffusion) ---------- */
// The simulation grid IS the glyph grid: every character is one cell of a real chemical solver. Luminance is not the
// concentration; each cell is inked by the gradient of V and only the RIDGE of that gradient survives (non-maximum
// suppression), so every reaction front collapses to a thin crawling line instead of a wash. It runs on its own and
// does not react to the pointer.
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
  const GRAY = '#cfcfcf', RED = '#ff1f2d';

  let cellW = CELL, cellH = CELL, cols = 0, rows = 0, dpr = 1, sized = false;
  let U, V, Un, Vn, lf, rt, up, dn, charBuf, gradBuf;
  let wx = W_ORTHO / 4, wy = W_ORTHO / 4;
  const buckets = Array.from({ length: BUCKETS }, () => []);
  let warmLeft = 0, raf = 0, visible = true, lastW = 0, lastH = 0, timer = 0, tick = 0, cost = 0, skip = lite;
  let lastT = 0, dAvg = 16, nFrames = 0, tier = 0, best = 1000, grace = 120; // frame governor
  let inkCells = 0, deadFrames = 0, nextDrop = 0; // keeps the reaction alive: on a small grid it can die out

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

  function drop() {
    const cx = Math.floor(Math.random() * cols), cy = Math.floor(Math.random() * rows);
    for (let dy = -SEED_R; dy <= SEED_R; dy++) for (let dx = -SEED_R; dx <= SEED_R; dx++) {
      if (dx * dx + dy * dy > SEED_R * SEED_R) continue;
      const i = wrap(cy + dy, rows) * cols + wrap(cx + dx, cols);
      V[i] = .5; U[i] = .25;
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
    inkCells = 0; for (let b = 0; b < BUCKETS; b++) inkCells += buckets[b].length;
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
    tier = Math.min(tier, 1); nFrames = 0; dAvg = 16; grace = 120;
    // warm-up, so the first paint is not a blank grid; spread over a few frames to avoid one long freeze
    if (reduce) { for (let s = 0; s < WARM + REDUCED_EXTRA; s++) step(); draw(); warmLeft = 0; } else warmLeft = WARM;
  }

  function loop(now) {
    raf = 0;
    if (!visible || document.hidden) { lastT = 0; return; }
    // governor: average real frame time of the page; too slow for a while -> half rate, still too slow -> freeze this layer
    // It starts judging only once the layer has settled (warm-up and font loading make a few long frames), compares with the
    // best frame time this screen has shown (a 30 Hz or power-saving display is not "slow"), and never freezes on a blip.
    if (lastT && warmLeft === 0) {
      const dt = Math.min(now - lastT, 100);
      if (grace > 0) grace--;
      else {
        if (dt >= 4 && dt < best) best = dt;
        dAvg += (dt - dAvg) * .05;
        const base = Math.max(16, best);
        if (++nFrames > 90 && tier < 2 && dAvg > Math.max(tier ? 36 : 26, base * (tier ? 2.2 : 1.6))) {
          tier++; nFrames = 0; dAvg = base;
          if (tier === 2) return; // freeze: the last picture stays on screen, nothing is computed any more
        }
      }
    }
    lastT = now;
    if (skip && (++tick & 1)) { raf = requestAnimationFrame(loop); return; } // phones: 30 fps; slow PCs: halve the rate
    if (sized) {
      if (warmLeft > 0) {
        const n = Math.min(warmLeft, 130);
        for (let s = 0; s < n; s++) step();
        warmLeft -= n;
        if (warmLeft > 0) { raf = requestAnimationFrame(loop); return; }
      }
      const t0 = performance.now();
      for (let s = 0; s < SUB; s++) step();
      draw();
      cost += (performance.now() - t0 - cost) * .1; // moving average of the work per frame
      skip = lite || tier > 0 || cost > 9;
      if (inkCells < 8) { if (++deadFrames > 20) { drop(); drop(); deadFrames = 0; } } else deadFrames = 0; // died out: new drops
      if (now > nextDrop) { nextDrop = now + 6000 + Math.random() * 5000; if (cols * rows < 6000) drop(); } // small grids: a heartbeat
    }
    raf = requestAnimationFrame(loop);
  }
  const wake = () => { if (!raf && !reduce && visible && !document.hidden && tier < 2) raf = requestAnimationFrame(loop); };

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

/* ---------- portfolio: works from the Telegram channel (data in works.js) ---------- */
// Cards are built from window.WORKS. A work with a video file shows its poster and plays a muted preview on hover; on
// phones nothing plays by itself (no mobile data spent), the video loads only in the viewer. A work may have several
// clips (video: [...]): the viewer gets clip tabs and goes on to the next clip when one ends. Without a video the card
// shows a typographic cover and the viewer leads to the post in the channel. The viewer opens out of the card
// (clip-path from the card's rectangle), Esc / ← → / swipe work.
(() => {
  const grid = $('#wkGrid'), list = (window.WORKS || []).filter(w => w && w.title);
  if (!grid) return;
  const TG = 'https://t.me/Patisonooochik';
  const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = i => String(i + 1).padStart(2, '0');
  const play = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>';
  const art = (w, i) => `<span class="wk-art"><i>${num(i)}</i><b>${esc(w.title)}</b><span>${w.clips.length ? 'видео' : 'видео в Telegram'} · ${esc(w.time || '')}</span></span>`;
  list.forEach(w => { w.clips = [].concat(w.video || []).filter(Boolean); w.posters = [].concat(w.poster || []).filter(Boolean); });

  $('#wkCount').dataset.count = list.length;
  grid.innerHTML = list.map((w, i) => `
    <button type="button" class="wk reveal spot" data-i="${i}" data-kind="${esc(w.kind)}" style="--d:${(i % 3) * .09}s">
      <span class="wk-media${w.tall ? ' tall' : ''}">
        ${w.posters[0] ? `<img src="${esc(w.posters[0])}" alt="" loading="lazy" decoding="async">` : ''}
        ${w.clips[0] && !touch ? `<video muted loop playsinline preload="none" data-src="${esc(w.clips[0])}"></video>` : ''}
        ${w.clips.length || w.posters.length ? '' : art(w, i)}
        ${w.clips.length > 1 ? `<span class="wk-n">${w.clips.length} ${w.clips.length < 5 ? 'ролика' : 'роликов'}</span>` : ''}
        <span class="wk-play" aria-hidden="true">${play}<span>Смотреть</span></span>
      </span>
      <span class="wk-meta">
        <small>${num(i)} · ${esc(w.kind)}${w.time ? ' · ' + esc(w.time) : ''}</small>
        <strong>${esc(w.title)}</strong>
        <span class="wk-tags">${(w.tags || []).map(t => `<em>${esc(t)}</em>`).join('')}</span>
      </span>
      <i class="wk-go" aria-hidden="true">↗</i>
    </button>`).join('');
  const cards = $$('.wk', grid);

  // filters: «Все» + every kind that exists; the first visible card is the wide one
  const kinds = [...new Set(list.map(w => w.kind).filter(Boolean))];
  const fl = $('#wkFilters');
  if (kinds.length > 1) {
    fl.innerHTML = ['Все', ...kinds].map((k, i) => `<button type="button" role="tab" aria-selected="${!i}" data-k="${i ? esc(k) : ''}">${esc(k)}<sup>${i ? list.filter(w => w.kind === k).length : list.length}</sup></button>`).join('');
    fl.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $$('button', fl).forEach(x => x.setAttribute('aria-selected', x === b));
      const k = b.dataset.k;
      grid.classList.add('swap');
      setTimeout(() => {
        cards.forEach(c => { c.hidden = !!k && c.dataset.kind !== k; c.classList.add('in'); });
        layoutWide(); grid.classList.remove('swap');
      }, reduce ? 0 : 260);
    });
  } else fl.remove();
  const layoutWide = () => { let first = true; cards.forEach(c => { c.classList.toggle('wide', !c.hidden && first); if (!c.hidden) first = false; }); };
  layoutWide();

  // hover previews (mouse only): the poster is an <img>; the video file is attached when the card comes near the
  // screen (only its index is read), it plays while the pointer is over the card and fades in over the poster
  const vids = cards.map(c => $('video', c));
  const near = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const v = $('video', e.target); near.unobserve(e.target);
    if (v && !v.src) { v.preload = 'metadata'; v.src = v.dataset.src; }
  }), { rootMargin: '300px' });
  cards.forEach((c, i) => vids[i] && near.observe(c));
  const start = v => { if (v && !reduce) { if (!v.src) v.src = v.dataset.src; const p = v.play(); if (p) p.catch(() => {}); } };
  const stop = v => { if (v && !v.paused) v.pause(); };
  vids.forEach(v => v && v.addEventListener('playing', () => v.classList.add('on')));
  cards.forEach((c, i) => {
    if (!vids[i]) return;
    c.addEventListener('pointerenter', () => start(vids[i]));
    c.addEventListener('pointerleave', () => { stop(vids[i]); vids[i].classList.remove('on'); });
  });

  // the «Смотреть» label follows the pointer inside the card, the card tilts a little toward it
  if (!touch && !reduce) cards.forEach(c => {
    const lab = $('.wk-play', c), media = $('.wk-media', c);
    let q = 0, px = 0, py = 0;
    const apply = () => {
      q = 0;
      const r = media.getBoundingClientRect(), x = px - r.left, y = py - r.top;
      lab.style.transform = `translate(${x.toFixed(0)}px,${y.toFixed(0)}px)`;
      const cr = c.getBoundingClientRect();
      c.style.setProperty('--rx', ((py - cr.top) / cr.height - .5) * -4 + 'deg');
      c.style.setProperty('--ry', ((px - cr.left) / cr.width - .5) * 5 + 'deg');
    };
    c.addEventListener('pointermove', e => { px = e.clientX; py = e.clientY; if (!q) q = requestAnimationFrame(apply); });
    c.addEventListener('pointerleave', () => { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); });
  });

  // ---- viewer ----
  const view = $('#wkView'), box = $('#wvBox'), media = $('#wvMedia');
  let cur = -1, from = null, lastFocus = null;
  const visible = () => cards.filter(c => !c.hidden).map(c => +c.dataset.i);
  function fill(i) {
    const w = list[i]; cur = i;
    media.innerHTML = w.clips.length
      ? `<video controls autoplay playsinline preload="auto"></video>${w.clips.length > 1 ? `<div class="wv-clips" role="tablist" aria-label="Ролики">${w.clips.map((_, k) => `<button type="button" role="tab" data-k="${k}">${esc((w.parts || [])[k] || 'Ролик ' + (k + 1))}</button>`).join('')}</div>` : ''}`
      : `${w.posters[0] ? `<img src="${esc(w.posters[0])}" alt="">` : art(w, i)}<a class="wv-tg btn primary" href="${esc(w.post)}" target="_blank" rel="noopener">${play}<span>Смотреть видео в Telegram</span></a>`;
    if (w.clips.length) clip(0);
    $('#wvKind').textContent = `${num(i)} · ${w.kind || ''}${w.time ? ' · ' + w.time : ''}`;
    $('#wvTitle').textContent = w.title;
    $('#wvText').textContent = w.text || '';
    $('#wvTags').innerHTML = (w.tags || []).map(t => `<em>${esc(t)}</em>`).join('');
    const want = `Здравствуйте, Максим! Хочу сайт как «${w.title}» из вашего портфолио.`;
    $('#wvActs').innerHTML =
      `<a class="btn primary" href="${TG}?text=${encodeURIComponent(want)}" target="_blank" rel="noopener"><span>Хочу такой же</span></a>` +
      (w.site ? `<a class="btn ghost" href="${esc(w.site)}" target="_blank" rel="noopener"><span>Открыть сайт</span></a>` : '') +
      (w.post ? `<a class="btn ghost" href="${esc(w.post)}" target="_blank" rel="noopener"><span>Пост в канале</span></a>` : '');
    const vis = visible();
    $('#wvNum').textContent = `${vis.indexOf(i) + 1} / ${vis.length}`;
  }
  // one of the work's clips into the viewer's player; the next one starts when it ends
  function clip(k) {
    const w = list[cur], v = $('video', media); if (!v) return;
    v.poster = w.posters[k] || w.posters[0] || ''; v.src = w.clips[k]; v.dataset.k = k;
    const p = v.play(); if (p) p.catch(() => {});
    $$('.wv-clips button', media).forEach(b => b.setAttribute('aria-selected', +b.dataset.k === k));
  }
  media.addEventListener('click', e => { const b = e.target.closest('.wv-clips button'); if (b) clip(+b.dataset.k); });
  media.addEventListener('ended', e => { const w = list[cur], k = +e.target.dataset.k; if (w.clips.length > 1) clip((k + 1) % w.clips.length); }, true);

  // clip-path inset that matches a rectangle on the screen, relative to the viewer box
  const insetOf = r => {
    const b = box.getBoundingClientRect(), c = v => Math.max(0, v).toFixed(1) + 'px';
    return `inset(${c(r.top - b.top)} ${c(b.right - r.right)} ${c(b.bottom - r.bottom)} ${c(r.left - b.left)} round 22px)`;
  };
  function open(i, card) {
    lastFocus = document.activeElement; from = card;
    fill(i);
    view.hidden = false; document.documentElement.classList.add('wv-lock');
    if (!reduce) {
      box.style.transition = 'none'; box.style.clipPath = insetOf($('.wk-media', card).getBoundingClientRect());
      box.getBoundingClientRect();
      box.style.transition = ''; box.style.clipPath = 'inset(0 0 0 0 round 22px)';
    }
    requestAnimationFrame(() => view.classList.add('open'));
    $('.wv-x', view).focus({ preventScroll: true });
  }
  function close() {
    if (view.hidden) return;
    const v = $('video', media); if (v) v.pause();
    view.classList.remove('open');
    const card = cards[cur] && !cards[cur].hidden ? cards[cur] : from;
    if (!reduce && card) box.style.clipPath = insetOf($('.wk-media', card).getBoundingClientRect());
    setTimeout(() => { view.hidden = true; media.innerHTML = ''; document.documentElement.classList.remove('wv-lock'); }, reduce ? 0 : 520);
    if (lastFocus) lastFocus.focus({ preventScroll: true });
  }
  const step = d => { const vis = visible(), k = vis.indexOf(cur); if (vis.length > 1) fill(vis[(k + d + vis.length) % vis.length]); };
  grid.addEventListener('click', e => { const c = e.target.closest('.wk'); if (c) open(+c.dataset.i, c); });
  view.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); });
  $('#wvPrev').addEventListener('click', () => step(-1));
  $('#wvNext').addEventListener('click', () => step(1));
  addEventListener('keydown', e => {
    if (view.hidden) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (e.target.closest && e.target.closest('video')) return; // the player seeks with the arrows
      e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1);
    }
    else if (e.key === 'Tab') { // keep the focus inside the viewer
      const f = $$('a,button,video', box).filter(x => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  let sx = 0, sy = 0;
  box.addEventListener('touchstart', e => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  box.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5 && !e.target.closest('video')) step(dx < 0 ? 1 : -1);
  }, { passive: true });
})();

/* ---------- headings: words rise out of a mask ---------- */
function splitWords(el) {
  let n = 0;
  (function walk(node) {
    [...node.childNodes].forEach(ch => {
      if (ch.nodeType === 1) return walk(ch);
      if (ch.nodeType !== 3 || !ch.textContent.trim()) return;
      const frag = document.createDocumentFragment();
      ch.textContent.split(/(\s+)/).forEach(part => {
        if (!part) return;
        if (/^\s+$/.test(part)) return frag.append(' ');
        const w = document.createElement('span'), i = document.createElement('span');
        w.className = 'w'; i.className = 'wi'; i.style.setProperty('--i', n++); i.textContent = part;
        w.append(i); frag.append(w);
      });
      ch.replaceWith(frag);
    });
  })(el);
  el.classList.add('split-on');
}
if (!reduce) $$('.h2.reveal, .big.reveal').forEach(splitWords);

/* ---------- buttons: the label rolls up on hover ---------- */
$$('.btn > span, .nav-cta').forEach(el => {
  if (el.children.length) return;
  const t = el.textContent;
  el.innerHTML = `<span class="roll"><span data-t="${t.replace(/"/g, '&quot;')}">${t}</span></span>`;
});

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
  // delegated, so links and buttons created later (portfolio viewer) count too
  const hot = t => t.closest && t.closest('a,summary,button');
  document.addEventListener('pointerover', e => cur.classList.toggle('big', !!hot(e.target)));
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
  $$('[data-count]', e.target).forEach(countUp);
  if (e.target.classList.contains('split-on')) setTimeout(() => e.target.classList.add('done'), 1100 + $$('.wi', e.target).length * 65);
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

/* ---------- nav: a red pill slides under the link of the section on screen ---------- */
(() => {
  const ind = $('#navInd'), links = $$('.nav nav a');
  if (!ind || !links.length) return;
  const secs = links.map(a => $(a.getAttribute('href'))).filter(Boolean);
  let active = null;
  const set = a => {
    if (a === active) return; active = a;
    links.forEach(l => l.classList.toggle('on', l === a));
    ind.classList.toggle('on', !!a);
    if (a) { ind.style.width = a.offsetWidth + 24 + 'px'; ind.style.transform = `translateX(${a.offsetLeft - 12}px)`; }
  };
  // a thin line across the middle of the screen: whichever section crosses it is the active one
  const obs = new IntersectionObserver(() => {
    const mid = innerHeight / 2, hit = secs.find(s => { const r = s.getBoundingClientRect(); return r.top < mid && r.bottom > mid; });
    set(hit ? links[secs.indexOf(hit)] : null);
  }, { rootMargin: '-49% 0px -49% 0px' });
  secs.forEach(s => obs.observe(s));
})();

/* ---------- hero stage parallax ---------- */
const fls = $$('.fl');
if (!touch && !reduce && fls.length) {
  let nx = 0, ny = 0, queued = 0;
  const apply = () => { queued = 0; fls.forEach(f => { const d = +f.dataset.depth; f.style.translate = `${nx * -d}px ${ny * -d}px`; }); };
  addEventListener('pointermove', e => { nx = e.clientX / innerWidth - .5; ny = e.clientY / innerHeight - .5; if (!queued) queued = requestAnimationFrame(apply); });
}

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
