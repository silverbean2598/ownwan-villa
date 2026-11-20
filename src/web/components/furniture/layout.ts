import type { Slot } from "../../../shared/catalog";
import { GEOM, floorPt, type Geom } from "../room/Box";

/**
 * 가구 자리의 기준점(viewBox 단위). 바닥 자리는 가구 바닥 가운데, 벽 자리는 가구 가운데.
 * s: 가구 배율. skew: 오른쪽 벽처럼 비스듬한 면의 기울기(dy/dx). front: 캐릭터보다 앞(나중에 그림).
 */
export type Anchor = { slot: Slot; x: number; y: number; s: number; sx: number; skew: number; front: boolean };

export type Variant = "tile" | "detail";

/** 방 상세에서 캐릭터 · 가구 배율(뒷벽 높이 기준) */
const DETAIL_SCALE = 0.72;

/**
 * 방 상세에서 캐릭터가 서는 바닥 위치 (가로 a, 깊이 f: floorPt 기준).
 * 보통 방은 바닥 한가운데, 펜트하우스는 오른쪽에 소파 · 화분이 있어 조금 왼쪽.
 */
export const DETAIL_STAND = { a: 0.5, aPenthouse: 0.4, f: 0.5 };

export function sceneGeom(variant: Variant, penthouse: boolean) {
  const detail = variant === "detail";
  const g: Geom = detail ? GEOM.detail : penthouse ? GEOM.phTile : GEOM.tile;
  const u = (g.by1 - g.by0) / 54;
  // 상세 화면은 방이 넓으므로 캐릭터 · 가구를 뒷벽에 비해 작게
  const k = u * (detail ? DETAIL_SCALE : 1);
  return { g, u, k };
}

export function slotAnchors(variant: Variant, penthouse: boolean): Record<Slot, Anchor> {
  const { g, k } = sceneGeom(variant, penthouse);
  const { W, H, bx0, bx1, by0, by1 } = g;
  const bw = bx1 - bx0;
  const bh = by1 - by0;
  const fd = H - by1;
  const rw = W - bx1;

  // 오른쪽 벽: 위 · 아래 모서리 사이 t 높이, 기울기는 두 모서리 기울기의 보간
  const rx = bx1 + rw * 0.5;
  const t = 0.4;
  const yTop = (by0 * (W - rx)) / rw;
  const yBot = by1 + (fd * (rx - bx1)) / rw;
  const skew = (-by0 / rw) * (1 - t) + (fd / rw) * t;

  const a = (slot: Slot, x: number, y: number, s: number, front = false, sx = s, sk = 0): Anchor => ({ slot, x, y, s, sx, skew: sk, front });
  // 오른쪽 벽은 좁으므로 가로로 눌러 그린다(벽 폭의 70% 이내)
  const wall1 = a("wall1", rx, yTop + (yBot - yTop) * t, k * 0.95, false, Math.min(k * 0.95 * 0.55, (rw * 0.7) / 34), skew);

  if (variant === "detail") {
    // 넓은 방: 바닥 자리를 왼쪽 앞 · 오른쪽 뒤 구석 · 오른쪽 앞으로 벌려 놓고, 캐릭터는 바닥 한가운데에 선다
    const at = (slot: Slot, fa: number, f: number, s: number) => {
      const [x, y] = floorPt(g, fa, f);
      return a(slot, x, y, s, f > DETAIL_STAND.f);
    };
    return {
      wall1,
      // 뒷벽 왼쪽(창문 · 조명과 겹치지 않게)
      wall2: a("wall2", bx0 + bw * (penthouse ? 0.17 : 0.2), by0 + bh * (penthouse ? 0.34 : 0.4), k * 0.9),
      // 펜트하우스는 뒤 오른쪽에 소파 · 화분이 있어 뒤 왼쪽 구석을 쓴다
      floor1: penthouse ? at("floor1", 0.1, 0.1, k * 0.9) : at("floor1", 0.12, 0.8, k),
      floor2: penthouse ? at("floor2", 0.12, 0.82, k) : at("floor2", 0.9, 0.06, k * 0.9),
      floor3: at("floor3", 0.88, 0.84, k),
    };
  }

  // 빌라 칸(작은 방): 뒤 왼쪽 · 뒤 오른쪽 · 앞 오른쪽
  const backY = by1 + fd * 0.14;
  const frontY = by1 + fd * 0.86;

  return {
    wall1,
    wall2: a("wall2", bx0 + bw * (penthouse ? 0.16 : 0.2), by0 + bh * 0.36, k * 0.9),
    floor1: a("floor1", bx0 + bw * 0.13, backY, k * 0.82),
    // 펜트하우스는 뒤 오른쪽에 화분 · 소파가 있어 앞 왼쪽을 쓴다
    floor2: penthouse ? a("floor2", bx0 * 0.62, frontY, k, true) : a("floor2", bx1 - bw * 0.12, backY, k * 0.82),
    // 앞 오른쪽: 상자 테두리에 잘리지 않게
    floor3: a("floor3", Math.min(penthouse ? bx0 + bw * 0.86 : bx1 + rw * 0.2, W - 21 * k), frontY, k, true),
  };
}

export function anchorTransform(p: Anchor) {
  return p.skew ? `matrix(${p.sx} ${p.sx * p.skew} 0 ${p.s} ${p.x} ${p.y})` : `translate(${p.x} ${p.y}) scale(${p.s})`;
}

