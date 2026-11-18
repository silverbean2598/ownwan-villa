-- 방장이 내보낸 사람: 방장이 풀어 줄 때까지 그 빌라에 다시 입주할 수 없다
CREATE TABLE villa_bans (
  villa_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY (villa_id, user_id)
);
