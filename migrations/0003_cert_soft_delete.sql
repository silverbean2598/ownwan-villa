-- 지운 기록은 행을 남긴다(소프트 삭제): 같은 날 사진 순번 · 루틴 하루 1회 · 중복 사진 판정에 계속 쓰여 포인트 반복 획득을 막는다
ALTER TABLE certs ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
-- 방장 확인 요청: 승인될 때 요청자가 살던 빌라. 완료 시 같은 빌라에 아직 살아야 한다
ALTER TABLE recovery_requests ADD COLUMN villa_id TEXT;
