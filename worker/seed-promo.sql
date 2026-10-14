INSERT OR IGNORE INTO promocodes (code, discount_percent, min_total, active) VALUES
  ('WELCOME10', 10, 0,    1),
  ('VERANDA20', 20, 1000, 1),
  ('PIZZA15',   15, 500,  1);

INSERT OR IGNORE INTO promocodes (code, discount_amount, min_total, active) VALUES
  ('GIFT300',  300, 1500, 1),
  ('BONUS500', 500, 3000, 1);