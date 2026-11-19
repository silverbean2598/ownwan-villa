-- 빈방 모집 · 입주 신청 [확정 — 기획자 결정, 2026-11-19]
-- 새 표 두 개만 만든다 (지금 있는 표 · 행은 건드리지 않는다)

-- 1) 빌라마다 모집 글 하나: 켜짐(open) · 한 줄 소개(60자) · 원하는 종목(shared/sports.ts 의 종목 id JSON 배열, 비면 종목 상관없음)
--    모집은 도시 지도에 공개한 빌라만 켤 수 있고, 정원(20명)이 차면 서버가 끈다
CREATE TABLE IF NOT EXISTS villa_recruits (
  villa_id TEXT PRIMARY KEY,
  open INTEGER NOT NULL DEFAULT 0,
  intro TEXT NOT NULL DEFAULT '',
  sports TEXT NOT NULL DEFAULT '[]',
  updated_at INTEGER NOT NULL
);

-- 2) 입주 신청. status: pending(기다리는 중) → approved / rejected / cancelled / expired
--    reason: 왜 끝났는지 (신청자 취소, 모집 끔, 빌라 꽉 참, 해체, 내보냄, 3곳 제한 등. 화면 문구 · 기록용)
--    7일이 지난 pending 은 읽을 때 만료로 보고, 매일 크론이 expired 로 바꾼다
CREATE TABLE IF NOT EXISTS villa_applications (
  id TEXT PRIMARY KEY,
  villa_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','cancelled','expired')),
  reason TEXT,
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);
-- 한 사람은 한 번에 한 곳에만 기다리는 신청을 둔다 (동시에 두 곳에 신청해도 하나만 들어간다)
CREATE UNIQUE INDEX IF NOT EXISTS villa_applications_one_pending ON villa_applications(user_id) WHERE status = 'pending';
-- 방장이 받은 신청 목록 · 빌라 일로 한꺼번에 취소할 때
CREATE INDEX IF NOT EXISTS villa_applications_villa ON villa_applications(villa_id, status, created_at);
-- 크론 만료 처리 · 오래된 기록 지우기
CREATE INDEX IF NOT EXISTS villa_applications_status ON villa_applications(status, created_at);
