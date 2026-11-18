-- 축하 · 알림 화면: 사용자에게 보여 줄 일(층 오름, 펜트하우스 입주 등)을 쌓아 두고, 화면에 보여 주면 seen_at 을 채운다
CREATE TABLE events (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, seen_at INTEGER
);
CREATE INDEX events_user_seen ON events(user_id, seen_at);
