-- D1의 BLOB 은 Worker 에서 숫자 배열(JSON)로 읽혀 사진 1장마다 CPU 를 많이 쓴다. base64 TEXT 로 바꾼다.
-- 운영 DB 에는 아직 사진이 없어 옛 테이블은 옮기지 않고 지운다.
DROP TABLE photo_blobs;
CREATE TABLE photo_blobs_b64 (cert_id TEXT PRIMARY KEY, data TEXT NOT NULL, content_type TEXT NOT NULL);
