/* Страница «Для агентств»: появление блоков, полоса прокрутки, прячущееся меню, подсветка карточек */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// появление блоков при прокрутке
const io = new IntersectionObserver(es => es.forEach(e => {
  if (!e.isIntersecting) return;
  e.target.classList.add('in');
  io.unobserve(e.target);
}), { threshold: .12 });
$$('.reveal').forEach(el => io.observe(el));

// полоса прогресса и меню
const bar = $('#progress'), nav = $('#nav');
let lastY = scrollY, queued = false;
function update() {
  queued = false;
  const max = document.documentElement.scrollHeight - innerHeight;
  bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
  nav.classList.toggle('hide', scrollY > lastY && scrollY > 200);
  lastY = scrollY;
}
addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(update); } }, { passive: true });
update();

// свет под курсором на карточках
$$('.spot').forEach(c => c.addEventListener('pointermove', e => {
  const r = c.getBoundingClientRect();
  c.style.setProperty('--mx', e.clientX - r.left + 'px');
  c.style.setProperty('--my', e.clientY - r.top + 'px');
}));

// подсветка пункта меню для раздела на экране
(() => {
  const links = $$('.nav nav a');
  const secs = links.map(a => $(a.getAttribute('href')));
  const obs = new IntersectionObserver(() => {
    const mid = innerHeight / 2;
    const i = secs.findIndex(s => s && s.getBoundingClientRect().top < mid && s.getBoundingClientRect().bottom > mid);
    links.forEach((l, k) => l.classList.toggle('on', k === i));
  }, { rootMargin: '-49% 0px -49% 0px' });
  secs.forEach(s => s && obs.observe(s));
})();
