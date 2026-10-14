/* =========================================================
   ВерАнда API — Cloudflare Worker + D1 + Telegram-боты
   Секреты:
     TELEGRAM_BOT_TOKEN          — рабочий бот (с кнопками)
     TELEGRAM_CHAT_IDS           — получатели рабочего бота
     TELEGRAM_WEBHOOK_SECRET     — секрет вебхука
     TELEGRAM_LOG_BOT_TOKEN      — логгер-бот (только отправка)
     TELEGRAM_LOG_CHAT_IDS       — получатели логгера
     ALLOWED_ORIGIN              — CORS
   ========================================================= */

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };

/* ---------- Rate limiting (пер-изолят) ---------- */
const rateMap = new Map();
function rateLimit(ip, limit = 5, windowMs = 60_000) {
  const now = Date.now();
  const rec = rateMap.get(ip) || { count: 0, reset: now + windowMs };
  if (now > rec.reset) { rec.count = 0; rec.reset = now + windowMs; }
  rec.count++;
  rateMap.set(ip, rec);
  return rec.count <= limit;
}

/* ---------- CORS ---------- */
function cors(origin, env) {
  const allowed = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': origin && origin === allowed ? origin : allowed,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...extra } });
}

/* ---------- Валидация ---------- */
const V = {
  str: (v, min = 1, max = 200) =>
    typeof v === 'string' && v.trim().length >= min && v.trim().length <= max,
  phone: (v) => typeof v === 'string' && /^\+?\d[\d\s\-()]{9,}$/.test(v.trim()),
  int: (v, min, max) => Number.isInteger(v) && v >= min && v <= max,
};

/* ---------- Разбор строки chat_id ---------- */
function parseIds(raw) {
  return String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
}

/* ---------- Время МСК ---------- */
function nowMSK() {
  try {
    return new Date().toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return new Date().toISOString().slice(0, 16).replace('T', ' ');
  }
}

/* =========================================================
   TELEGRAM — низкоуровневые вызовы
   ========================================================= */
async function tgCall(token, method, body) {
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return await res.json().catch(() => null);
  } catch (e) {
    console.error(`tgCall ${method} failed:`, e);
    return null;
  }
}

async function tgSend(chatId, text, env, opts = {}) {
  return tgCall(env.TELEGRAM_BOT_TOKEN, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...opts,
  });
}

async function tgEdit(chatId, messageId, text, env, opts = {}) {
  return tgCall(env.TELEGRAM_BOT_TOKEN, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...opts,
  });
}

async function tgAnswerCallback(callbackId, text = '', env, showAlert = false) {
  return tgCall(env.TELEGRAM_BOT_TOKEN, 'answerCallbackQuery', {
    callback_query_id: callbackId,
    text,
    show_alert: showAlert,
  });
}

