-- R2를 켜기 전까지 사진 원본을 D1에 둔다 (PHOTO_STORAGE = "d1")
CREATE TABLE photo_blobs (cert_id TEXT PRIMARY KEY, data BLOB NOT NULL, content_type TEXT NOT NULL);
