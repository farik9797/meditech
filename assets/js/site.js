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
