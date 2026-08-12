CREATE TABLE media_processing_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_asset_id INTEGER NOT NULL REFERENCES media_assets (id) ON DELETE CASCADE,
  input_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  available_at INTEGER NOT NULL,
  worker_id TEXT,
  lease_expires_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  last_error_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (media_asset_id, input_fingerprint)
);
CREATE INDEX media_processing_jobs_status_available_at_idx ON media_processing_jobs (status, available_at);
