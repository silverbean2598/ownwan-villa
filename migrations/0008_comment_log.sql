-- 댓글 하루 개수 제한: 지운 댓글도 센다 (지우고 다시 써서 제한 · 알림을 늘리지 못하게). 댓글을 지워도 이 기록은 남는다
CREATE TABLE comment_log (user_id TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX comment_log_user ON comment_log(user_id, created_at);
INSERT INTO comment_log (user_id, created_at) SELECT user_id, created_at FROM comments;
