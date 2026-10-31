const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const touch = matchMedia('(hover:none)').matches;
const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
const mouse = { x: innerWidth * .6, y: innerHeight * .45, moved: false };
addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; });

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

  $('#wkCount').dataset.count = $('#wkCount').textContent = list.length; // the real number even before the count-up runs
  if ($('#hwCount')) $('#hwCount').textContent = list.length; // the portfolio link in the hero
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
      <i class="wk-go" aria-hidden="true"><svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg></i>
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
      : `${w.posters[0] ? `<img src="${esc(w.posters[0])}" alt="">` : art(w, i)}` + (w.time || !w.site // a work with no video at all leads to its live site
        ? `<a class="wv-tg btn primary" href="${esc(w.post)}" target="_blank" rel="noopener">${play}<span>Смотреть видео в Telegram</span></a>`
        : `<a class="wv-tg btn primary" href="${esc(w.site)}" target="_blank" rel="noopener"><span>Открыть сайт</span></a>`);
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

/* ---------- reveal ---------- */
const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in');
  $$('[data-count]', e.target).forEach(countUp);
  if (e.target.classList.contains('split-on')) setTimeout(() => e.target.classList.add('done'), 1100 + $$('.wi', e.target).length * 65);
  io.unobserve(e.target);
}), { threshold: .18 });
$$('.reveal').forEach(el => io.observe(el));

/* ---------- scroll effects ---------- */
const bar = $('#progress'), nav = $('#nav'), sticky = $('#sticky');
const contactsEl = document.getElementById('contacts');
let lastY = scrollY, ticking = false;
function update() {
  ticking = false;
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  nav.classList.toggle('hide', scrollY > lastY && scrollY > 200);
  sticky.classList.toggle('show', scrollY > innerHeight * .8 && contactsEl.getBoundingClientRect().top > innerHeight * .35);
  lastY = scrollY;
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
  // an option is either in or out, so it is a switch, not a − / + stepper
  const tog = (id, label, desc, price) => `<button type="button" class="cu-row cu-tog" data-id="${id}" aria-pressed="false">
    <span class="cu-info"><b>${label}</b><span>${desc}</span></span><em class="cu-price">${price}</em><i class="cu-check" aria-hidden="true"></i></button>`;
  for (const g of ['std', 'biz', 'extra']) {
    $('#cu' + g[0].toUpperCase() + g.slice(1)).innerHTML = CFG.options.filter(o => o.group === g)
      .map(o => tog(o.id, o.label, o.desc, o.ask ? 'по договорённости' : '+' + fmt(o.price))).join('');
  }
  // the calculator stays folded until the client asks for it: the three packages come first
  const openBtn = $('#cuOpen'), grid = $('#cuGrid');
  openBtn.addEventListener('click', () => {
    const open = grid.hidden;
    grid.hidden = !open;
    openBtn.setAttribute('aria-expanded', open);
    const label = $('[data-t]', openBtn) || $('span', openBtn); // the label is wrapped for the hover roll
    label.textContent = label.dataset.t = open ? 'Свернуть' : 'Собрать свой вариант';
  });
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
    $$('.cu-tog', root).forEach(el => { const on = state.qty[el.dataset.id] > 0; el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); });
    $$('.cu-row:not(.cu-tog)', root).forEach(el => {
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
    const step = e.target.closest('[data-d]'), st = e.target.closest('.cu-style'), pr = e.target.closest('[data-preset]'), tg = e.target.closest('.cu-tog');
    if (tg) state.qty[tg.dataset.id] = state.qty[tg.dataset.id] ? 0 : 1;
    else if (step) {
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
  const stickyOrig = { text: sticky.innerHTML, href: sticky.getAttribute('href'), target: sticky.getAttribute('target') };
  let inView = false;
  function syncSticky() {
    if (inView) { sticky.innerHTML = `Итого ${fmt(calc().total)} · к оформлению <svg class="ic" viewBox="0 0 24 24" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d="M12 5v14M6 13l6 6 6-6"/></svg>`; sticky.setAttribute('href', '#cuSum'); sticky.removeAttribute('target'); }
    else { sticky.innerHTML = stickyOrig.text; sticky.setAttribute('href', stickyOrig.href); if (stickyOrig.target) sticky.setAttribute('target', stickyOrig.target); }
  }
  new IntersectionObserver(e => { inView = e[0].isIntersecting && matchMedia('(max-width:900px)').matches; syncSticky(); }, { threshold: .05 }).observe($('.cu-form', root));
  render();
})();

/* ---------- pause the CSS animations of everything that is off screen ---------- */
const offObs = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle('off', !e.isIntersecting)), { rootMargin: '120px' });
$$('section, .marquee').forEach(el => offObs.observe(el));
