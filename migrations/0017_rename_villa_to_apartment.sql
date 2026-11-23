-- 서비스 이름 변경(오운완빌라 → 오운완아파트): 사용자가 지은 건물 이름 속 "빌라"를 "아파트"로 바꾼다.
-- 이름 한도(20자)를 넘게 되는 이름은 그대로 둔다.
UPDATE villas SET name = REPLACE(name, '빌라', '아파트')
WHERE name LIKE '%빌라%' AND length(REPLACE(name, '빌라', '아파트')) <= 20;