async function tgSendLog(chatId, text, env) {
  return tgCall(env.TELEGRAM_LOG_BOT_TOKEN, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

/* =========================================================
   Получатели
   ========================================================= */
function getChatIds(env) {
  return parseIds(env.TELEGRAM_CHAT_IDS || env.TELEGRAM_CHAT_ID);
}
function getLogChatIds(env) {
  return parseIds(env.TELEGRAM_LOG_CHAT_IDS);
}
function isAdmin(chatId, env) {
  return getChatIds(env).includes(String(chatId));
}

/* =========================================================
   Уведомления
   ========================================================= */
async function notify(text, env, opts = {}) {
  const chatIds = getChatIds(env);
  if (!chatIds.length) return [];
  const results = await Promise.allSettled(
    chatIds.map((cid) => tgSend(cid, text, env, opts))
  );
  return results.map((r, i) => ({
    chat_id: chatIds[i],
    ok: r.status === 'fulfilled' && r.value?.ok !== false,
  }));
}

async function notifyLog(text, env) {
  if (!env.TELEGRAM_LOG_BOT_TOKEN) return [];
  const chatIds = getLogChatIds(env);
  if (!chatIds.length) return [];
  const results = await Promise.allSettled(
    chatIds.map((cid) => tgSendLog(cid, text, env))
  );
  return results.map((r, i) => ({
    chat_id: chatIds[i],
    ok: r.status === 'fulfilled' && r.value?.ok !== false,
  }));
}

/* =========================================================
   ПРОМОКОДЫ — общая логика
   ========================================================= */
async function findPromo(env, code) {
  if (!code || typeof code !== 'string') return null;
  const trimmed = code.trim();
  if (!trimmed) return null;
  try {
    return await env.DB.prepare(
      `SELECT * FROM promocodes WHERE UPPER(code) = UPPER(?1) AND active = 1`
    ).bind(trimmed).first();
  } catch (e) {
    console.error('findPromo', e);
    return null;
  }
}

function checkPromo(promo, subtotal) {
  if (!promo) return { ok: false, error: 'Промокод не найден' };

  if (promo.expires_at) {
    const exp = new Date(promo.expires_at + 'T23:59:59');
    if (exp < new Date()) return { ok: false, error: 'Промокод истёк' };
  }
  if (promo.uses_left !== null && promo.uses_left <= 0) {
    return { ok: false, error: 'Промокод больше не действует' };
  }
  if (subtotal < (promo.min_total || 0)) {
    return { ok: false, error: `Минимальная сумма заказа — ${promo.min_total} ₽` };
  }

  let type = '';
  let value = 0;
  let discount = 0;
  let description = '';

  if (promo.discount_percent > 0) {
    type = 'percent';
    value = promo.discount_percent;
    discount = Math.floor(subtotal * value / 100);
    description = `−${value}%`;
  } else if (promo.discount_amount > 0) {
    type = 'amount';
    value = promo.discount_amount;
    discount = Math.min(value, subtotal);
    description = `−${value} ₽`;
  } else {
    return { ok: false, error: 'Промокод неактивен' };
  }

  return {
    ok: true,
    code: promo.code,
    type,
    value,
    discount,
    description,
    min_total: promo.min_total || 0,
    total: Math.max(0, subtotal - discount),
  };
}

/* =========================================================
   СЛОВАРИ СТАТУСОВ + КЛАВИАТУРЫ
   ========================================================= */
const ORDER_LABELS = {
  new:        '⏳ новый',
  confirmed:  '✅ подтверждён',
  cooking:    '👨‍🍳 готовится',
  delivering: '🚚 в доставке',
  done:       '🏁 выполнен',
  cancelled:  '❌ отменён',
};

const BOOKING_LABELS = {
  new:       '⏳ новая',
  confirmed: '✅ подтверждена',
  done:      '🏁 прошла',
  cancelled: '❌ отменена',
};

const ORDER_ACTION_TO_STATUS = {
  confirm:  'confirmed',
  cooking:  'cooking',
  delivery: 'delivering',
  done:     'done',
  cancel:   'cancelled',
};

const BOOKING_ACTION_TO_STATUS = {
  confirm: 'confirmed',
  done:    'done',
  cancel:  'cancelled',
};

function buildOrderKeyboard(id, status) {
  switch (status) {
    case 'new':
      return [[
        { text: '✅ Подтвердить', callback_data: `order:confirm:${id}` },
        { text: '❌ Отменить',    callback_data: `order:cancel:${id}` },
      ]];
    case 'confirmed':
      return [[
        { text: '👨‍🍳 Готовится',  callback_data: `order:cooking:${id}` },
        { text: '❌ Отменить',    callback_data: `order:cancel:${id}` },
      ]];
    case 'cooking':
      return [[
        { text: '🚚 В доставке',  callback_data: `order:delivery:${id}` },
        { text: '❌ Отменить',    callback_data: `order:cancel:${id}` },
      ]];
    case 'delivering':
      return [[
        { text: '🏁 Выполнен',    callback_data: `order:done:${id}` },
        { text: '❌ Отменить',    callback_data: `order:cancel:${id}` },
      ]];
    default:
      return null;
  }
}

function buildBookingKeyboard(id, status) {
  switch (status) {
    case 'new':
      return [[
        { text: '✅ Подтвердить', callback_data: `booking:confirm:${id}` },
        { text: '❌ Отменить',    callback_data: `booking:cancel:${id}` },
      ]];
    case 'confirmed':
      return [[
        { text: '🏁 Прошла',      callback_data: `booking:done:${id}` },
        { text: '❌ Отменить',    callback_data: `booking:cancel:${id}` },
      ]];
    default:
      return null;
  }
}

function buildReviewKeyboard(id, approved) {
  return [[
    approved
      ? { text: '🚫 Скрыть',       callback_data: `review:hide:${id}` }
      : { text: '👁 Опубликовать', callback_data: `review:show:${id}` },
    { text: '🗑 Удалить',           callback_data: `review:delete:${id}` },
  ]];
}

function replaceHeader(text, newHeader) {
  const lines = String(text || '').split('\n');
  lines[0] = newHeader;
  return lines.join('\n');
}

function operatorLine(user) {
  if (!user) return '—';
  const parts = [user.name || 'Админ'];
  if (user.username) parts.push(`(@${user.username})`);
  if (user.id) parts.push(`· ID <code>${user.id}</code>`);
  return parts.join(' ');
}

/* =========================================================
   TELEGRAM — команды
   ========================================================= */
const HELP_TEXT = `👋 <b>ВерАнда — панель управления</b>

<b>Команды:</b>
/stats — статистика
/orders — последние 10 заказов
/bookings — последние 10 броней
/reviews — последние 10 отзывов
/promos — список промокодов
/id — узнать chat_id
/help — эта справка

<b>Уведомления</b> о новых заказах/бронях/отзывах приходят сюда автоматически.
Под каждым — inline-кнопки для быстрого управления.`;

async function cmdStart(chatId, env) {
  await tgSend(chatId, HELP_TEXT, env);
}

async function cmdId(chatId, env) {
  await tgSend(chatId, `🆔 Ваш chat_id: <code>${chatId}</code>`, env);
}

async function cmdStats(chatId, env) {
  try {
    const row = await env.DB.prepare(`
      SELECT
        (SELECT COUNT(*) FROM orders) AS orders_total,
        (SELECT COUNT(*) FROM orders WHERE date(created_at) = date('now')) AS orders_today,
        (SELECT COUNT(*) FROM orders WHERE status = 'new') AS orders_new,
        (SELECT IFNULL(SUM(total),0) FROM orders WHERE status != 'cancelled') AS revenue,
        (SELECT COUNT(*) FROM bookings) AS bookings_total,
        (SELECT COUNT(*) FROM bookings WHERE date = date('now')) AS bookings_today,
        (SELECT COUNT(*) FROM reviews WHERE approved = 1) AS reviews_total,
        (SELECT IFNULL(ROUND(AVG(rating),1),0) FROM reviews WHERE approved = 1) AS reviews_avg
    `).first();

    const text =
      `📊 <b>Статистика ВерАнда</b>\n\n` +
      `🍽 <b>Заказы</b>\n` +
      `• Всего: <b>${row.orders_total}</b>\n` +
      `• Сегодня: <b>${row.orders_today}</b>\n` +
      `• Новых (не обработано): <b>${row.orders_new}</b>\n` +
      `• Выручка: <b>${row.revenue} ₽</b>\n\n` +
      `📅 <b>Брони</b>\n` +
      `• Всего: <b>${row.bookings_total}</b>\n` +
      `• На сегодня: <b>${row.bookings_today}</b>\n\n` +
      `⭐ <b>Отзывы</b>\n` +
      `• Опубликовано: <b>${row.reviews_total}</b>\n` +
      `• Средний рейтинг: <b>${row.reviews_avg} / 5</b>`;

    await tgSend(chatId, text, env);
  } catch (e) {
    console.error('cmdStats', e);
    await tgSend(chatId, '❌ Ошибка получения статистики', env);
  }
}

async function cmdOrders(chatId, env) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT id, name, phone, delivery, address, total, subtotal, promocode, discount, status, created_at
      FROM orders ORDER BY id DESC LIMIT 10
    `).all();

    if (!results.length) return tgSend(chatId, '🍽 Заказов пока нет', env);

    const text = `🍽 <b>Последние ${results.length} заказов</b>\n\n` +
      results.map((o) => {
        const dt = new Date(o.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        const st = ORDER_LABELS[o.status] || o.status;
        const deliv = o.delivery === 'delivery' ? `🚚 ${o.address}` : '🏃 самовывоз';
        const promoLine = o.promocode ? `\n🎟 ${o.promocode} · −${o.discount} ₽` : '';
        return `<b>#${o.id}</b> · ${dt}\n` +
               `👤 ${o.name} · 📞 ${o.phone}\n` +
               `${deliv}${promoLine}\n` +
               `💰 <b>${o.total} ₽</b> · ${st}`;
      }).join('\n\n');

    await tgSend(chatId, text, env);
  } catch (e) {
    console.error('cmdOrders', e);
    await tgSend(chatId, '❌ Ошибка', env);
  }
}

