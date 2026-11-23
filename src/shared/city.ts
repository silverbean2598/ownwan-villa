import type { CityRecruit, MyApplication } from "./recruit";
import type { Trophy } from "./price";
import type { VillaKind } from "./villa";

/** 도시 지도: 서버(GET /api/city)가 보내고 화면이 그리는 아파트 한 채. 다른 아파트 입주민의 사진 · 루틴 · 목록 · id 는 없다 */
export type CityVilla = {
  id: string;
  name: string;
  /** 지도 자리 번호 (처음 공개할 때 받고 해체 전까지 그대로) */
  slot: number;
  /** 가장 높은 층 (아파트 화면과 같은 기준: 오늘 7일째를 채우면 바로 한 층 위) */
  topFloor: number;
  memberCount: number;
  /** 건물 종류 · 정원 (예전 서버 응답에는 없다 → 아파트 · 20명). 타워팰리스는 지도에서 높은 타워팰리스 건물로 그린다 */
  kind?: VillaKind;
  capacity?: number;
  /** 오늘 인증한 입주민 수 = 불 켜진 창문 수 */
  litCount: number;
  penthouseNickname: string | null;
  /** 빈방 모집 중일 때만 (공개 · 모집 켬 · 빈방 있음). 모집 글과 빈방 수만 담는다 */
  recruit?: CityRecruit;
  /** 집값 (0.1억 단위, 마지막으로 정산한 날). 아직 집계 전이면 null. 예전 서버 응답에는 없다 */
  price?: number | null;
  /** 전날보다 얼마나 (전날 값이 없으면 null) */
  priceChange?: number | null;
  /** 가장 최근 주간 리그 1 · 2 · 3위 */
  trophy?: Trophy;
  /** 7일 안에 1:1 대결에서 이겼다 */
  battleWin?: boolean;
  /** 대결 중이거나 신청이 오가는 중 */
  inBattle?: boolean;
};

/** 내 아파트: 지도에 있는지(public), 내가 방장인지 */
export type CityMine = { villaId: string; name: string; public: boolean; isOwner: boolean; /** 대결 중이거나 신청이 오가는 중 */ inBattle?: boolean; /** 지금 입주민 수 */ memberCount?: number };

/**
 * myVillas: 내가 사는 아파트 모두 (입주한 순서). 지도에서 모두 "우리 아파트"로 표시한다.
 * mine: 예전 화면(배포 전에 열어 둔 탭)용, myVillas 의 첫 번째
 */
export type CityResponse = {
  mine: CityMine | null;
  myVillas: CityMine[];
  villas: CityVilla[];
  /** 내가 보낸, 아직 기다리는 입주 신청 (없으면 null). 예전 서버 응답에는 없다 */
  myApplication?: MyApplication | null;
};

/** 지도에 한 번에 보내는 아파트 수 (자리 번호 순) */
export const CITY_LIMIT = 200;
