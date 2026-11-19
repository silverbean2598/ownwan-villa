-- 도시 지도 자리 번호: 빌라를 처음 공개할 때 비어 있는 가장 작은 번호를 받는다.
-- 공개를 껐다 켜도 같은 자리를 지키고, 빌라가 해체되면 비운다(다른 빌라가 쓸 수 있게)
ALTER TABLE villas ADD COLUMN map_slot INTEGER;
CREATE UNIQUE INDEX villas_map_slot ON villas(map_slot) WHERE map_slot IS NOT NULL;