async function cmdBookings(chatId, env) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT id, name, phone, date, time, guests, status
      FROM bookings ORDER BY id DESC LIMIT 10
    `).all();

    if (!results.length) return tgSend(chatId, '📅 Броней пока нет', env);

    const text = `📅 <b>Последние ${results.length} броней</b>\n\n` +
      results.map((b) => {
        const st = BOOKING_LABELS[b.status] || b.status;
        return `<b>#${b.id}</b> · ${b.date} в ${b.time}\n` +
               `👤 ${b.name} · 📞 ${b.phone}\n` +
               `👥 ${b.guests} гостей · ${st}`;
      }).join('\n\n');

    await tgSend(chatId, text, env);
  } catch (e) {
    console.error('cmdBookings', e);
    await tgSend(chatId, '❌ Ошибка', env);
  }
}

async function cmdReviews(chatId, env) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT id, name, rating, text, approved, created_at
      FROM reviews ORDER BY id DESC LIMIT 10
    `).all();

    if (!results.length) return tgSend(chatId, '⭐ Отзывов пока нет', env);

    const text = `⭐ <b>Последние ${results.length} отзывов</b>\n\n` +
      results.map((r) => {
        const stars = '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating);
        const dt = new Date(r.created_at).toLocaleDateString('ru-RU');
        const vis = r.approved ? '' : ' · <i>скрыт</i>';
        return `<b>#${r.id}</b> · ${dt}${vis}\n` +
               `👤 ${r.name}\n` +
               `${stars}\n` +
               `<i>${r.text.slice(0, 200)}${r.text.length > 200 ? '…' : ''}</i>`;
      }).join('\n\n');

    await tgSend(chatId, text, env);
  } catch (e) {
    console.error('cmdReviews', e);
    await tgSend(chatId, '❌ Ошибка', env);
  }
}

