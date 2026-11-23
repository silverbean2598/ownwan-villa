import type { CityVilla } from "../../../shared/city";

// ---------- 건물 모양 ----------

/** 그림으로 그리는 최대 층 수. 더 높은 아파트도 이만큼만 그리고 카드에 실제 층을 쓴다 */
export const MAX_STORIES = 14;
/** 이 층 수부터는 타워팰리스처럼 높고 좁은 건물로 그린다 */
export const TALL_FROM = 6;

/** lit: 오늘 인증한 입주민 · dark: 아직 안 한 입주민 · vacant: 입주민 없는 칸(덧문 닫힘) */
export type WindowState = "lit" | "dark" | "vacant";
export type BuildingShape = { stories: number; cols: number; tall: boolean; windows: WindowState[]; /** 타워팰리스로 승격한 건물 (넓고 높은 타워팰리스 모양 + 간판) */ apartment?: boolean };

/** 타워팰리스는 층이 낮아도 최소 이만큼 높게 그린다 (아파트와 한눈에 구별되게) */
export const APARTMENT_MIN_STORIES = 10;

/** 문자열로 정해지는 32비트 수 (FNV-1a). 같은 아파트는 늘 같은 색 · 같은 창문 배치 */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 작은 난수 (같은 seed → 같은 순서) */
function rng(seed: number) {
  let x = seed || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

/**
 * 건물 한 채: 층 수 = 가장 높은 층(최대 MAX_STORIES), 창문은 입주민 한 명에 하나(칸이 모자라면 칸 수까지).
 * 창문 배열은 맨 위 줄부터 왼→오른쪽. 입주민 창문은 아래층부터 채우고, 불 켜진 창문은 seed 로 섞어 고른다.
 */
export function buildingShape(topFloor: number, memberCount: number, litCount: number, seed = 0, apartment = false): BuildingShape {
  const floor = Math.max(1, Math.floor(topFloor) || 1);
  // 타워팰리스: 늘 높은 타워팰리스 모양, 최소 10층 · 한 줄 4~5칸 (50명까지 창문이 모자라지 않게)
  const stories = Math.min(MAX_STORIES, apartment ? Math.max(APARTMENT_MIN_STORIES, floor) : floor);
  const tall = apartment || stories >= TALL_FROM;
  const cols = apartment ? Math.min(5, Math.max(4, Math.ceil(memberCount / stories))) : Math.min(4, Math.max(3, Math.ceil(memberCount / stories)));
  const total = stories * cols;
  const members = Math.min(Math.max(0, memberCount), total);
  const lit = Math.min(Math.max(0, litCount), members);
  // 아래층부터: 맨 아래 줄 왼쪽 → 오른쪽, 그 위 줄 …
  const order: number[] = [];
  for (let r = stories - 1; r >= 0; r--) for (let c = 0; c < cols; c++) order.push(r * cols + c);
  const memberIdx = order.slice(0, members);
  const rand = rng(seed);
  const shuffled = [...memberIdx];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const windows: WindowState[] = Array.from({ length: total }, () => "vacant");
  for (const i of memberIdx) windows[i] = "dark";
  for (const i of shuffled.slice(0, lit)) windows[i] = "lit";
  return { stories, cols, tall, windows, ...(apartment ? { apartment: true } : {}) };
}

/** 지도 아파트 한 채의 모양 (타워팰리스면 타워팰리스 모양) */
export const shapeOf = (v: CityVilla, seed = 0) => buildingShape(v.topFloor, v.memberCount, v.litCount, seed, v.kind === "apartment");

/** 참고 그림의 파스텔 벽색: 크림 · 민트 · 피치 · 라벤더 · 하늘 · 버터 */
export const WALLS = ["#F6EAD0", "#CFE8D3", "#F6CDB6", "#D8CBEA", "#CDE0F1", "#F3E2A9"] as const;
export const wallColor = (id: string) => WALLS[hash(id) % WALLS.length];

// ---------- 지도 배치 ----------

export const LOT_W = 170;
export const ROAD = 28;
export const MARGIN = 14;
/** 하늘 · 산 · 강 높이 (그 아래부터 길과 땅) */
export const SKY_H = 250;
export const MIN_ROW_H = 168;

/** 빈 땅에 놓는 거리 소품 묶음 */
export type PropKind = "park" | "store" | "busstop" | "garden";
const PROPS: PropKind[] = ["park", "store", "busstop", "garden"];

export type Lot = {
  index: number;
  col: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
  villa?: CityVilla;
  prop?: PropKind;
};
export type CityLayout = { width: number; height: number; cols: number; lots: Lot[]; rowsY: { y: number; h: number }[] };

/** 자리 번호 → 땅 번호. 다섯 칸마다 한 칸은 공원 · 가게 자리로 비워 둬서 아파트가 많아도 거리가 살아 있다 */
export const slotToLot = (slot: number) => slot + Math.floor(slot / 4);

/** 건물 그림의 높이 (땅에서 펜트하우스 화분 끝까지) */
export function buildingHeight(s: Pick<BuildingShape, "stories" | "tall" | "apartment">): number {
  const d = dims(s.tall, s.apartment);
  return d.plinth + s.stories * d.story + d.cornice + d.ph + 12;
}

export function dims(tall: boolean, apartment = false) {
  // 타워팰리스: 땅(170) 안에서 더 넓게, 지붕 띠를 높여 "타워팰리스" 간판을 넣는다
  if (apartment) return { w: 118, story: 16, plinth: 26, cornice: 14, ph: 22 };
  return tall
    ? { w: 88, story: 16, plinth: 24, cornice: 5, ph: 20 }
    : { w: 104, story: 25, plinth: 28, cornice: 6, ph: 22 };
}

/** 한 줄에 땅 몇 칸: 폰 2칸, 태블릿 3~4칸, 넓은 화면 5칸 */
export function colsFor(width: number): number {
  return width >= 1000 ? 5 : width >= 760 ? 4 : width >= 560 ? 3 : 2;
}

export function layoutCity(villas: CityVilla[], cols: number, minRows = 4): CityLayout {
  const byLot = new Map<number, CityVilla>();
  for (const v of villas) byLot.set(slotToLot(v.slot), v);
  const maxLot = Math.max(-1, ...byLot.keys());
  const rows = Math.max(minRows, Math.ceil((maxLot + 1) / cols));
  const width = MARGIN * 2 + cols * LOT_W + (cols - 1) * ROAD;
  const lots: Lot[] = [];
  const rowsY: { y: number; h: number }[] = [];
  let y = SKY_H + ROAD;
  for (let r = 0; r < rows; r++) {
    let h = MIN_ROW_H;
    for (let c = 0; c < cols; c++) {
      const v = byLot.get(r * cols + c);
      if (v) h = Math.max(h, buildingHeight(shapeOf(v)) + 62);
    }
    rowsY.push({ y, h });
    for (let c = 0; c < cols; c++) {
      const index = r * cols + c;
      const villa = byLot.get(index);
      const lot: Lot = { index, col: c, row: r, x: MARGIN + c * (LOT_W + ROAD), y, w: LOT_W, h };
      if (villa) lot.villa = villa;
      else lot.prop = PROPS[(hash(`lot${index}`) >>> 3) % PROPS.length];
      lots.push(lot);
    }
    y += h + ROAD;
  }
  return { width, height: y + 40, cols, lots, rowsY };
}
