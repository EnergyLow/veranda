-- Кафе «ВерАнда» — схема D1

CREATE TABLE IF NOT EXISTS menu_items (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  cat       TEXT NOT NULL,
  title     TEXT NOT NULL,
  comp      TEXT NOT NULL DEFAULT '',
  weight    TEXT NOT NULL DEFAULT '',
  price     INTEGER NOT NULL,
  img       TEXT NOT NULL DEFAULT '',
  available INTEGER NOT NULL DEFAULT 1,
  sort      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_menu_cat ON menu_items(cat, sort);

CREATE TABLE IF NOT EXISTS orders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  delivery   TEXT NOT NULL CHECK (delivery IN ('delivery','pickup')),
  address    TEXT NOT NULL DEFAULT '',
  comment    TEXT NOT NULL DEFAULT '',
  items      TEXT NOT NULL,
  total      INTEGER NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);

CREATE TABLE IF NOT EXISTS bookings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  phone      TEXT NOT NULL,
  date       TEXT NOT NULL,
  time       TEXT NOT NULL,
  guests     INTEGER NOT NULL,
  comment    TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  text       TEXT NOT NULL,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  approved   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reviews_approved ON reviews(approved, created_at DESC);