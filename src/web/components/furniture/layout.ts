import type { Slot } from "../../../shared/catalog";
import { findItem } from "../../../shared/catalog";
import { GEOM, floorPt, type Geom } from "../room/Box";
import { FURNITURE_IMG } from "./art";

/**
 * 가구 자리. 자리마다 붙는 면(plane)이 있다.
 * - back: 뒷벽. 정면으로 그린다. (x, y) = 가구 가운데, s = 배율
 * - right: 오른쪽 옆벽. 벽면의 원근을 따라 기울여 그린다. d = 벽 깊이(0 뒤 모서리 ~ 1 앞), t = 높이(0 천장 ~ 1 바닥), s = 뒷벽 기준 배율
 * - floor: 바닥. (a, f) = floorPt 기준 가로 · 깊이. 가구 바닥 가운데가 이 점에 닿고, 깊이에 따라 크기가 바뀐다.
 *   hug: 옆벽에 붙인다(가구 옆면이 벽 밑선에 닿게). maxTop: 가구 윗끝이 이 y보다 위로 못 올라간다(벽 소품 · 게시판을 가리지 않게)
 */
export type Anchor =
  | { slot: Slot; plane: "back"; x: number; y: number; s: number }
  | { slot: Slot; plane: "right"; d: number; t: number; s: number }
  | { slot: Slot; plane: "floor"; a: number; f: number; hug?: "left" | "right"; maxTop?: number };

export type Variant = "tile" | "detail";

/** SVG matrix(a b c d e f) */
export type Matrix = [number, number, number, number, number, number];

/** 방에 놓은 가구 하나: 가구 그림 좌표 → 방 좌표 변환, 그림 상자, 앞뒤 순서 */
export type Placed = {
  slot: Slot;
  plane: Anchor["plane"];
  m: Matrix;
  /** 가구 그림 상자 [x, y, 폭, 높이] (가구 좌표) */
  box: [number, number, number, number];
  /** 앞뒤 순서: 바닥 가구는 바닥에 닿는 y, 벽 가구는 벽 밑선(뒤) */
  depth: number;
  /** 캐릭터보다 앞(나중에 그림) */
  front: boolean;
};

/** 방 상세에서 캐릭터 · 가구 배율(뒷벽 높이 기준) */
const DETAIL_SCALE = 0.72;

/**
 * 캐릭터가 서는 바닥 위치 (가로 a, 깊이 f: floorPt 기준).
 * 보통 방은 바닥 한가운데, 펜트하우스도 거의 가운데(소파 · 화분은 뒤 오른쪽이라 캐릭터 뒤에 가린다).
 */
export const DETAIL_STAND = { a: 0.5, aPenthouse: 0.52, f: 0.5 };
const TILE_STAND_F = 0.62;

export function sceneGeom(variant: Variant, penthouse: boolean) {
  const detail = variant === "detail";
  const g: Geom = detail ? GEOM.detail : penthouse ? GEOM.phTile : GEOM.tile;
  const u = (g.by1 - g.by0) / 54;
  // 상세 화면은 방이 넓으므로 캐릭터 · 가구를 뒷벽에 비해 작게
  const k = u * (detail ? DETAIL_SCALE : 1);
  return { g, u, k };
}

/** 캐릭터 발 위치(방 좌표)와 그 깊이 f */
export function standPoint(variant: Variant, penthouse: boolean): { x: number; y: number; f: number } {
  const { g } = sceneGeom(variant, penthouse);
  if (variant === "detail") {
    const [x, y] = floorPt(g, penthouse ? DETAIL_STAND.aPenthouse : DETAIL_STAND.a, DETAIL_STAND.f);
    return { x, y, f: DETAIL_STAND.f };
  }
  const bw = g.bx1 - g.bx0;
  return { x: g.bx0 + bw * (penthouse ? 0.42 : 0.5), y: g.by1 + (g.H - g.by1) * TILE_STAND_F, f: TILE_STAND_F };
}

/**
 * 바닥 깊이 f(0 뒤 ~ 1 앞)에서의 배율. 뒤로 갈수록 작고 앞으로 올수록 크다(뒤 끝 0.8 ~ 앞 끝 1.2 선형).
 * 캐릭터가 서는 깊이에서 k(캐릭터 배율)와 같다.
 */
export function depthScale(variant: Variant, penthouse: boolean, f: number) {
  const { k } = sceneGeom(variant, penthouse);
  const lin = (x: number) => 0.8 + 0.4 * x;
  return (k * lin(f)) / lin(standPoint(variant, penthouse).f);
}

