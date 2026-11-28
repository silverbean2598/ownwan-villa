import type { FurnitureRes } from "../furniture";
import { depthScale, standPoint, type Variant } from "../furniture/layout";
import type { Geom } from "./Box";
import { Fireplace, Garland, Gifts, Snowman, Wreath, XmasGlow, XmasRug, decorPoint, wreathSpot, xmasLayout } from "./xmas";

type Props = {
  /** back: 러그 · 가랜드 · 리스 · 벽난로(캐릭터 뒤) / front: 선물 · 눈사람(캐릭터 앞) / glow: 밤 불빛 */
  layer: "back" | "front" | "glow";
  g: Geom;
  u: number;
  variant: Variant;
  penthouse: boolean;
  lit: boolean;
  sw: number;
  res: FurnitureRes;
  /** 꺼진 방에서 어둡게 할 필터 id (RoomScene 의 가구 필터) */
  dim: string;
};

/** 가구 좌표의 장식 폭(배치 계산용) */
const W = { fireplace: 34, gifts: 26, snowman: 18 };

/** 크리스마스 테마 장식 한 층. RoomScene 이 back → (캐릭터) → front 순서로 그린다 */
export function XmasDecor({ layer, g, u, variant, penthouse, lit, sw, dim }: Props) {
  const L = xmasLayout(penthouse);
  const bw = g.bx1 - g.bx0;
  const fireX = g.bx0 + bw * L.fireA;
  const fireS = depthScale(variant, penthouse, 0);
  const filter = lit || !dim ? undefined : `url(#${dim})`;

  if (layer === "glow") {
    return <XmasGlow g={g} u={u} bulbs fire={{ x: fireX, y: g.by1, s: fireS }} />;
  }

  const margin = sw * 3;
  const stand = standPoint(variant, penthouse);
  const giftS = depthScale(variant, penthouse, L.gifts.f);
  const snowS = depthScale(variant, penthouse, L.snowman.f);
  const gp = decorPoint(g, L.gifts, W.gifts, giftS, margin);
  const sp = decorPoint(g, L.snowman, W.snowman, snowS, margin);
  // 선물 · 눈사람: 캐릭터보다 뒤(펜트하우스 소파 옆 선물)는 back 층에, 앞은 front 층에
  const pieces = [
    { y: gp.y, node: <g key="gifts" transform={`translate(${gp.x} ${gp.y}) scale(${giftS})`}><Gifts /></g> },
    { y: sp.y, node: <g key="snowman" transform={`translate(${sp.x} ${sp.y}) scale(${snowS})`}><Snowman /></g> },
  ].sort((a, b) => a.y - b.y);

  if (layer === "back") {
    const ks = depthScale(variant, penthouse, stand.f);
    const w = wreathSpot(g, penthouse);
    return (
      <g data-part="xmas-back" filter={filter}>
        <XmasRug cx={stand.x} cy={stand.y - 1.5 * ks} rx={(variant === "detail" ? 30 : 24) * ks} />
        <Garland g={g} u={u} />
        <Wreath cx={w.cx} cy={w.cy} r={w.r} />
        <g transform={`translate(${fireX} ${g.by1 + sw * 0.2}) scale(${fireS})`}>
          <Fireplace />
        </g>
        {pieces.filter((p) => p.y <= stand.y).map((p) => p.node)}
      </g>
    );
  }

  return (
    <g data-part="xmas-front" filter={filter}>
      {pieces.filter((p) => p.y > stand.y).map((p) => p.node)}
    </g>
  );
}
