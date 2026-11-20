-- 집값 대결 [확정 — 기획자 결정, 2026-11-20]
-- 새 표만 만든다 (지금 있는 표 · 행은 건드리지 않는다)

-- 1) 빌라 집값: 매일 자정 정산 때 그날(KST) 값을 남긴다. price 는 0.1억 단위 정수 (32 = 3.2억)
--    cert_days: 최근 7일 입주민이 이 빌라에 인증한 날의 합, member_count: 그날 센 입주민 수 (리그 동점 정리 · 기록용)
CREATE TABLE IF NOT EXISTS villa_prices (
  villa_id TEXT NOT NULL,
  day TEXT NOT NULL,
  price INTEGER NOT NULL,
  cert_days INTEGER NOT NULL DEFAULT 0,
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (villa_id, day)
);
-- 순위 · 도시: 하루치 값을 한꺼번에 읽는다
CREATE INDEX IF NOT EXISTS villa_prices_day ON villa_prices(day, price);

-- 2) 주간 리그 결과: 일요일 값으로 매긴 순위 (week = 그 주 월요일). 한 주에 빌라마다 한 줄
CREATE TABLE IF NOT EXISTS league_results (
  week TEXT NOT NULL,
  villa_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  price INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (week, villa_id)
);
CREATE INDEX IF NOT EXISTS league_results_rank ON league_results(week, rank);

-- 3) 1:1 대결. status: pending(신청) → active(진행) → finished(끝)
--                           pending → declined(거절) / expired(48시간) / cancelled(신청 취소 · 해체 · 비공개)
--                           active → cancelled(해체 · 비공개 · 집값 없음)
--    바꾸는 문장은 모두 "지금 상태가 무엇일 때만" 조건을 붙인다 (두 번 눌러도 · 크론과 겹쳐도 한 번만 바뀐다)
--    start_day ~ end_day: 받은 다음 날부터 7일 (KST). 이긴 쪽 = (end_day 집값 − start_day 전날 집값) 이 큰 빌라. winner 가 비면 무승부
CREATE TABLE IF NOT EXISTS battles (
  id TEXT PRIMARY KEY,
  challenger_villa_id TEXT NOT NULL,
  opponent_villa_id TEXT NOT NULL,
  challenger_user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','active','finished','declined','expired','cancelled')),
  reason TEXT,
  created_at INTEGER NOT NULL,
  responded_at INTEGER,
  start_day TEXT,
  end_day TEXT,
  challenger_base INTEGER,
  opponent_base INTEGER,
  challenger_end INTEGER,
  opponent_end INTEGER,
  winner_villa_id TEXT,
  finished_at INTEGER,
  CHECK (challenger_villa_id != opponent_villa_id)
);
-- 빌라 하나는 한 번에 대결 하나(신청 중 포함)만. 같은 편끼리는 색인이 막고, 신청 문장이 양쪽 모두를 NOT EXISTS 로 다시 본다
CREATE UNIQUE INDEX IF NOT EXISTS battles_open_challenger ON battles(challenger_villa_id) WHERE status IN ('pending','active');
CREATE UNIQUE INDEX IF NOT EXISTS battles_open_opponent ON battles(opponent_villa_id) WHERE status IN ('pending','active');
CREATE INDEX IF NOT EXISTS battles_status ON battles(status, end_day);
CREATE INDEX IF NOT EXISTS battles_challenger ON battles(challenger_villa_id, created_at);
CREATE INDEX IF NOT EXISTS battles_opponent ON battles(opponent_villa_id, created_at);

-- 4) 보상 장부: 같은 보상(리그 주 · 대결)을 한 사람에게 한 번만 준다. 장부 줄이 새로 들어갔을 때만 포인트를 더한다
CREATE TABLE IF NOT EXISTS price_rewards (
  ref TEXT NOT NULL,
  user_id TEXT NOT NULL,
  villa_id TEXT NOT NULL,
  points INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (ref, user_id)
);