/** 방 상세 왼쪽 벽 게시판(HTML)의 아래끝 y. 바닥 앞 왼쪽 가구가 게시판에 가리지 않게 이보다 아래에 둔다 */
const BOARD_BOTTOM = 0.69;

export function slotAnchors(variant: Variant, penthouse: boolean): Record<Slot, Anchor> {
  const { g, k } = sceneGeom(variant, penthouse);
  const { H, bx0, bx1, by0, by1 } = g;
  const bw = bx1 - bx0;
  const bh = by1 - by0;
  const detail = variant === "detail";

  // 뒷벽 왼쪽, 눈높이보다 조금 위(조명 · 창문과 겹치지 않게). 그 아래 뒤 왼쪽 구석에 바닥 가구가 선다
  const ws = k * 0.9;
  const wall2: Anchor = { slot: "wall2", plane: "back", x: bx0 + bw * (penthouse ? 0.17 : detail ? 0.22 : 0.19), y: by0 + bh * (detail ? 0.3 : 0.33), s: ws };
  // 벽 소품(폭 34 · 높이 30 정도) 아래끝: 그 밑 바닥 가구의 윗끝 한계
  const underWall2 = wall2.y + 15 * ws + bh * 0.03;
  // 오른쪽 옆벽 가운데쯤, 눈높이
  const wall1: Anchor = { slot: "wall1", plane: "right", d: 0.42, t: 0.36, s: k * 0.95 };

  if (detail) {
    return {
      wall1,
      wall2,
      // 뒤 왼쪽 구석: 뒷벽 · 왼쪽 벽에 붙여, 위의 벽 소품을 가리지 않게
      floor1: { slot: "floor1", plane: "floor", a: 0, f: 0.04, hug: "left", maxTop: underWall2 },
      // 보통 방: 뒤 오른쪽 구석(창문 아래). 펜트하우스는 소파 · 화분이 있어 앞 왼쪽(게시판 아래)
      floor2: penthouse
        ? { slot: "floor2", plane: "floor", a: 0, f: 0.84, hug: "left", maxTop: H * BOARD_BOTTOM }
        : { slot: "floor2", plane: "floor", a: 1, f: 0.06, hug: "right" },
      // 앞 오른쪽 구석: 오른쪽 벽에 붙여
      floor3: { slot: "floor3", plane: "floor", a: 1, f: 0.84, hug: "right" },
    };
  }

  // 아파트 칸(작은 방): 뒤 왼쪽 구석 · 뒤 오른쪽 구석(펜트하우스는 앞 왼쪽) · 앞 오른쪽 구석
  return {
    wall1,
    wall2,
    floor1: { slot: "floor1", plane: "floor", a: 0, f: 0.06, hug: "left", maxTop: underWall2 },
    floor2: penthouse ? { slot: "floor2", plane: "floor", a: 0, f: 0.88, hug: "left" } : { slot: "floor2", plane: "floor", a: 1, f: 0.06, hug: "right" },
    floor3: { slot: "floor3", plane: "floor", a: 1, f: 0.88, hug: "right" },
  };
}

/** 빈 자리(가구 없음)의 기본 상자: 벽 소품 · 바닥 가구 */
const EMPTY_WALL: [number, number, number, number] = [-17, -15, 34, 30];
const EMPTY_FLOOR: [number, number, number, number] = [-20, -28, 40, 28];

/** 가구 그림 상자. 벽 가구는 가운데가 (0,0), 바닥 가구는 바닥 가운데가 (0,0) */
function itemBox(itemId: string | null | undefined, wall: boolean): [number, number, number, number] {
  const s = itemId ? FURNITURE_IMG[itemId] : undefined;
  if (s && itemId && (findItem(itemId)?.slotType === "wall") === wall) return [-s[0] / 2, wall ? -s[1] / 2 : -s[1], s[0], s[1]];
  return wall ? EMPTY_WALL : EMPTY_FLOOR;
}

/**
 * 자리에 가구를 놓는다: 면(뒷벽 · 옆벽 · 바닥)에 맞는 변환과 앞뒤 순서를 정한다.
 * itemId 가 없으면 빈 자리의 기본 상자로 계산한다(편집 화면의 자리 표시).
 */
