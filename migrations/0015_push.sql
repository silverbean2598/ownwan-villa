-- 휴대폰 푸시 알림 (Web Push, VAPID) [확정 — 기획자 결정, 2026-11-20]
-- 기기 하나가 알림을 켜면 그 기기의 구독(endpoint · 공개키 p256dh · auth)을 사용자에 묶어 저장한다.
-- endpoint 는 기기마다 하나라 UNIQUE: 같은 기기에서 다른 계정으로 다시 켜면 그 계정으로 옮겨 간다.
-- 푸시 서비스가 404/410 으로 답하면(기기에서 알림을 끔 · 앱 삭제) 그 행을 지운다. 로그아웃하면 그 기기 행을, 탈퇴하면 모두 지운다.
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_ok_at INTEGER
);
CREATE INDEX push_subscriptions_user ON push_subscriptions(user_id);

-- 알림 종류별 켜고 끄기 (행이 없으면 모두 켜짐). 1 = 켬, 0 = 끔
--   cheer: 응원 · 댓글 / villa: 빌라 소식(입주 · 층 오름 · 펜트하우스 · 축하) / apply: 입주 신청 · 대결 / reminder: 저녁 9시 운동 알림
CREATE TABLE push_prefs (
  user_id TEXT PRIMARY KEY,
  cheer INTEGER NOT NULL DEFAULT 1,
  villa INTEGER NOT NULL DEFAULT 1,
  apply INTEGER NOT NULL DEFAULT 1,
  reminder INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

-- 보낸 기록: 사람 · 종류마다 10분에 한 번만 보내고(몰아치지 않게), 저녁 알림은 하루 한 번만. 매일 밤 크론이 2일 지난 줄을 지운다
CREATE TABLE push_log (
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  sent_at INTEGER NOT NULL
);
CREATE INDEX push_log_user_cat ON push_log(user_id, category, sent_at);
CREATE INDEX push_log_sent ON push_log(sent_at);
