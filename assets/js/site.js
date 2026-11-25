// MEDITECH — прототип. Без зависимостей.
(() => {
  'use strict';

  // ---- Аналитика: цели. ID счётчиков задать перед запуском. ----
  const YM_ID = null; // номер счётчика Метрики
  const track = (goal, params) => {
    try {
      if (YM_ID && window.ym) window.ym(YM_ID, 'reachGoal', goal, params);
      if (window.gtag) window.gtag('event', goal, params || {});
    } catch (e) { /* аналитика не должна ломать сайт */ }
  };
  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goal]');
    if (g) track(g.dataset.goal);
  });

  // ---- Отправка заявок ----
  // Куда слать: endpoint на стороне сайта (WordPress REST), который передаёт заявку в CRM и Telegram-бот.
  // В прототипе не задан: заявка выводится в консоль.
  const LEAD_ENDPOINT = window.MEDITECH_LEAD_ENDPOINT || null;

  const utm = (() => {
    const p = new URLSearchParams(location.search); const o = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((k) => { if (p.get(k)) o[k] = p.get(k); });
    try {
      if (Object.keys(o).length) sessionStorage.setItem('mt_utm', JSON.stringify(o));
      return Object.keys(o).length ? o : JSON.parse(sessionStorage.getItem('mt_utm') || '{}');
    } catch (e) { return o; }
  })();

  const phoneOk = (v) => v.replace(/\D/g, '').length >= 9;

  document.querySelectorAll('[data-lead-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = form.querySelector('.lead__err');
      const name = form.elements.name;
      const phone = form.elements.phone;
      let bad = false;
      [name, phone].forEach((f) => { if (!f) return; const ok = f === phone ? phoneOk(f.value) : f.value.trim().length > 1; f.setAttribute('aria-invalid', ok ? 'false' : 'true'); if (!ok) bad = true; });
      const consent = form.elements.consent;
      if (consent && !consent.checked) bad = true;
      if (bad) { err.hidden = false; (name && name.getAttribute('aria-invalid') === 'true' ? name : phone).focus(); return; }
      err.hidden = true;
      form.elements.page.value = location.href;
      const data = Object.fromEntries(new FormData(form).entries());
      const payload = { ...data, title: document.title, utm, sent_at: new Date().toISOString() };
      form.classList.add('is-busy');
      try {
        if (LEAD_ENDPOINT) {
          const res = await fetch(LEAD_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          if (!res.ok) throw new Error(res.status);
        } else {
          console.info('[MEDITECH] заявка (прототип, не отправлена):', payload);
        }
        form.classList.add('is-sent');
        form.querySelector('.lead__ok').hidden = false;
        track(form.dataset.source === 'download_catalog' ? 'download_catalog' : 'lead_' + data.source, { product: data.product || '' });
      } catch (ex) {
        err.textContent = 'Не удалось отправить. Позвоните нам или напишите в мессенджер.';
        err.hidden = false;
      } finally { form.classList.remove('is-busy'); }
    });
  });

  // ---- Карусели: стрелки прокручивают дорожку на ширину видимой части ----
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-scroll]');
    if (!b) return;
    const t = document.getElementById(b.dataset.scroll);
    if (t) t.scrollBy({ left: Number(b.dataset.dir) * t.clientWidth * 0.8, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  });

  // ---- Бренды: два ряда едут в разные стороны по кругу, пауза при наведении ----
  const rows = [...document.querySelectorAll('[data-marquee]')];
  if (rows.length) {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const SPEED = 28; // px в секунду
    const state = rows.map((el) => ({ el, track: el.querySelector('.marquee__track'), dir: Number(el.dataset.marquee), pos: 0, target: null, half: 0 }));
    const measure = () => state.forEach((s) => { s.half = s.track.scrollWidth / 2; if (s.dir > 0 && s.pos === 0) s.pos = -s.half; });
    let paused = false, visible = true, last = performance.now();
    const rail = rows[0].closest('.brands3__rail');
    rail.addEventListener('mouseenter', () => { paused = true; });
    rail.addEventListener('mouseleave', () => { paused = false; });
    rail.addEventListener('focusin', () => { paused = true; });
    rail.addEventListener('focusout', () => { paused = false; });
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(rail);
    rail.classList.add('is-js');
    measure(); window.addEventListener('resize', measure);
    const wrap = (s) => { if (s.half) { while (s.pos <= -s.half) s.pos += s.half; while (s.pos > 0) s.pos -= s.half; } };
    document.querySelectorAll('[data-marquee-step]').forEach((b) => b.addEventListener('click', () => {
      const step = Number(b.dataset.marqueeStep);
      state.forEach((s) => { const card = s.track.querySelector('li').getBoundingClientRect().width + 16; s.target = s.pos - step * card; });
    }));
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      state.forEach((s) => {
        if (s.target !== null) { const d = s.target - s.pos; s.pos += d * Math.min(1, dt * 8); if (Math.abs(d) < 0.5) { s.pos = s.target; s.target = null; } }
        else if (!reduce && !paused && visible) s.pos += s.dir * SPEED * dt;
        if (s.target === null) wrap(s);
        s.track.style.transform = `translate3d(${s.pos}px,0,0)`;
      });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ---- Поиск во всплывающем окне: живые результаты по названию, модели, бренду, разделу ----
  const sm = document.getElementById('search-modal');
  if (sm) {
    const root = sm.dataset.root || './';
    const input = sm.querySelector('#sm-q'), list = sm.querySelector('[data-search-list]'), hint = sm.querySelector('[data-search-hint]');
    const empty = sm.querySelector('[data-search-empty]'), all = sm.querySelector('[data-search-all]');
    let index = null;
    const load = () => index ? Promise.resolve(index) : fetch(root + 'assets/search.json').then((r) => r.json()).then((d) => (index = d.map((x) => ({ ...x, h: (x.n + ' ' + x.b + ' ' + x.c).toLowerCase() }))));
    const esc = (t) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const mark = (t, q) => { const i = t.toLowerCase().indexOf(q); return i < 0 ? esc(t) : esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length)); };
    const render = () => {
      const q = input.value.trim().toLowerCase();
      hint.hidden = !!q; all.hidden = !q; empty.hidden = true; list.innerHTML = '';
      if (!q) return;
      const words = q.split(/\s+/);
      const res = index.filter((x) => words.every((w) => x.h.includes(w))).slice(0, 8);
      all.href = root + 'catalog/?q=' + encodeURIComponent(q);
      empty.hidden = res.length > 0;
      list.innerHTML = res.map((x) => `<li><a href="${root}${x.u}">${x.i ? `<img src="${root}${x.i}" alt="" width="56" height="56" loading="lazy">` : '<span class="ph"></span>'}<span><strong>${mark(x.n, words[0])}</strong><small>${esc([x.b, x.c].filter(Boolean).join(', '))}</small></span></a></li>`).join('');
    };
    const open = () => { if (typeof sm.showModal !== 'function') { location.href = root + 'catalog/#q'; return; } sm.showModal(); input.focus(); load().then(render); track('open_search'); };
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-search-open]')) { e.preventDefault(); open(); }
      if (e.target.closest('[data-search-close]')) sm.close();
      const chip = e.target.closest('[data-search-q]'); if (chip) { input.value = chip.dataset.searchQ; load().then(render); input.focus(); }
    });
    document.addEventListener('keydown', (e) => { if ((e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) { e.preventDefault(); open(); } });
    input.addEventListener('input', () => load().then(render));
    sm.addEventListener('click', (e) => { if (e.target === sm) sm.close(); });
    sm.querySelector('form').addEventListener('submit', () => track('catalog_search'));
  }

  // ---- Плавное появление блоков при прокрутке (GSAP + ScrollTrigger) ----
  const html = document.documentElement;
  const startReveal = () => {
    if (!html.classList.contains('reveal-on') || !window.gsap || !window.ScrollTrigger) { html.classList.remove('reveal-on'); return; }
    const { gsap, ScrollTrigger } = window;
    gsap.registerPlugin(ScrollTrigger);
    gsap.defaults({ ease: 'power3.out', duration: 0.8 });
    // первый экран: сразу, по очереди
    const heroParts = document.querySelectorAll('.hero3__text > *, .hero3__perks li, .phero__text > *, .phero .crumbs');
    gsap.fromTo(heroParts, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, stagger: 0.08, delay: 0.1 });
    gsap.fromTo('.phero__media img, .hero3__media img, .hero3__media video', { scale: 1.06 }, { scale: 1, duration: 1.6, ease: 'power2.out' });
    // заголовки разделов и крупные блоки
    gsap.utils.toArray('.sec-head3, .brands3__head, .faq4__head, .order__text, .why__in, .flow3__in, .consult3__in, .svc-detail__text, .about-group > div, .product__gallery, .product__info, .tabs, .formcard, .article, .contacts3 .map, .cbrowse .filters').forEach((el) => {
      if (el.closest('.hero3, .phero:not(.phero--compact)')) return;
      gsap.fromTo(el, { autoAlpha: 0, y: 32 }, { autoAlpha: 1, y: 0, scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
    });
    // карточки — пачками, по очереди
    ScrollTrigger.batch('.dir, .pcard3, .ncard3, .pcard, .scard3, .brand-grid li, .ways article, .steps4 li, .svc-points li, .about-cols p, .about-group__list li, .contact-cards li, .why__stats > div, .flow3__steps li, .faq__list details, .brands3__rail', {
      start: 'top 92%', once: true,
      onEnter: (els) => gsap.fromTo(els, { autoAlpha: 0, y: 28 }, { autoAlpha: 1, y: 0, stagger: 0.07, duration: 0.7, overwrite: true }),
    });
    // карточки, которые уже видны при загрузке и не попадут в batch
    ScrollTrigger.refresh();
    html.classList.add('reveal-ready');
  };
  if (window.gsap) startReveal(); else window.addEventListener('load', startReveal);

  // ---- Модальное окно заявки ----
  const modal = document.getElementById('lead-modal');
  const TITLES = { consult: 'Получить консультацию', price: 'Запросить цену / КП', equip: 'Заявка на комплексное оснащение' };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lead]');
    if (!b || !modal) return;
    const kind = b.dataset.lead;
    const form = modal.querySelector('form.lead');
    form.reset(); form.classList.remove('is-sent'); form.querySelector('.lead__ok').hidden = true; form.querySelector('.lead__err').hidden = true;
    form.dataset.source = 'modal_' + kind;
    form.elements.source.value = 'modal_' + kind;
    form.elements.product.value = b.dataset.product || '';
    modal.querySelector('.modal__title').textContent = TITLES[kind] || TITLES.consult;
    const pr = modal.querySelector('.modal__product');
    pr.hidden = !b.dataset.product; pr.textContent = b.dataset.product ? 'Товар: ' + b.dataset.product : '';
    if (typeof modal.showModal === 'function') { modal.showModal(); form.elements.name.focus(); }
    track('open_form_' + kind);
  });
  if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });

  // ---- Маска телефона: только допустимые символы ----
  document.querySelectorAll('input[type="tel"]').forEach((i) => {
    i.addEventListener('focus', () => { if (!i.value) i.value = '+998 '; });
    i.addEventListener('input', () => { i.value = i.value.replace(/[^\d+\s()-]/g, ''); });
  });

  // ---- Мобильное меню ----
  const burger = document.querySelector('.hdr__burger');
  const mnav = document.getElementById('mnav');
  if (burger && mnav) burger.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') === 'true';
    burger.setAttribute('aria-expanded', String(!open)); mnav.hidden = open;
  });

  // ---- Вкладки товара ----
  document.querySelectorAll('[data-tabs]').forEach((t) => {
    const tabs = [...t.querySelectorAll('[role="tab"]')];
    const select = (tab) => tabs.forEach((x) => { const on = x === tab; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; document.getElementById(x.getAttribute('aria-controls')).hidden = !on; });
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', (e) => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) { const n = tabs[(i + d + tabs.length) % tabs.length]; select(n); n.focus(); } });
    });
  });

  // ---- Каталог: поиск и фильтры ----
  document.querySelectorAll('[data-catalog]').forEach((root) => {
    const form = root.querySelector('.filters__form');
    const cards = [...root.querySelectorAll('.pcard')];
    const count = root.querySelector('[data-count]');
    const empty = root.querySelector('[data-empty]');
    const params = new URLSearchParams(location.search);
    if (params.get('q')) form.elements.q.value = params.get('q');
    if (params.get('cat') && form.elements.cat) form.elements.cat.value = params.get('cat');
    params.getAll('brand').forEach((b) => { const c = form.querySelector(`input[name="brand"][value="${CSS.escape(b)}"]`); if (c) c.checked = true; });
    if (params.has('stock')) { const r = form.querySelector(`input[name="stock"][value="${CSS.escape(params.get('stock'))}"]`); if (r) r.checked = true; }

    const apply = () => {
      const q = form.elements.q.value.trim().toLowerCase();
      const cat = form.elements.cat ? form.elements.cat.value : '';
      const brandsSel = [...form.querySelectorAll('input[name="brand"]:checked')].map((x) => x.value);
      const stock = (form.querySelector('input[name="stock"]:checked') || {}).value || '';
      let n = 0;
      cards.forEach((c) => {
        const ok = (!q || c.dataset.name.includes(q)) && (!cat || c.dataset.cat === cat) && (!brandsSel.length || brandsSel.includes(c.dataset.brand)) && (stock === '' || c.dataset.stock === stock);
        c.hidden = !ok; if (ok) n++;
      });
      count.textContent = n; empty.hidden = n > 0;
      if (window.ScrollTrigger) requestAnimationFrame(() => window.ScrollTrigger.refresh());
      const u = new URLSearchParams();
      if (q) u.set('q', q); if (cat) u.set('cat', cat); brandsSel.forEach((b) => u.append('brand', b)); if (stock !== '') u.set('stock', stock);
      history.replaceState(null, '', u.toString() ? '?' + u : location.pathname);
    };
    form.addEventListener('input', apply);
    form.addEventListener('submit', (e) => { e.preventDefault(); apply(); track('catalog_search'); });
    form.addEventListener('reset', () => setTimeout(apply));
    apply();
    if (location.hash === '#q') form.elements.q.focus();
  });

  // ---- Видео первого экрана: не крутить при reduced motion ----
  const v = document.querySelector('.hero__video');
  if (v) {
    const rm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => { if (rm.matches) { v.pause(); v.removeAttribute('autoplay'); } };
    sync(); rm.addEventListener('change', sync);
    v.addEventListener('error', () => v.remove(), true);
  }
})();
