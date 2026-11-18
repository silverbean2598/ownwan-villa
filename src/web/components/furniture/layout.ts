import type { Slot } from "../../../shared/catalog";
import { GEOM, type Geom } from "../room/Box";

/**
 * 가구 자리의 기준점(viewBox 단위). 바닥 자리는 가구 바닥 가운데, 벽 자리는 가구 가운데.
 * s: 가구 배율. skew: 오른쪽 벽처럼 비스듬한 면의 기울기(dy/dx). front: 캐릭터보다 앞(나중에 그림).
 */
export type Anchor = { slot: Slot; x: number; y: number; s: number; sx: number; skew: number; front: boolean };

export type Variant = "tile" | "detail";

export function sceneGeom(variant: Variant, penthouse: boolean) {
  const detail = variant === "detail";
  const g: Geom = detail ? GEOM.detail : penthouse ? GEOM.phTile : GEOM.tile;
  const u = (g.by1 - g.by0) / 54;
  // 상세 화면은 상자가 크므로 캐릭터 · 가구를 상대적으로 작게
  const k = u * (detail ? 0.62 : 1);
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

  const backY = by1 + fd * 0.14;
  const frontY = by1 + fd * 0.86;
  const a = (slot: Slot, x: number, y: number, s: number, front = false, sx = s, sk = 0): Anchor => ({ slot, x, y, s, sx, skew: sk, front });

  return {
    // 오른쪽 벽은 좁으므로 가로로 눌러 그린다(벽 폭의 70% 이내)
    wall1: a("wall1", rx, yTop + (yBot - yTop) * t, k * 0.95, false, Math.min(k * 0.95 * 0.55, (rw * 0.7) / 34), skew),
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