export function placeSlot(variant: Variant, penthouse: boolean, slot: Slot, itemId?: string | null): Placed {
  const { g, k } = sceneGeom(variant, penthouse);
  const { W, H, bx1, by0, by1 } = g;
  const bh = by1 - by0;
  const rw = W - bx1;
  const an = slotAnchors(variant, penthouse)[slot];
  const stand = standPoint(variant, penthouse);
  const sw = 1.1 * Math.max(1, ((by1 - by0) / 54) * 0.6);
  const margin = sw * 3; // 상자 테두리 안쪽 여유

  if (an.plane === "back") {
    const box = itemBox(itemId, true);
    return { slot, plane: "back", m: [an.s, 0, 0, an.s, an.x, an.y], box, depth: by1 - 1, front: false };
  }

  if (an.plane === "right") {
    const box = itemBox(itemId, true);
    // 벽 깊이 d 에서의 벽 위 · 아래 모서리와 높이
    const top = by0 * (1 - an.d);
    const wallH = bh + (H - bh) * an.d;
    const cx = bx1 + rw * an.d;
    const cy = top + wallH * an.t;
    // 세로: 앞으로 올수록 벽이 높아지는 만큼 크게. 가로: 옆벽이라 깊이 방향으로 눌러(벽 폭의 70% 이내)
    const sv = an.s * (wallH / bh);
    const sx = Math.min(sv * 0.5, (rw * 0.7) / box[2]);
    // 높이 t 에서 벽을 따라 가로로 갈 때의 기울기(위 모서리 ↗, 아래 모서리 ↘ 사이 보간)
    const slope = ((-by0) * (1 - an.t) + (H - by1) * an.t) / rw;
    return { slot, plane: "right", m: [sx, sx * slope, 0, sv, cx, cy], box, depth: by1 - 1, front: false };
  }

  // 바닥
  const box = itemBox(itemId, false);
  const [, , bwid, bhgt] = box;
  const [px, y] = floorPt(g, an.a, an.f);
  let s = depthScale(variant, penthouse, an.f);
  if (an.maxTop !== undefined && y - bhgt * s < an.maxTop) s = Math.max(k * 0.45, (y - an.maxTop) / bhgt);
  const x0 = g.bx0 * (1 - an.f) + margin;
  const x1 = bx1 + rw * an.f - margin;
  const hw = (bwid / 2) * s;
  // 넓은 가구가 바닥 폭을 넘으면 크기를 줄인다
  if (hw * 2 > x1 - x0) s *= (x1 - x0) / (hw * 2);
  // 캐릭터보다 뒤 구석 가구는 캐릭터 몸(가운데 ± 6k)까지 넘어오지 않게: 넓은 가구가 캐릭터에 가려 안 보이지 않도록
  if (an.hug && y < stand.y) {
    const avail = an.hug === "left" ? stand.x - 6 * k - x0 : x1 - (stand.x + 6 * k);
    if (bwid * s > avail) s = Math.max(avail / bwid, s * 0.6);
  }
  const half = (bwid / 2) * s;
  let x = an.hug === "left" ? x0 + half : an.hug === "right" ? x1 - half : px;
  x = Math.min(Math.max(x, x0 + half), x1 - half);
  return { slot, plane: "floor", m: [s, 0, 0, s, x, y], box, depth: y, front: y > stand.y };
}

export const matrixAttr = (m: Matrix) => `matrix(${m.map((v) => +v.toFixed(3)).join(" ")})`;

/** 변환한 가구 상자의 네 꼭짓점(방 좌표): 왼위 · 오른위 · 오른아래 · 왼아래 */
export function placedQuad(p: Placed): [number, number][] {
  const [a, b, c, d, e, f] = p.m;
  const [x, y, w, h] = p.box;
  return [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ].map(([X, Y]) => [a * X + c * Y + e, b * X + d * Y + f] as [number, number]);
}

/**
 * 편집 화면 자리 표시(HTML)용 사각형: 가운데 · 폭 · 높이(방 좌표)와 세로 기울임 각도.
 * 옆벽 자리는 CSS skewY 로 벽면을 따라 기울인다.
 */
export function placedRect(p: Placed) {
  const [a, b, , d] = p.m;
  const [qx, qy] = placedQuad(p).reduce(([sx, sy], [x, y]) => [sx + x / 4, sy + y / 4], [0, 0]);
  return { cx: qx, cy: qy, w: p.box[2] * a, h: p.box[3] * d, skew: Math.atan2(b, a) };
}