async function cmdPromos(chatId, env) {
  try {
    const { results } = await env.DB.prepare(`
      SELECT code, discount_percent, discount_amount, min_total, uses_left, expires_at, active
      FROM promocodes ORDER BY active DESC, id DESC LIMIT 30
    `).all();

    if (!results.length) return tgSend(chatId, '🎟 Промокодов пока нет', env);

    const text = `🎟 <b>Промокоды</b>\n\n` +
      results.map((p) => {
        const kind = p.discount_percent > 0 ? `−${p.discount_percent}%` : `−${p.discount_amount} ₽`;
        const status = p.active ? '✅' : '🚫';
        const meta = [];
        if (p.min_total > 0) meta.push(`от ${p.min_total} ₽`);
        if (p.uses_left !== null) meta.push(`осталось ${p.uses_left}`);
        if (p.expires_at) meta.push(`до ${p.expires_at}`);
        return `${status} <code>${p.code}</code> · <b>${kind}</b>` +
               (meta.length ? `\n   <i>${meta.join(' · ')}</i>` : '');
      }).join('\n\n');

    await tgSend(chatId, text, env);
  } catch (e) {
    console.error('cmdPromos', e);
    await tgSend(chatId, '❌ Ошибка', env);
  }
}

async function handleCommand(text, chatId, env) {
  if (!isAdmin(chatId, env)) {
    return tgSend(chatId, '❌ У вас нет доступа к панели управления', env);
  }

  const cmd = (text.split(' ')[0] || '').toLowerCase().replace(/@[^\s]+$/, '');

  switch (cmd) {
    case '/start':
    case '/help':     return cmdStart(chatId, env);
    case '/id':       return cmdId(chatId, env);
    case '/stats':    return cmdStats(chatId, env);
    case '/orders':   return cmdOrders(chatId, env);
    case '/bookings': return cmdBookings(chatId, env);
    case '/reviews':  return cmdReviews(chatId, env);
    case '/promos':   return cmdPromos(chatId, env);
    default:
      return tgSend(chatId, `🤔 Неизвестная команда. Попробуйте /help`, env);
  }
}

/* =========================================================
   TELEGRAM — обработка inline-кнопок
   ========================================================= */
