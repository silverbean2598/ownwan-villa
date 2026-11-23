/** 오늘 인증 = 그날 지우지 않은, 중복 아닌 사진이 있다 (certs 행 조건) */
export const CERTIFIED_PHOTO = "kind = 'photo' AND duplicate = 0 AND deleted = 0";

/**
 * 그 아파트에 올린 인증 사진이 그날 있다 (아파트마다 불 · 층 · 펜트하우스 · 도시 불 켜진 창).
 * 인자는 SQL 식(바깥 쿼리의 열이나 ? 자리). 안쪽 별칭은 ic(기록) · icv(기록 ↔ 아파트)
 */
export const certifiedInVilla = (user: string, day: string, villa: string) =>
  `EXISTS (SELECT 1 FROM certs ic JOIN cert_villas icv ON icv.cert_id = ic.id AND icv.villa_id = ${villa}
    WHERE ic.user_id = ${user} AND ic.day = ${day} AND ic.kind = 'photo' AND ic.duplicate = 0 AND ic.deleted = 0)`;

/** 그날 그 아파트에 처음 사진 인증이 올라간 시각 (나중에 올렸으면 올린 시각). 오늘 올라간 층의 "도달 시각"으로 쓴다 */
export const firstCertInVilla = (user: string, day: string, villa: string) =>
  `(SELECT MIN(MAX(ic.created_at, icv.created_at)) FROM certs ic JOIN cert_villas icv ON icv.cert_id = ic.id AND icv.villa_id = ${villa}
    WHERE ic.user_id = ${user} AND ic.day = ${day} AND ic.kind = 'photo' AND ic.duplicate = 0 AND ic.deleted = 0)`;

/** from ~ to(KST 날짜, 둘 다 포함) 동안 그 아파트에 사진 인증을 올린 날 수 (집값). 안쪽 별칭은 dc · dcv */
export const certDaysInVilla = (user: string, from: string, to: string, villa: string) =>
  `(SELECT COUNT(DISTINCT dc.day) FROM certs dc JOIN cert_villas dcv ON dcv.cert_id = dc.id AND dcv.villa_id = ${villa}
    WHERE dc.user_id = ${user} AND dc.day BETWEEN ${from} AND ${to} AND dc.kind = 'photo' AND dc.duplicate = 0 AND dc.deleted = 0)`;
