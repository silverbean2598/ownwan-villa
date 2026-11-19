-- 여러 빌라에 살기 [확정 — 기획자 결정, 2026-11-19]
-- 한 사람이 빌라 3곳까지 산다. 인증은 고른 빌라에만 올라가고, 층 · 연속 기록(층 계산용)은 빌라마다 따로 센다.

-- 1) 인증 기록 ↔ 빌라: 한 기록이 여러 빌라에 올라갈 수 있다. 기록을 지우면(certs.deleted = 1) 모든 빌라에서 사라진다
CREATE TABLE IF NOT EXISTS cert_villas (
  cert_id TEXT NOT NULL, villa_id TEXT NOT NULL,
  -- 이 빌라에 올라간 시각 (나중에 "다른 빌라에도 올리기"를 하면 그 시각). 펜트하우스 "그 층에 먼저 도달한 사람" 비교에 쓴다
  created_at INTEGER NOT NULL,
  PRIMARY KEY (cert_id, villa_id)
);
CREATE INDEX IF NOT EXISTS cert_villas_villa ON cert_villas(villa_id, cert_id);

-- 2) 지금까지의 기록은 "지금 사는 빌라"에 올린 것으로 옮긴다. 지금까지는 같은 빌라 입주민이면 그 사람의 모든 기록을 봤으므로
--    이렇게 옮기면 보이는 범위가 그대로다. 빌라가 없는 사람의 기록은 어느 빌라에도 올라가지 않는다(지금처럼 본인만 본다)
INSERT OR IGNORE INTO cert_villas (cert_id, villa_id, created_at)
SELECT c.id, m.villa_id, c.created_at FROM certs c
JOIN memberships m ON m.user_id = c.user_id AND m.left_at IS NULL;

-- 3) 층 계산용 연속 기록 · 쉰 날 수를 입주 기록(빌라마다)에 둔다. 지금 사는 빌라는 사용자 값을 그대로 가져와 층이 지금과 똑같이 움직인다
ALTER TABLE memberships ADD COLUMN streak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE memberships ADD COLUMN miss_run INTEGER NOT NULL DEFAULT 0;
UPDATE memberships SET
  streak = COALESCE((SELECT u.streak FROM users u WHERE u.id = memberships.user_id), 0),
  miss_run = COALESCE((SELECT u.miss_run FROM users u WHERE u.id = memberships.user_id), 0)
WHERE left_at IS NULL;

-- 4) "빌라 1곳에만" 색인을 "같은 빌라에는 한 번만" 색인으로 바꾼다. 3곳 제한은 입주 · 만들기 문장 안에서 센다
DROP INDEX IF EXISTS one_active_villa;
CREATE UNIQUE INDEX IF NOT EXISTS one_active_membership ON memberships(user_id, villa_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS memberships_villa ON memberships(villa_id, left_at);

-- 5) 안전망: 빌라를 고르지 않고 들어온 기록(배포 사이 몇 초 동안 예전 서버가 올린 기록 등)은 지금 사는 빌라 모두에 올린다.
--    새 서버는 기록을 넣기 전에 고른 빌라 행을 먼저 넣으므로 이 트리거는 아무것도 하지 않는다
CREATE TRIGGER IF NOT EXISTS cert_villas_default AFTER INSERT ON certs
WHEN NOT EXISTS (SELECT 1 FROM cert_villas WHERE cert_id = NEW.id)
BEGIN
  INSERT OR IGNORE INTO cert_villas (cert_id, villa_id, created_at)
  SELECT NEW.id, m.villa_id, NEW.created_at FROM memberships m
  JOIN villas v ON v.id = m.villa_id AND v.dissolved_at IS NULL
  WHERE m.user_id = NEW.user_id AND m.left_at IS NULL;
END;
