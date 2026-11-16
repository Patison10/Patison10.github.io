/* Режимы сайта: «Клиентам» и «Студиям».
   Переключение: из кнопки расходится цветная заливка, под ней меняется содержимое, затем блоки нового режима выезжают по очереди. */
(() => {
  const root = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;

  const tabs = $$('.mode [data-mode]');
  const thumb = $('.mode-thumb');
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const META = {
    client: { title: 'Максим (Patson) — лендинг, который продаёт', theme: '#050505', word: 'Для клиентов', hint: 'Лендинги · боты · сайты' },
    studio: { title: 'Субподряд для агентств — Максим (Patson)', theme: '#cf1020', word: 'Для студий', hint: 'Субподряд · белый ярлык' }
  };
  const themeMeta = $('meta[name="theme-color"]');
  let mode = root.dataset.mode === 'studio' ? 'studio' : 'client';
  let busy = false;

  /* ---------- плашка под активной вкладкой ---------- */
  function placeThumb(m) {
    const a = tabs.find(t => t.dataset.mode === m);
    if (!a || !thumb) return;
    thumb.style.width = a.offsetWidth + 'px';
    thumb.style.transform = `translateX(${a.offsetLeft}px)`;
  }
  function markTabs(m) {
    tabs.forEach(t => {
      const on = t.dataset.mode === m;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
    });
    placeThumb(m);
  }

  /* ---------- применить режим (под заливкой) ---------- */
  function apply(m) {
    mode = m;
    root.dataset.mode = m;
    markTabs(m);
    document.title = META[m].title;
    if (themeMeta) themeMeta.setAttribute('content', META[m].theme);
    try { localStorage.setItem('mode', m); } catch (e) { /* без хранилища тоже работает */ }
    try { history.replaceState(null, '', m === 'studio' ? '#studios' : location.pathname + location.search); } catch (e) { /* file:// и т.п. */ }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }

  /* ---------- блоки нового режима выезжают по очереди ---------- */
  const io2 = new IntersectionObserver(es => {
    let k = 0;
    es.forEach(e => {
      if (!e.isIntersecting) return;
      const el = e.target;
      el.style.transitionDelay = Math.min(k++ * 85, 520) + 'ms';
      el.classList.add('in');
      io2.unobserve(el);
      setTimeout(() => { el.style.transitionDelay = ''; }, 2200);
    });
  }, { threshold: .12 });

  function prepareReveals(m) {
    const panel = $(m === 'studio' ? '#studio' : '#client');
    if (!panel) return;
    $$('.reveal', panel).forEach(el => {
      if (m === 'client' && !el.classList.contains('in')) return; // ещё не показывались: их откроет script.js
      el.classList.remove('in');
      el.style.transitionDelay = '';
      io2.observe(el);
    });
  }

  /* ---------- сама анимация ---------- */
  async function switchTo(m, origin) {
    if (busy || m === mode) return;
    if (reduce || !('animate' in Element.prototype)) { apply(m); prepareReveals(m); return; }
    busy = true;
    markTabs(m); // плашка уезжает сразу, пока идёт заливка

    const x = origin ? origin.x : innerWidth / 2;
    const y = origin ? origin.y : 40;
    const R = Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))) + 4;

    const wipe = document.createElement('div');
    wipe.className = 'mode-wipe to-' + m;
    wipe.setAttribute('aria-hidden', 'true');
    wipe.innerHTML = '<span><small></small><b></b></span>';
    $('small', wipe).textContent = META[m].hint;
    $('b', wipe).textContent = META[m].word;
    document.body.appendChild(wipe);
    const label = $('span', wipe);

    const grow = wipe.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${R}px at ${x}px ${y}px)`] },
      { duration: 680, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'forwards' });
    label.animate(
      [{ opacity: 0, transform: 'translateY(24px) scale(.96)' }, { opacity: 1, transform: 'none' }],
      { duration: 520, delay: 260, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    await grow.finished;

    apply(m);
    prepareReveals(m);
    await sleep(260); // слово держится на экране

    label.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-18px)' }], { duration: 320, easing: 'ease-in', fill: 'forwards' });
    const out = wipe.animate({ opacity: [1, 0] }, { duration: 560, delay: 120, easing: 'ease', fill: 'forwards' });
    await out.finished;
    wipe.remove();
    busy = false;
  }

  /* ---------- события ---------- */
  tabs.forEach(t => t.addEventListener('click', () => {
    const r = t.getBoundingClientRect();
    switchTo(t.dataset.mode, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }));
  $('.mode')?.addEventListener('keydown', e => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const next = tabs.find(t => t.dataset.mode !== mode);
    next.focus(); next.click(); e.preventDefault();
  });

  // ссылки внутри страницы, которые переключают режим
  document.addEventListener('click', e => {
    const a = e.target.closest('[data-mode-link]');
    if (!a) return;
    e.preventDefault();
    const m = a.dataset.modeLink, goto = a.dataset.goto;
    const r = a.getBoundingClientRect();
    switchTo(m, { x: r.left + r.width / 2, y: r.top + r.height / 2 }).then(() => {
      if (goto) document.querySelector(goto)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  addEventListener('hashchange', () => {
    const m = location.hash === '#studios' ? 'studio' : location.hash === '#clients' ? 'client' : null;
    if (m && m !== mode) switchTo(m);
  });
  addEventListener('resize', () => placeThumb(mode));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeThumb(mode));

  /* ---------- старт ---------- */
  markTabs(mode);
  if (themeMeta) themeMeta.setAttribute('content', META[mode].theme);
  // студийная панель открывается своим наблюдателем (script.js её не трогает)
  $$('#studio .reveal').forEach(el => io2.observe(el));
})();
