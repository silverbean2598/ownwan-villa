-- 아파트 승격 [제안 — 기획자 확인 필요, 2026-11-20]
-- 빌라마다 종류(kind)와 정원(capacity)을 둔다. 열 두 개만 더하고, 지금 있는 행은 기본값(빌라 · 20명)이 되어 지금과 똑같이 움직인다.
-- 정원이 다 찬 빌라는 방장이 아파트(정원 50명)로 바꿀 수 있다. 한 번 바꾸면 되돌릴 수 없다 (서버가 kind = 'villa' 일 때만 바꾼다)
-- 배포 순서: 이 마이그레이션이 먼저 적용되고 새 서버가 나간다. 그 사이 예전 서버는 이 열을 모르고, 새로 짓는 빌라는 기본값을 받는다
ALTER TABLE villas ADD COLUMN kind TEXT NOT NULL DEFAULT 'villa';
ALTER TABLE villas ADD COLUMN capacity INTEGER NOT NULL DEFAULT 20;
