/* =========================================================
   ВерАнда — frontend
   ========================================================= */

const API_BASE = 'https://veranda-api.energylowlnr.workers.dev';

/* ---------- Утилиты ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const fmtPrice = (n) => new Intl.NumberFormat('ru-RU').format(n) + ' ₽';

function toast(msg, type = 'success', ms = 3200) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast ' + type;
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), ms);
}

async function api(path, { method = 'GET', body, signal } = {}) {
  try {
    const res = await fetch(API_BASE + path, {
      method,
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  } catch (e) {
    if (e.name !== 'AbortError') console.error('[api]', path, e);
    throw e;
  }
}

/* =========================================================
   ТЕМА
   ========================================================= */
(function theme() {
  const root = document.documentElement;
  const btn = $('#theme-toggle');
  const STORAGE_KEY = 'veranda-theme';

  const saved = localStorage.getItem(STORAGE_KEY);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const initial = saved || (prefersDark ? 'dark' : 'light');
  root.setAttribute('data-theme', initial);

  const syncAria = () => {
    if (!btn) return;
    const isDark = root.getAttribute('data-theme') === 'dark';
    btn.setAttribute('aria-label', isDark ? 'Включить светлую тему' : 'Включить тёмную тему');
  };
  syncAria();

  if (btn) {
    btn.addEventListener('click', () => {
      const current = root.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem(STORAGE_KEY, next);
      syncAria();
    });
  }

  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        root.setAttribute('data-theme', e.matches ? 'dark' : 'light');
        syncAria();
      }
    });
  }
})();

/* ---------- Sticky-шапка ---------- */
(function headerScroll() {
  const header = document.getElementById('site-header');
  if (!header) return;
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 40);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
})();

/* ---------- Мобильное меню ---------- */
(function mobileNav() {
  const burger = $('#burger');
  const links  = $('.nav-links');
  if (!burger || !links) return;

  const close = () => {
    burger.classList.remove('active');
    links.classList.remove('open');
    document.body.style.overflow = '';
  };

  burger.addEventListener('click', () => {
    const willOpen = !links.classList.contains('open');
    burger.classList.toggle('active', willOpen);
    links.classList.toggle('open', willOpen);
    document.body.style.overflow = willOpen ? 'hidden' : '';
  });

  links.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') close();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
})();

/* ---------- Плавный скролл ---------- */
$$('[data-scroll]').forEach((b) =>
  b.addEventListener('click', () => {
    const t = document.querySelector(b.dataset.scroll);
    t?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  })
);

/* ---------- Reveal-анимации ---------- */
(function reveal() {
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        io.unobserve(e.target);
      }
    }),
    { threshold: 0.12 }
  );
  $$('.section, .menu-card, .promo-card').forEach((el) => {
    el.classList.add('reveal');
    io.observe(el);
  });
})();

/* =========================================================
   МЕНЮ
   ========================================================= */
