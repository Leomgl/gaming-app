-- Gaming push notifications V0.5. No game names, costs, notes, locations or season numbers in D1.
CREATE TABLE IF NOT EXISTS push_devices (
 device_id TEXT PRIMARY KEY,
 token_hash TEXT NOT NULL,
 endpoint TEXT NOT NULL,
 p256dh TEXT NOT NULL,
 auth TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 last_test INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS push_jobs (
 device_id TEXT NOT NULL REFERENCES push_devices(device_id) ON DELETE CASCADE,
 job_id TEXT NOT NULL,
 milestone TEXT NOT NULL CHECK(milestone IN ('mid','14d','7d')),
 fire_at INTEGER NOT NULL,
 delivered_at INTEGER,
 PRIMARY KEY(device_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_gaming_push_due ON push_jobs(delivered_at,fire_at);
CREATE INDEX IF NOT EXISTS idx_gaming_push_device ON push_jobs(device_id);
