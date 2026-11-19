/** 도시 지도: 서버(GET /api/city)가 보내고 화면이 그리는 빌라 한 채. 다른 빌라 입주민의 사진 · 루틴 · 목록 · id 는 없다 */
export type CityVilla = {
  id: string;
  name: string;
  /** 지도 자리 번호 (처음 공개할 때 받고 해체 전까지 그대로) */
  slot: number;
  /** 가장 높은 층 (빌라 화면과 같은 기준: 오늘 7일째를 채우면 바로 한 층 위) */
  topFloor: number;
  memberCount: number;
  /** 오늘 인증한 입주민 수 = 불 켜진 창문 수 */
  litCount: number;
  penthouseNickname: string | null;
};

/** 내 빌라: 지도에 있는지(public), 내가 방장인지 */
export type CityMine = { villaId: string; public: boolean; isOwner: boolean };

export type CityResponse = { mine: CityMine | null; villas: CityVilla[] };

/** 지도에 한 번에 보내는 빌라 수 (자리 번호 순) */
export const CITY_LIMIT = 200;
