-- 응원 · 댓글: 같은 빌라 입주민의 인증 기록에 하트(사람당 1개)와 짧은 댓글을 남긴다
CREATE TABLE cheers (
  cert_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER NOT NULL,
  PRIMARY KEY (cert_id, user_id)
);
CREATE TABLE comments (
  id TEXT PRIMARY KEY, cert_id TEXT NOT NULL, user_id TEXT NOT NULL,
  body TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE INDEX comments_cert ON comments(cert_id, created_at);
-- 하루 댓글 수 제한 · 탈퇴 정리용
CREATE INDEX comments_user ON comments(user_id, created_at);
