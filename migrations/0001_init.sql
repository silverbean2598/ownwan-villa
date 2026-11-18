CREATE TABLE users (
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, nickname TEXT NOT NULL,
  password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL,
  sport TEXT, avatar TEXT NOT NULL DEFAULT '{}',
  points INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0,
  miss_run INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0, locked_until INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE villas (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL,
  invite_token TEXT UNIQUE NOT NULL, penthouse_user_id TEXT,
  public INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, dissolved_at INTEGER
);
CREATE TABLE memberships (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, villa_id TEXT NOT NULL,
  floor INTEGER NOT NULL DEFAULT 1, floor_reached_at INTEGER NOT NULL,
  joined_at INTEGER NOT NULL, left_at INTEGER
);
CREATE UNIQUE INDEX one_active_villa ON memberships(user_id) WHERE left_at IS NULL;
CREATE TABLE certs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, day TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('photo','routine')),
  r2_key TEXT, dhash TEXT, body TEXT,
  points INTEGER NOT NULL, duplicate INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE INDEX certs_user_day ON certs(user_id, day);
CREATE TABLE recovery_requests (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, approver_id TEXT NOT NULL,
  ticket_hash TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('pending','approved','cancelled','done')),
  approved_at INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE inventory (user_id TEXT NOT NULL, item_id TEXT NOT NULL, PRIMARY KEY (user_id, item_id));
CREATE TABLE placements (user_id TEXT NOT NULL, slot TEXT NOT NULL, item_id TEXT NOT NULL, PRIMARY KEY (user_id, slot));
CREATE TABLE reports (cert_id TEXT NOT NULL, reporter_id TEXT NOT NULL, PRIMARY KEY (cert_id, reporter_id));
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