async function handleCallback(data, chatId, messageId, callbackId, fromUser, env, originalText) {
  if (!isAdmin(chatId, env)) {
    return tgAnswerCallback(callbackId, '❌ Нет доступа', env, true);
  }

  const [entity, action, idStr] = data.split(':');
  const id = Number(idStr);
  if (!id || !Number.isInteger(id)) {
    return tgAnswerCallback(callbackId, 'Некорректный ID', env, true);
  }

  const who = operatorLine(fromUser);

  try {
    if (entity === 'order') {
      const newStatus = ORDER_ACTION_TO_STATUS[action];
      if (!newStatus) return tgAnswerCallback(callbackId, 'Неизвестное действие', env, true);

      const row = await env.DB.prepare(`SELECT status, name, total FROM orders WHERE id = ?1`).bind(id).first();
      if (!row) return tgAnswerCallback(callbackId, `Заказ #${id} не найден`, env, true);

      if (row.status === newStatus) return tgAnswerCallback(callbackId, `Уже «${ORDER_LABELS[newStatus]}»`, env, true);
      if (['done', 'cancelled'].includes(row.status)) return tgAnswerCallback(callbackId, `Заказ уже ${ORDER_LABELS[row.status]}`, env, true);

      await env.DB.prepare(`UPDATE orders SET status = ?1 WHERE id = ?2`).bind(newStatus, id).run();

      const header = `🍽 <b>Заказ #${id}</b> · ${ORDER_LABELS[newStatus]}`;
      const newText = replaceHeader(originalText, header);
      const kb = buildOrderKeyboard(id, newStatus);
      const editOpts = kb ? { reply_markup: { inline_keyboard: kb } } : { reply_markup: { inline_keyboard: [] } };
      await tgEdit(chatId, messageId, newText, env, editOpts);

      await notifyLog(
        `🍽 <b>Заказ #${id}</b> · ${row.name} · ${row.total} ₽\n` +
        `Статус: ${ORDER_LABELS[row.status]} → <b>${ORDER_LABELS[newStatus]}</b>\n` +
        `Изменил: ${who}\n🕐 ${nowMSK()} МСК`,
        env
      );
      return tgAnswerCallback(callbackId, `✅ ${ORDER_LABELS[newStatus]}`, env);
    }

    if (entity === 'booking') {
      const newStatus = BOOKING_ACTION_TO_STATUS[action];
      if (!newStatus) return tgAnswerCallback(callbackId, 'Неизвестное действие', env, true);

      const row = await env.DB.prepare(`SELECT status, name, date, time, guests FROM bookings WHERE id = ?1`).bind(id).first();
      if (!row) return tgAnswerCallback(callbackId, `Бронь #${id} не найдена`, env, true);

      if (row.status === newStatus) return tgAnswerCallback(callbackId, `Уже «${BOOKING_LABELS[newStatus]}»`, env, true);
      if (['done', 'cancelled'].includes(row.status)) return tgAnswerCallback(callbackId, `Бронь уже ${BOOKING_LABELS[row.status]}`, env, true);

      await env.DB.prepare(`UPDATE bookings SET status = ?1 WHERE id = ?2`).bind(newStatus, id).run();

      const header = `📅 <b>Бронь #${id}</b> · ${BOOKING_LABELS[newStatus]}`;
      const newText = replaceHeader(originalText, header);
      const kb = buildBookingKeyboard(id, newStatus);
      const editOpts = kb ? { reply_markup: { inline_keyboard: kb } } : { reply_markup: { inline_keyboard: [] } };
      await tgEdit(chatId, messageId, newText, env, editOpts);

      await notifyLog(
        `📅 <b>Бронь #${id}</b> · ${row.name}\n` +
        `${row.date} в ${row.time} · ${row.guests} гостей\n` +
        `Статус: ${BOOKING_LABELS[row.status]} → <b>${BOOKING_LABELS[newStatus]}</b>\n` +
        `Изменил: ${who}\n🕐 ${nowMSK()} МСК`,
        env
      );
      return tgAnswerCallback(callbackId, `✅ ${BOOKING_LABELS[newStatus]}`, env);
    }

    if (entity === 'review') {
      const row = await env.DB.prepare(`SELECT approved, name, rating FROM reviews WHERE id = ?1`).bind(id).first();
      if (!row) return tgAnswerCallback(callbackId, `Отзыв #${id} не найден`, env, true);

      let newApproved = row.approved;
      let actionLabel = '';

      if (action === 'hide') {
        if (row.approved === 0) return tgAnswerCallback(callbackId, 'Уже скрыт', env, true);
        newApproved = 0; actionLabel = '🚫 скрыт';
        await env.DB.prepare(`UPDATE reviews SET approved = 0 WHERE id = ?1`).bind(id).run();
      } else if (action === 'show') {
        if (row.approved === 1) return tgAnswerCallback(callbackId, 'Уже опубликован', env, true);
        newApproved = 1; actionLabel = '👁 опубликован';
        await env.DB.prepare(`UPDATE reviews SET approved = 1 WHERE id = ?1`).bind(id).run();
      } else if (action === 'delete') {
        await env.DB.prepare(`DELETE FROM reviews WHERE id = ?1`).bind(id).run();
        const header = `⭐ <b>Отзыв #${id}</b> · 🗑 удалён`;
        const newText = replaceHeader(originalText, header);
        await tgEdit(chatId, messageId, newText, env, { reply_markup: { inline_keyboard: [] } });
        await notifyLog(
          `⭐ <b>Отзыв #${id}</b> · ${row.name} · ${row.rating}/5\n` +
          `Действие: <b>🗑 удалён</b>\nИзменил: ${who}\n🕐 ${nowMSK()} МСК`,
          env
        );
        return tgAnswerCallback(callbackId, '🗑 Удалён', env);
      } else {
        return tgAnswerCallback(callbackId, 'Неизвестное действие', env, true);
      }

      const header = `⭐ <b>Отзыв #${id}</b> · ${newApproved ? 'опубликован' : 'скрыт'}`;
      const newText = replaceHeader(originalText, header);
      const kb = buildReviewKeyboard(id, newApproved);
      const editOpts = kb ? { reply_markup: { inline_keyboard: kb } } : { reply_markup: { inline_keyboard: [] } };
      await tgEdit(chatId, messageId, newText, env, editOpts);

      await notifyLog(
        `⭐ <b>Отзыв #${id}</b> · ${row.name} · ${row.rating}/5\n` +
        `Действие: <b>${actionLabel}</b>\nИзменил: ${who}\n🕐 ${nowMSK()} МСК`,
        env
      );
      return tgAnswerCallback(callbackId, `✅ ${actionLabel}`, env);
    }

    return tgAnswerCallback(callbackId, 'Неизвестная сущность', env, true);
  } catch (e) {
    console.error('handleCallback', e);
    return tgAnswerCallback(callbackId, '❌ Ошибка', env, true);
  }
}