const MENU_FALLBACK = [
  { id:1, cat:'cold',    title:'Тартар из говядины',       comp:'Говядина, каперсы, горчица дижонская, желток', weight:'120 г', price:590, img:'' },
  { id:2, cat:'cold',    title:'Карпаччо из томатов',       comp:'Томаты, страчателла, базилик, оливковое масло', weight:'150 г', price:420, img:'' },
  { id:3, cat:'salads',  title:'Салат с уткой',             comp:'Утка, руккола, апельсин, кедровый орех', weight:'180 г', price:620, img:'' },
  { id:4, cat:'salads',  title:'Цезарь с креветками',       comp:'Романо, креветки, пармезан, соус цезарь', weight:'210 г', price:560, img:'' },
  { id:5, cat:'soups',   title:'Том Ям',                     comp:'Креветки, кокосовое молоко, галангал, лемонграсс', weight:'350 мл', price:540, img:'' },
  { id:6, cat:'soups',   title:'Крем-суп из тыквы',          comp:'Тыква, сливки, имбирь, семечки', weight:'300 мл', price:380, img:'' },
  { id:7, cat:'hot',     title:'Ризотто с белыми грибами',   comp:'Рис арборио, белые грибы, пармезан, трюфель', weight:'280 г', price:690, img:'' },
  { id:8, cat:'hot',     title:'Утиная ножка конфи',         comp:'Утка, картофель, вишнёвый соус', weight:'320 г', price:850, img:'' },
  { id:9, cat:'grill',   title:'Стейк Рибай',                comp:'Говядина, морская соль, розмарин', weight:'300 г', price:1890, img:'' },
  { id:10,cat:'grill',   title:'Шашлык из баранины',         comp:'Баранина, лук, специи, лаваш', weight:'250 г', price:790, img:'' },
  { id:11,cat:'pizza',   title:'Пицца Маргарита',            comp:'Томатный соус, моцарелла, базилик', weight:'480 г', price:590, img:'' },
  { id:12,cat:'pizza',   title:'Пицца с прошутто',           comp:'Прошутто, руккола, пармезан, томаты', weight:'520 г', price:750, img:'' },
  { id:13,cat:'desserts',title:'Тирамису',                   comp:'Маскарпоне, савоярди, кофе, какао', weight:'140 г', price:390, img:'' },
  { id:14,cat:'desserts',title:'Чизкейк Нью-Йорк',           comp:'Сыр творожный, песочная основа, ягодный соус', weight:'150 г', price:420, img:'' },
  { id:15,cat:'drinks',  title:'Лимонад домашний',            comp:'Лимон, мята, тростниковый сахар', weight:'400 мл', price:220, img:'' },
  { id:16,cat:'drinks',  title:'Облепиховый чай',             comp:'Облепиха, апельсин, мёд', weight:'400 мл', price:290, img:'' },
  { id:17,cat:'bar',     title:'Негрони',                     comp:'Джин, кампари, красный вермут', weight:'90 мл', price:520, img:'' },
  { id:18,cat:'bar',     title:'Апероль Шприц',               comp:'Апероль, просекко, содовая, апельсин', weight:'180 мл', price:490, img:'' },
];

const CATEGORIES = [
  { id:'all',     label:'Все' },
  { id:'cold',    label:'Холодные закуски' },
  { id:'salads',  label:'Салаты' },
  { id:'soups',   label:'Супы' },
  { id:'hot',     label:'Горячее' },
  { id:'grill',   label:'Гриль / мангал' },
  { id:'pizza',   label:'Пицца' },
  { id:'desserts',label:'Десерты' },
  { id:'drinks',  label:'Напитки' },
  { id:'bar',     label:'Бар / коктейли' },
];

const PLACEHOLDER_SVG = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
  <path d="M3 11h18M5 11V7a7 7 0 0 1 14 0v4M12 11v10M8 21h8"/>
