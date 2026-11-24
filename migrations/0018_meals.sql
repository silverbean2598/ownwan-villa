-- 식당(식단 공유) [확정 — 기획자 결정, 2026-11-24]
-- 오운완 인증(certs)과 따로 둔다: 방 불 · 연속 기록 · 층 · 집값 · 배지에 쓰이지 않는다.
-- 새 테이블만 더하므로 운영 데이터에 그대로 적용해도 안전하다.

-- 식단 한 끼. 사진 원본은 인증 사진과 같은 저장소(storage.ts)에 식단 id 로 둔다 (D1: photo_blobs_b64.cert_id = 식단 id, R2: r2_key)
-- 지우면 행을 남긴다(deleted_at): 그날 받은 포인트 계산에 계속 쓰인다.
-- points: 올릴 때 받은 포인트, refunded: 지울 때 되돌린(빼낸) 포인트. 그날 상한은 SUM(points - refunded) 로 센다
CREATE TABLE meals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'snack', 'dinner', 'late')),
  r2_key TEXT,
  dhash TEXT,
  memo TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  refunded INTEGER NOT NULL DEFAULT 0,
  duplicate INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX meals_user_day ON meals(user_id, day);

-- 식단 ↔ 아파트: 올릴 때 고른 아파트에만 보인다 (작성자와 보는 사람이 둘 다 지금 그 아파트에 살 때)
CREATE TABLE meal_villas (
  meal_id TEXT NOT NULL,
  villa_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (meal_id, villa_id)
);
CREATE INDEX meal_villas_villa ON meal_villas(villa_id, meal_id);

-- 식단 응원(하트, 사람당 1개) · 댓글. 댓글 하루 개수 제한은 인증 댓글과 같은 comment_log 로 함께 센다
CREATE TABLE meal_cheers (
  meal_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY (meal_id, user_id)
);
CREATE TABLE meal_comments (
  id TEXT PRIMARY KEY, meal_id TEXT NOT NULL, user_id TEXT NOT NULL,
  body TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX meal_comments_meal ON meal_comments(meal_id, created_at);
CREATE INDEX meal_comments_user ON meal_comments(user_id, created_at);