/* =========================================================
   Telegram webhook
   ========================================================= */
async function handleTelegramWebhook(request, env) {
  const secret = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (env.TELEGRAM_WEBHOOK_SECRET && secret !== env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('Forbidden', { status: 403 });
  }

  const update = await request.json().catch(() => null);
  if (!update) return new Response('Bad Request', { status: 400 });

  try {
    if (update.message && update.message.text) {
      await handleCommand(update.message.text, update.message.chat.id, env);
    } else if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat?.id;
      const messageId = cq.message?.message_id;
      const fromUser = {
        id: cq.from?.id,
        name: [cq.from?.first_name, cq.from?.last_name].filter(Boolean).join(' ') || 'Админ',
        username: cq.from?.username || '',
      };
      if (chatId && messageId && cq.data) {
        await handleCallback(cq.data, chatId, messageId, cq.id, fromUser, env, cq.message?.text || '');
      }
    }
  } catch (e) {
    console.error('webhook handler error', e);
  }

  return new Response('OK', { status: 200 });
}

/* =========================================================
   ROUTER
   ========================================================= */
async function handle(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors(request.headers.get('Origin'), env) });
  }

  const h = cors(request.headers.get('Origin'), env);

  if (pathname === '/telegram-webhook' && request.method === 'POST') {
    return handleTelegramWebhook(request, env);
  }

  /* --- GET /menu --- */
  if (pathname === '/menu' && request.method === 'GET') {
    try {
      const { results } = await env.DB.prepare(
        'SELECT id, cat, title, comp, weight, price, img FROM menu_items WHERE available = 1 ORDER BY sort, id'
      ).all();
      return json({ items: results }, 200, h);
    } catch {
      return json({ items: [] }, 200, h);
    }
  }

  /* --- POST /promo-check --- */
  if (pathname === '/promo-check' && request.method === 'POST') {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!rateLimit(ip, 10, 60_000)) return json({ error: 'Слишком много попыток' }, 429, h);

    const body = await request.json().catch(() => null);
    if (!body) return json({ error: 'Некорректный JSON' }, 400, h);

    const { code, subtotal } = body;
    if (!V.str(code, 1, 50)) return json({ error: 'Введите промокод' }, 400, h);
    const sub = Number(subtotal) | 0;
    if (sub < 0) return json({ error: 'Некорректная сумма' }, 400, h);

    const promo = await findPromo(env, code);
    const result = checkPromo(promo, sub);
    if (!result.ok) return json({ error: result.error }, 400, h);

    return json(result, 200, h);
  }

  /* --- POST /order --- */
  if (pathname === '/order' && request.method === 'POST') {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!rateLimit(ip, 5, 60_000)) return json({ error: 'Слишком много запросов' }, 429, h);

    const body = await request.json().catch(() => null);
    if (!body) return json({ error: 'Некорректный JSON' }, 400, h);

    const { name, phone, delivery, address, comment = '', items, total, promocode = '' } = body;
    if (!V.str(name, 2, 60)) return json({ error: 'Некорректное имя' }, 400, h);
    if (!V.phone(phone)) return json({ error: 'Некорректный телефон' }, 400, h);
    if (!['delivery', 'pickup'].includes(delivery)) return json({ error: 'Способ получения' }, 400, h);
    if (delivery === 'delivery' && !V.str(address, 5, 200)) return json({ error: 'Укажите адрес' }, 400, h);
    if (!Array.isArray(items) || !items.length || items.length > 50) return json({ error: 'Пустая корзина' }, 400, h);

    const cleanItems = items.map((i) => ({
      id: Number(i.id) | 0,
      title: String(i.title).slice(0, 120),
      price: Number(i.price) | 0,
      qty: Math.min(Math.max(Number(i.qty) | 0, 1), 20),
    }));

    // Пересчитываем subtotal на сервере — не доверяем клиенту
    const subtotal = cleanItems.reduce((s, i) => s + i.price * i.qty, 0);

    // Проверяем промокод
    let discount = 0;
    let appliedCode = '';
    let promoDescription = '';
    let usedPromoId = null;

    if (promocode) {
      const promo = await findPromo(env, String(promocode));
      const check = checkPromo(promo, subtotal);
      if (check.ok) {
        discount = check.discount;
        appliedCode = check.code;
        promoDescription = check.description;
        usedPromoId = promo.id;
      }
      // Если промокод не сработал — молча игнорируем, заказ всё равно создаётся
    }

    const finalTotal = Math.max(0, subtotal - discount);

    const { success, meta } = await env.DB.prepare(
      `INSERT INTO orders (name, phone, delivery, address, comment, items, total, subtotal, promocode, discount)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
    ).bind(
      name.trim(), phone.trim(), delivery,
      delivery === 'delivery' ? address.trim() : '',
      String(comment).slice(0, 300),
      JSON.stringify(cleanItems),
      finalTotal,
      subtotal,
      appliedCode,
      discount
    ).run();

    if (!success) return json({ error: 'Ошибка сохранения' }, 500, h);

    // Списываем использование промокода
    if (usedPromoId) {
      try {
        await env.DB.prepare(
          `UPDATE promocodes SET uses_left = uses_left - 1 WHERE id = ?1 AND uses_left IS NOT NULL`
        ).bind(usedPromoId).run();
      } catch (e) {
        console.error('promo uses_left update', e);
      }
    }

    const orderId = meta?.last_row_id || '—';
    const itemsText = cleanItems.map((i) => `• ${i.title} × ${i.qty} = ${i.price * i.qty} ₽`).join('\n');
    const promoLine = appliedCode
      ? `\n🎟 Промокод: <b>${appliedCode}</b> · ${promoDescription}\n💵 Подытог: ${subtotal} ₽\n💸 Скидка: −${discount} ₽\n`
      : '';
    const keyboard = buildOrderKeyboard(orderId, 'new');

    await notify(
      `🍽 <b>Заказ #${orderId}</b> · ${ORDER_LABELS.new}\n\n` +
      `👤 ${name}\n📞 ${phone}\n` +
      `🚚 ${delivery === 'delivery' ? 'Доставка: ' + address : 'Самовывоз'}\n` +
      (comment ? `💬 ${comment}\n` : '') +
      `\n${itemsText}\n` +
      promoLine +
      `\n<b>Итого: ${finalTotal} ₽</b>`,
      env,
      { reply_markup: { inline_keyboard: keyboard } }
    );

    await notifyLog(
      `🆕 <b>Новый заказ #${orderId}</b> · ${finalTotal} ₽\n` +
      `👤 ${name} · 📞 ${phone}\n` +
      `🚚 ${delivery === 'delivery' ? 'Доставка' : 'Самовывоз'}\n` +
      (appliedCode ? `🎟 ${appliedCode} · −${discount} ₽\n` : '') +
      `🕐 ${nowMSK()} МСК`,
      env
    );

    return json({ ok: true, id: orderId, subtotal, discount, total: finalTotal, promocode: appliedCode }, 200, h);
  }

  /* --- POST /booking --- */
  if (pathname === '/booking' && request.method === 'POST') {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!rateLimit(ip, 5, 60_000)) return json({ error: 'Слишком много запросов' }, 429, h);

    const body = await request.json().catch(() => null);
    if (!body) return json({ error: 'Некорректный JSON' }, 400, h);

    const { name, phone, date, time, guests, comment = '' } = body;
    if (!V.str(name, 2, 60)) return json({ error: 'Некорректное имя' }, 400, h);
    if (!V.phone(phone)) return json({ error: 'Некорректный телефон' }, 400, h);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'Некорректная дата' }, 400, h);
    if (!/^\d{2}:\d{2}$/.test(time)) return json({ error: 'Некорректное время' }, 400, h);
    const hh = Number(time.slice(0, 2));
    if (hh < 10 || hh > 23) return json({ error: 'Время вне часов работы' }, 400, h);
    if (!V.int(guests, 1, 20)) return json({ error: 'Кол-во гостей 1–20' }, 400, h);

    const { success, meta } = await env.DB.prepare(
      `INSERT INTO bookings (name, phone, date, time, guests, comment)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
    ).bind(name.trim(), phone.trim(), date, time, guests, String(comment).slice(0, 300)).run();

    if (!success) return json({ error: 'Ошибка сохранения' }, 500, h);

    const id = meta?.last_row_id || '—';
    const keyboard = buildBookingKeyboard(id, 'new');

    await notify(
      `📅 <b>Бронь #${id}</b> · ${BOOKING_LABELS.new}\n\n` +
      `👤 ${name}\n📞 ${phone}\n` +
      `🗓 ${date} в ${time}\n👥 Гостей: ${guests}\n` +
      (comment ? `💬 ${comment}` : ''),
      env,
      { reply_markup: { inline_keyboard: keyboard } }
    );

    await notifyLog(
      `🆕 <b>Новая бронь #${id}</b>\n` +
      `👤 ${name} · 📞 ${phone}\n` +
      `🗓 ${date} в ${time} · ${guests} гостей\n` +
      `🕐 ${nowMSK()} МСК`,
      env
    );

    return json({ ok: true, id }, 200, h);
  }

  /* --- POST /review --- */
  if (pathname === '/review' && request.method === 'POST') {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!rateLimit(ip, 3, 300_000)) return json({ error: 'Слишком много отзывов' }, 429, h);

    const body = await request.json().catch(() => null);
    if (!body) return json({ error: 'Некорректный JSON' }, 400, h);

    const { name, text, rating } = body;
    if (!V.str(name, 2, 60)) return json({ error: 'Некорректное имя' }, 400, h);
    if (!V.str(text, 10, 800)) return json({ error: 'Отзыв 10–800 символов' }, 400, h);
    if (!V.int(rating, 1, 5)) return json({ error: 'Оценка 1–5' }, 400, h);

    const { success, meta } = await env.DB.prepare(
      `INSERT INTO reviews (name, text, rating, approved) VALUES (?1, ?2, ?3, 1)`
    ).bind(name.trim(), text.trim(), rating).run();

    if (!success) return json({ error: 'Ошибка сохранения' }, 500, h);

    const id = meta?.last_row_id || '—';
    const keyboard = buildReviewKeyboard(id, 1);

    await notify(
      `⭐ <b>Отзыв #${id}</b> · опубликован\n\n` +
      `👤 ${name}\nОценка: ${rating}/5\n\n${text}`,
      env,
      { reply_markup: { inline_keyboard: keyboard } }
    );

    await notifyLog(
      `🆕 <b>Новый отзыв #${id}</b> · ${name} · ${rating}/5\n` +
      `<i>${text.slice(0, 150)}${text.length > 150 ? '…' : ''}</i>\n` +
      `🕐 ${nowMSK()} МСК`,
      env
    );

    return json({ ok: true, id }, 200, h);
  }

  /* --- GET /reviews --- */
  if (pathname === '/reviews' && request.method === 'GET') {
    const { results } = await env.DB.prepare(
      `SELECT id, name, text, rating, created_at FROM reviews
       WHERE approved = 1 ORDER BY created_at DESC`
    ).all();
    return json({ items: results }, 200, h);
  }

  return json({ error: 'Not Found' }, 404, h);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (e) {
      console.error('Worker error', e);
      return json({ error: 'Internal error' }, 500);
    }
  },
};