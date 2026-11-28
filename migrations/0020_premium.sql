-- 프리미엄 상품(돈으로 사는 방 테마) [기획자 결정, 2026-11-25]
-- 포인트로 사는 inventory 와 따로 둔다: 결제 기록과 이어질 자리라서.
-- 새 테이블 · 빈 칸(NULL) 열만 더하므로 운영 데이터에 그대로 적용해도 안전하다.

-- 가진 프리미엄 상품. 한 번 사면 계속 갖는다 (결제 연결 뒤 결제 완료 때 넣는다)
CREATE TABLE premium_owned (
  user_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  bought_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, item_id)
);

-- 지금 켜 둔 방 테마 (없으면 NULL). 가진 테마만 켤 수 있다
ALTER TABLE users ADD COLUMN theme TEXT;
