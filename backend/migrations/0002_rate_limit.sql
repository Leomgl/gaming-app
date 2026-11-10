-- Registration abuse controls: hashed IP/day key only; no raw IP retained.
CREATE TABLE IF NOT EXISTS push_register_rate(
 day_key TEXT PRIMARY KEY,
 count INTEGER NOT NULL CHECK(count BETWEEN 1 AND 20),
 updated_at INTEGER NOT NULL
);
