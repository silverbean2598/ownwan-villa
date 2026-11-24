-- 식단 신고 · 가리기 [확정 — 기획자 결정, 2026-11-24]: 인증 사진 신고(reports · certs.hidden)와 같은 규칙.
-- 같은 아파트 입주민이 남의 식단을 신고할 수 있고(사람당 1번), 3명이 신고하면 식단이 가려진다.
-- 새 테이블 · 열만 더하므로 운영 데이터에 그대로 적용해도 안전하다 (기존 식단은 hidden = 0).
CREATE TABLE meal_reports (meal_id TEXT NOT NULL, reporter_id TEXT NOT NULL, PRIMARY KEY (meal_id, reporter_id));
ALTER TABLE meals ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