</svg>`;

const Menu = {
  items: [],
  cat: 'all',
  query: '',

  async load() {
    try {
      const data = await api('/menu');
      this.items = Array.isArray(data.items) && data.items.length ? data.items : MENU_FALLBACK;
    } catch {
      this.items = MENU_FALLBACK;
    }
    this.render();
  },

  renderTabs() {
    const el = $('#menu-tabs');
    el.innerHTML = CATEGORIES.map((c) =>
      `<button class="tab${c.id === this.cat ? ' active' : ''}" data-cat="${c.id}" role="tab">${c.label}</button>`
    ).join('');
    el.onclick = (e) => {
      const btn = e.target.closest('.tab');
      if (!btn) return;
      this.cat = btn.dataset.cat;
      $$('.tab', el).forEach((b) => b.classList.toggle('active', b === btn));
      this.render();
    };
  },

  filtered() {
    const q = this.query.trim().toLowerCase();
    return this.items.filter((i) => {
      const okCat = this.cat === 'all' || i.cat === this.cat;
      const okQ = !q || i.title.toLowerCase().includes(q) || (i.comp || '').toLowerCase().includes(q);
      return okCat && okQ;
    });
  },

  render() {
    const grid = $('#menu-grid');
    const empty = $('#menu-empty');
    const list = this.filtered();

    empty.hidden = list.length > 0;
    grid.innerHTML = list.map((i) => `
      <article class="menu-card">
        <div class="menu-img">
          ${i.img
            ? `<img src="${escapeHtml(i.img)}" alt="${escapeHtml(i.title)}" loading="lazy" decoding="async" width="400" height="300">`
            : PLACEHOLDER_SVG}
        </div>
        <div class="menu-body">
          <h3>${escapeHtml(i.title)}</h3>
          <p class="menu-comp">${escapeHtml(i.comp)}</p>
          <div class="menu-meta">
            <span class="menu-weight">${escapeHtml(i.weight)}</span>
            <span class="menu-price">${fmtPrice(i.price)}</span>
            <button class="menu-add" data-id="${i.id}" aria-label="Добавить ${escapeHtml(i.title)} в корзину">+</button>
          </div>
        </div>
      </article>
    `).join('');
  },

  init() {
    this.renderTabs();
    $('#menu-search').addEventListener('input', (e) => {
      this.query = e.target.value;
      this.render();
    });
    $('#menu-grid').addEventListener('click', (e) => {
      const btn = e.target.closest('.menu-add');
      if (!btn) return;
      const id = Number(btn.dataset.id);
      const item = this.items.find((i) => i.id === id);
      if (item) Cart.add(item);
    });
  },
};

/* =========================================================
   КОРЗИНА
   ========================================================= */
const Cart = {
  key: 'veranda-cart',
  items: [],
  promo: null, // { code, type, value, description, min_total }

  load() {
    try {
      this.items = JSON.parse(localStorage.getItem(this.key)) || [];
      if (!Array.isArray(this.items)) this.items = [];
    } catch { this.items = []; }

    try {
      const raw = localStorage.getItem(this.key + '-promo');
      this.promo = raw ? JSON.parse(raw) : null;
    } catch { this.promo = null; }

    this.updateUI();
  },

  save() {
    localStorage.setItem(this.key, JSON.stringify(this.items));
    try {
      if (this.promo) localStorage.setItem(this.key + '-promo', JSON.stringify(this.promo));
      else localStorage.removeItem(this.key + '-promo');
    } catch {}
    this.updateUI();
  },

  add(item) {
    const found = this.items.find((i) => i.id === item.id);
    if (found) found.qty += 1;
    else this.items.push({ id:item.id, title:item.title, price:item.price, weight:item.weight, img:item.img, qty:1 });
    this.revalidatePromo();
    this.save();
    toast(`«${item.title}» добавлено в корзину`, 'success');
  },

  inc(id) { const it = this.items.find((i) => i.id === id); if (it) { it.qty++; this.revalidatePromo(); this.save(); } },

  dec(id) {
    const it = this.items.find((i) => i.id === id);
    if (!it) return;
    it.qty--;
    if (it.qty <= 0) this.items = this.items.filter((i) => i.id !== id);
    this.revalidatePromo();
    this.save();
  },

  remove(id) { this.items = this.items.filter((i) => i.id !== id); this.revalidatePromo(); this.save(); },
  clear() { this.items = []; this.promo = null; this.save(); },

  subtotal() { return this.items.reduce((s, i) => s + i.price * i.qty, 0); },
  total() { return this.items.reduce((s, i) => s + i.price * i.qty, 0); },
  count() { return this.items.reduce((s, i) => s + i.qty, 0); },

  /* Пересчитывает скидку по текущему промокоду. Если сумма упала ниже min_total — сбрасывает. */
  revalidatePromo() {
    if (!this.promo) return;
    const sub = this.subtotal();
    if (sub < (this.promo.min_total || 0)) {
      this.promo = null;
      if (typeof promoHint === 'function') {} // no-op
      // Обновляем UI промокода, если он в DOM
      const input = $('#o-promo');
      const btn   = $('#promo-apply');
      const hint  = $('#promo-hint');
      if (input) { input.disabled = false; input.value = ''; }
      if (btn)   { btn.textContent = 'Применить'; }
      if (hint)  { hint.textContent = ''; hint.className = 'promo-hint'; }
      return;
    }
    // Пересчитываем discount по сохранённым type/value
    if (this.promo.type === 'percent') {
      this.promo.discount = Math.floor(sub * this.promo.value / 100);
      this.promo.description = `−${this.promo.value}%`;
    } else if (this.promo.type === 'amount') {
      this.promo.discount = Math.min(this.promo.value, sub);
      this.promo.description = `−${this.promo.value} ₽`;
    }
  },

  discount() {
    if (!this.promo) return 0;
    return this.promo.discount || 0;
  },

  finalTotal() {
    return Math.max(0, this.subtotal() - this.discount());
  },

  updateUI() {
    const badge = $('#cart-count');
    const count = this.count();
    if (badge) {
      badge.textContent = count;
      badge.hidden = count === 0;
    }

    const html = this.items.length ? this.items.map((i) => `
      <div class="cart-item">
        <div class="cart-item-img">
          ${i.img ? `<img src="${escapeHtml(i.img)}" alt="${escapeHtml(i.title)}" loading="lazy">` : PLACEHOLDER_SVG}
        </div>
        <div class="cart-item-info">
          <h4>${escapeHtml(i.title)}</h4>
          <p>${fmtPrice(i.price)} × ${i.qty} = ${fmtPrice(i.price * i.qty)}</p>
        </div>
        <div class="cart-item-qty">
          <button class="qty-btn" data-dec="${i.id}" aria-label="Уменьшить">−</button>
          <span>${i.qty}</span>
          <button class="qty-btn" data-inc="${i.id}" aria-label="Увеличить">+</button>
        </div>
      </div>
    `).join('') : '<p class="empty">Корзина пуста</p>';

    const body = $('#cart-drawer-body');
    const list = $('#cart-list');
    if (body) body.innerHTML = html;
    if (list) list.innerHTML = html;

    const subtotal = this.subtotal();
    const discount = this.discount();
    const finalTotal = this.finalTotal();

    const totalEl = $('#cart-total');
    if (totalEl) totalEl.textContent = fmtPrice(finalTotal);

    const summary = $('#cart-summary');
    if (summary) {
      if (!this.items.length) {
        summary.innerHTML = '<p>Корзина пуста</p>';
      } else {
        let rows = this.items.map((i) =>
          `<div class="row-line"><span>${escapeHtml(i.title)} × ${i.qty}</span><span>${fmtPrice(i.price * i.qty)}</span></div>`
        ).join('');

        if (this.promo && discount > 0) {
          rows += `<div class="row-line discount"><span>Промокод ${escapeHtml(this.promo.code)} (${this.promo.description})</span><span>−${fmtPrice(discount)}</span></div>`;
        }

        rows += `<div class="row-line total"><span>Итого</span><span>${fmtPrice(finalTotal)}</span></div>`;
        summary.innerHTML = rows;
      }
    }

    $$('[data-inc],[data-dec]').forEach((b) => {
      b.onclick = () => {
        const id = Number(b.dataset.inc || b.dataset.dec);
        b.dataset.inc ? this.inc(id) : this.dec(id);
      };
    });
  },
};

/* ---------- Drawer ---------- */
(function drawer() {
  const d = $('#cart-drawer');
  const o = $('#overlay');
  if (!d || !o) return;

  const open = () => {
    d.classList.add('open');
    o.classList.add('active');
    d.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  };
  const close = () => {
    d.classList.remove('open');
    o.classList.remove('active');
    d.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  $('#cart-btn')?.addEventListener('click', open);
  $('#cart-close')?.addEventListener('click', close);
  o.addEventListener('click', close);
  $('#cart-checkout')?.addEventListener('click', () => {
    close();
    $('#order')?.scrollIntoView({ behavior: 'smooth' });
  });
  document.addEventListener('keydown', (e) => e.key === 'Escape' && close());
})();

/* =========================================================
   ВАЛИДАЦИЯ
   ========================================================= */
const Validators = {
  name: (v) => v.trim().length >= 2 || 'Введите имя (минимум 2 символа)',
  phone: (v) => /^(\+?\d[\d\s\-()]{9,})$/.test(v.trim()) || 'Введите корректный телефон',
  date: (v) => {
    if (!v) return 'Выберите дату';
    const d = new Date(v); const today = new Date(); today.setHours(0, 0, 0, 0);
    return d >= today || 'Дата не может быть в прошлом';
  },
  time: (v) => {
    if (!v) return 'Выберите время';
    const [h] = v.split(':').map(Number);
    return (h >= 10 && h <= 23) || 'Время работы: 10:00–23:00';
  },
  guests: (v) => (Number(v) >= 1 && Number(v) <= 20) || 'От 1 до 20 гостей',
  text: (v) => v.trim().length >= 10 || 'Минимум 10 символов',
  rating: (v) => (Number(v) >= 1 && Number(v) <= 5) || 'Выберите оценку',
};

function validateField(input, rule) {
  const err = rule(input.value);
  input.classList.toggle('error', err !== true);
  let hint = input.parentElement.querySelector('.err-hint');
  if (err !== true) {
    if (!hint) {
      hint = document.createElement('span');
      hint.className = 'err-hint';
      hint.style.cssText = 'color:#d94f4f;font-size:.78rem;margin-top:.15rem';
      input.parentElement.appendChild(hint);
    }
    hint.textContent = err;
    return false;
  }
  hint?.remove();
  return true;
}

function validateForm(form, rules) {
  let ok = true;
  for (const [name, rule] of Object.entries(rules)) {
    const input = form.elements[name];
    if (input && !validateField(input, rule)) ok = false;
  }
  return ok;
}

/* =========================================================
   ФОРМА ЗАКАЗА
   ========================================================= */
(function orderForm() {
  const form = $('#order-form');
  if (!form) return;

  $$('input[name="delivery"]', form).forEach((r) =>
    r.addEventListener('change', () => {
      const isDelivery = form.elements.delivery.value === 'delivery';
      $('#address-field').style.display = isDelivery ? '' : 'none';
      form.elements.address.required = isDelivery;
    })
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.elements.hp.value) return;
    if (!Cart.items.length) return toast('Корзина пуста', 'error');

    const rules = { name: Validators.name, phone: Validators.phone };
    if (form.elements.delivery.value === 'delivery') {
      rules.address = (v) => v.trim().length >= 5 || 'Укажите адрес';
    }
    if (!validateForm(form, rules)) return toast('Проверьте поля формы', 'error');

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Отправляем...';

    try {
      const res = await api('/order', {
        method: 'POST',
        body: {
          name: form.elements.name.value.trim(),
          phone: form.elements.phone.value.trim(),
          delivery: form.elements.delivery.value,
          address: form.elements.address.value.trim(),
          comment: form.elements.comment.value.trim(),
          items: Cart.items.map((i) => ({ id: i.id, title: i.title, price: i.price, qty: i.qty })),
          total: Cart.subtotal(),
          promocode: Cart.promo ? Cart.promo.code : '',
        },
      });

      const finalText = res.discount > 0
        ? `Заказ принят! Скидка ${res.discount} ₽, к оплате ${res.total} ₽. Мы позвоним для подтверждения.`
        : 'Заказ принят! Мы позвоним для подтверждения.';
      toast(finalText, 'success');

      Cart.clear();
      form.reset();
      $('#address-field').style.display = '';

      // сбрасываем UI промокода
      const promoInput = $('#o-promo');
      const promoBtn   = $('#promo-apply');
      const promoHint  = $('#promo-hint');
      if (promoInput) { promoInput.disabled = false; promoInput.value = ''; }
      if (promoBtn)   { promoBtn.textContent = 'Применить'; }
      if (promoHint)  { promoHint.textContent = ''; promoHint.className = 'promo-hint'; }
    } catch (err) {
      toast(err.message || 'Ошибка отправки. Попробуйте ещё раз.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Оформить заказ';
    }
  });
})();

/* =========================================================
   ПРОМОКОД
   ========================================================= */
(function promoCode() {
  const input = $('#o-promo');
  const btn   = $('#promo-apply');
  const hint  = $('#promo-hint');
  if (!input || !btn || !hint) return;

  const setHint = (msg, type = '') => {
    hint.textContent = msg;
    hint.className = 'promo-hint' + (type ? ' is-' + type : '');
  };

  // Автопрописные буквы
  input.addEventListener('input', () => {
    input.value = input.value.toUpperCase();
  });

  const apply = async () => {
    const code = input.value.trim();
    if (!code) { setHint('Введите промокод'); return; }
    if (!Cart.items.length) { setHint('Сначала добавьте блюда в корзину', 'error'); return; }

    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = '...';

    try {
      const res = await api('/promo-check', {
        method: 'POST',
        body: { code, subtotal: Cart.subtotal() },
      });

      Cart.promo = {
        code: res.code,
        type: res.type,
        value: res.value,
        min_total: res.min_total,
        discount: res.discount,
        description: res.description,
      };
      Cart.save();

      setHint(`Промокод «${res.code}» применён: ${res.description} (−${res.discount} ₽)`, 'ok');
      input.disabled = true;
      btn.textContent = 'Убрать';
      btn.disabled = false;
    } catch (err) {
      Cart.promo = null;
      Cart.save();
      setHint(err.message || 'Промокод не найден', 'error');
      btn.disabled = false;
      btn.textContent = oldText;
    }
  };

  const remove = () => {
    Cart.promo = null;
    Cart.save();
    input.disabled = false;
    input.value = '';
    btn.textContent = 'Применить';
    setHint('');
  };

  btn.addEventListener('click', () => {
    if (Cart.promo) remove();
    else apply();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (!Cart.promo) apply(); }
  });

  // При загрузке — восстановить состояние из localStorage
  if (Cart.promo) {
    input.value = Cart.promo.code;
    input.disabled = true;
    btn.textContent = 'Убрать';
    setHint(`Промокод «${Cart.promo.code}» применён: ${Cart.promo.description}`, 'ok');
  }
})();

/* =========================================================
   ФОРМА БРОНИ
   ========================================================= */
(function bookingForm() {
  const form = $('#booking-form');
  if (!form) return;

  const dateInput = form.elements.date;
  const today = new Date().toISOString().split('T')[0];
  dateInput.min = today;
  dateInput.value = today;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.elements.hp.value) return;

    const rules = {
      name: Validators.name,
      phone: Validators.phone,
      date: Validators.date,
      time: Validators.time,
      guests: Validators.guests,
    };
    if (!validateForm(form, rules)) return toast('Проверьте поля формы', 'error');

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Бронируем...';

    try {
      await api('/booking', {
        method: 'POST',
        body: {
          name: form.elements.name.value.trim(),
          phone: form.elements.phone.value.trim(),
          date: form.elements.date.value,
          time: form.elements.time.value,
          guests: Number(form.elements.guests.value),
          comment: form.elements.comment.value.trim(),
        },
      });
      toast('Столик забронирован! Мы свяжемся для подтверждения.', 'success');
      form.reset();
      dateInput.value = today;
    } catch (err) {
      toast(err.message || 'Ошибка бронирования', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Забронировать';
    }
  });
})();

/* =========================================================
   ОТЗЫВЫ — слайдер + модалка с формой
   ========================================================= */
const Reviews = {
  items: [],
  index: 0,

  async load() {
    const track = $('#reviews-list');
    if (!track) return;

    try {
      const data = await api('/reviews');
      this.items = Array.isArray(data.items) ? data.items : [];
    } catch {
      this.items = [];
    }

    this.render();
    this.updateSummary();
  },

  render() {
    const track = $('#reviews-list');
    const controls = $('#reviews-controls');
    if (!track) return;

    if (!this.items.length) {
      track.innerHTML = '<div class="reviews-empty">Пока нет отзывов — станьте первым!</div>';
      if (controls) controls.hidden = true;
      return;
    }

    track.innerHTML = this.items.map((r) => this.cardHtml(r)).join('');

    track.scrollLeft = 0;
    this.index = 0;

    this.renderDots();
    this.updateArrows();

    if (controls) controls.hidden = false;
  },

  cardHtml(r) {
    const initial = (r.name || '?').trim().charAt(0).toUpperCase();
    const rating  = Math.max(1, Math.min(5, Number(r.rating) || 5));
    const date    = r.created_at
      ? new Date(r.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
      : '';

    return `
      <article class="review-card">
        <div class="review-card__head">
          <div class="review-card__avatar" aria-hidden="true">${escapeHtml(initial)}</div>
          <div class="review-card__meta">
            <div class="review-card__name">${escapeHtml(r.name)}</div>
            ${date ? `<div class="review-card__date">${date}</div>` : ''}
          </div>
        </div>
        <p class="review-card__text">«${escapeHtml(r.text)}»</p>
        <div class="review-card__footer">
          <div class="review-card__stars" aria-label="Оценка ${rating} из 5">
            ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}
          </div>
          <div class="review-card__source">Сайт кафе</div>
        </div>
      </article>
    `;
  },

  renderDots() {
    const dots = $('#reviews-dots');
    if (!dots) return;
    dots.innerHTML = this.items.map((_, i) =>
      `<button class="dots__dot${i === 0 ? ' is-active' : ''}" data-i="${i}" type="button" role="tab" aria-label="Отзыв ${i + 1}"></button>`
    ).join('');

    dots.onclick = (e) => {
      const btn = e.target.closest('.dots__dot');
      if (!btn) return;
      this.goTo(Number(btn.dataset.i));
    };
  },

  updateSummary() {
    const avgEl   = $('#reviews-avg');
    const starsEl = $('#reviews-avg-stars');
    const countEl = $('#reviews-count');
    if (!avgEl || !countEl || !starsEl) return;

    const n = this.items.length;
    if (!n) {
      avgEl.textContent = '—';
      starsEl.textContent = '☆☆☆☆☆';
      countEl.textContent = '0';
      return;
    }

    const sum = this.items.reduce((s, r) => s + (Number(r.rating) || 0), 0);
    const avg = sum / n;
    const shown = avg.toFixed(1);
    const full  = Math.round(avg);

    avgEl.textContent = shown.replace('.', ',');
    starsEl.textContent = '★'.repeat(full) + '☆'.repeat(5 - full);
    countEl.textContent = n;
  },

  goTo(i) {
    const track = $('#reviews-list');
    if (!track) return;
    const max = this.items.length - 1;
    this.index = Math.max(0, Math.min(max, i));
    track.scrollTo({ left: this.index * track.clientWidth, behavior: 'smooth' });
    this.updateArrows();
    this.updateDots();
  },

  updateDots() {
    $$('#reviews-dots .dots__dot').forEach((d, i) => {
      d.classList.toggle('is-active', i === this.index);
    });
  },

  updateArrows() {
    const prev = $('#reviews-prev');
    const next = $('#reviews-next');
    if (!prev || !next) return;
    prev.disabled = this.index <= 0;
    next.disabled = this.index >= this.items.length - 1;
  },

  init() {
    const track = $('#reviews-list');
    const prev  = $('#reviews-prev');
    const next  = $('#reviews-next');
    if (!track) return;

    prev?.addEventListener('click', () => this.goTo(this.index - 1));
    next?.addEventListener('click', () => this.goTo(this.index + 1));

    let raf;
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = track.clientWidth || 1;
        const i = Math.round(track.scrollLeft / w);
        if (i !== this.index) {
          this.index = i;
          this.updateDots();
          this.updateArrows();
        }
      });
    }, { passive: true });

    window.addEventListener('resize', () => {
      track.scrollTo({ left: this.index * track.clientWidth, behavior: 'auto' });
    }, { passive: true });

    track.setAttribute('tabindex', '0');
    track.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); this.goTo(this.index + 1); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); this.goTo(this.index - 1); }
    });
  },
};

/* ---------- Модальное окно ---------- */
const Modal = {
  open(el) {
    if (!el) return;
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  },
  close(el) {
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  },
  closeAll() {
    $$('.modal.is-open').forEach((m) => this.close(m));
  },
};

(function modalBindings() {
  $('#reviews-open-modal')?.addEventListener('click', () => {
    Modal.open($('#review-modal'));
    setTimeout(() => $('#review-form')?.elements.name?.focus(), 200);
  });

  $$('#review-modal [data-modal-close]').forEach((el) => {
    el.addEventListener('click', () => Modal.close($('#review-modal')));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') Modal.closeAll();
  });
})();

/* =========================================================
   ФОРМА ОТЗЫВА
   ========================================================= */
(function reviewForm() {
  const form = $('#review-form');
  if (!form) return;

  const ratingInput  = $('#rating-input');
  const ratingHidden = $('#rating-value-input');
  let currentRating = 0;

  if (ratingInput && ratingHidden) {
    const stars = $$('.rating-input__star', ratingInput);
    stars.forEach((star) => {
      star.addEventListener('click', () => {
        currentRating = parseInt(star.dataset.value, 10);
        ratingHidden.value = currentRating;
        stars.forEach((s) => s.classList.toggle('is-active', parseInt(s.dataset.value, 10) <= currentRating));
      });
      star.addEventListener('mouseenter', () => {
        const hoverVal = parseInt(star.dataset.value, 10);
        stars.forEach((s) => s.classList.toggle('is-hover', parseInt(s.dataset.value, 10) <= hoverVal));
      });
    });
    ratingInput.addEventListener('mouseleave', () => {
      stars.forEach((s) => s.classList.remove('is-hover'));
    });
  }

  const setFieldError = (input, message) => {
    const field = input.closest('.form__field');
    const err = field?.querySelector('.form__error');
    if (!field || !err) return;
    field.classList.toggle('is-invalid', !!message);
    err.textContent = message || '';
  };

  const validateField = (input) => {
    const v = (input.value || '').trim();
    if (input.name === 'name' && v.length < 2) return 'Укажите имя (минимум 2 символа)';
    if (input.name === 'text' && v.length < 10) return 'Текст минимум 10 символов';
    if (input.name === 'rating' && (!v || parseInt(v, 10) < 1)) return 'Поставьте оценку';
    return '';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (form.elements.honeypot?.value) return;

    let firstInvalid = null;
    $$('input, textarea', form).forEach((el) => {
      if (el.name === 'honeypot') return;
      const msg = validateField(el);
      setFieldError(el, msg);
      if (msg && !firstInvalid) firstInvalid = el;
    });
    if (firstInvalid) { firstInvalid.focus(); return; }

    const payload = {
      name: form.elements.name.value.trim(),
      rating: Number(form.elements.rating.value) || 0,
      text: form.elements.text.value.trim(),
    };

    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn?.textContent || 'Опубликовать отзыв';
    if (btn) { btn.disabled = true; btn.textContent = 'Отправляем...'; }

    try {
      await api('/review', { method: 'POST', body: payload });

      toast('Спасибо! Ваш отзыв опубликован.', 'success');

      form.reset();
      currentRating = 0;
      if (ratingHidden) ratingHidden.value = '';
      $$('.rating-input__star', ratingInput).forEach((s) => s.classList.remove('is-active', 'is-hover'));
      $$('.form__field', form).forEach((f) => f.classList.remove('is-invalid'));

      Modal.close($('#review-modal'));
      Reviews.load();
    } catch (err) {
      console.error('[review]', err);
      toast(err.message || 'Не удалось отправить отзыв', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = originalText; }
    }
  });
})();

/* =========================================================
   ПРОМО + ГАЛЕРЕЯ
   ========================================================= */
(function promo() {
  const grid = $('#promo-grid');
  if (!grid) return;
  const items = [
    { tag:'−20%', title:'Скидка на всю пиццу', text:'По вторникам и средам — 20% на все пиццы в зале и на доставку.' },
    { tag:'Подарок', title:'Комплимент от шефа', text:'К каждому стейку — бокал вина или домашний лимонад.' },
    { tag:'Бизнес-ланч', title:'3 блюда — 490 ₽', text:'С понедельника по пятницу с 12:00 до 16:00.' },
  ];
  grid.innerHTML = items.map((p) => `
    <article class="promo-card">
      <span class="promo-tag">${escapeHtml(p.tag)}</span>
      <h3>${escapeHtml(p.title)}</h3>
      <p>${escapeHtml(p.text)}</p>
    </article>
  `).join('');
})();

(function gallery() {
  const grid = $('#gallery-grid');
  if (!grid) return;
  const imgs = Array.from({ length: 8 }, (_, i) => `img/gallery-${i + 1}.webp`);
  grid.innerHTML = imgs.map((src, i) => `
    <picture>
      <source srcset="${src}" type="image/webp">
      <img src="${src.replace('.webp', '.jpg')}" alt="Фото кафе ВерАнда ${i + 1}" loading="lazy" decoding="async" width="400" height="400">
    </picture>
  `).join('');
})();

/* =========================================================
   INIT
   ========================================================= */
document.addEventListener('DOMContentLoaded', () => {
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  Menu.init();
  Menu.load();
  Cart.load();
  Reviews.init();
  Reviews.load();
});