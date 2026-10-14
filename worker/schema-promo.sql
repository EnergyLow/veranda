-- Промокоды
CREATE TABLE IF NOT EXISTS promocodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  discount_percent INTEGER NOT NULL DEFAULT 0,
  discount_amount INTEGER NOT NULL DEFAULT 0,
  min_total INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  uses_left INTEGER,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_promocodes_code ON promocodes(code);

-- Дополнительные поля в заказах
-- Если команда упадёт с "duplicate column name" — просто игнорируй, всё уже добавлено
ALTER TABLE orders ADD COLUMN subtotal INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN promocode TEXT NOT NULL DEFAULT '';
ALTER TABLE orders ADD COLUMN discount INTEGER NOT NULL DEFAULT 0;