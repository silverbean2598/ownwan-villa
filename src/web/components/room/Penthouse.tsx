import { useId } from "react";
import type { Geom } from "./Box";
import { furnitureUrl, type FurnitureRes } from "../furniture";

// 펜트하우스 소품: 샹들리에 · 통유리 야경 창 · 화분 · 벨벳 소파. u = 뒷벽 높이 / 54.
// 샹들리에 · 화분 · 소파는 가구와 같은 그림체로 만든 그림(public/furniture/penthouse-*.webp)이다.

/** 꺼진 방의 소품을 어둡게 하는 색 행렬(방에 놓은 뒤쪽 가구와 같음) */
const DIM = "0.7 0 0 0 0  0 0.72 0 0 0.01  0 0 0.8 0 0.04  0 0 0 1 0";

/** 샹들리에 그림(가로:세로)과 높이(u 단위) */
const CHANDELIER_RATIO = 196 / 325;
const CHANDELIER_H = 26;

/**
 * 천장에 매달린 금빛 크리스털 샹들리에(생성 그림). 켜지면 전구가 빛나고 아래로 따뜻한 빛이 번진다.
 * 꺼지면 전구가 꺼진 그림으로 바꾼다.
 */
export function Chandelier({ x, top, u, lit, res = "full" }: { x: number; top: number; u: number; lit: boolean; res?: FurnitureRes }) {
  const id = useId().replace(/:/g, "");
  const h = CHANDELIER_H * u;
  const w = h * CHANDELIER_RATIO;
  // 빛의 중심: 전구가 몰린 아래쪽 단
  const cy = top + h * 0.62;
  return (
    <g data-part="chandelier">
      {lit && (
        <>
          <defs>
            <radialGradient id={`${id}g`}>
              <stop offset="0" stopColor="#FFE9A8" stopOpacity="0.75" />
              <stop offset="0.4" stopColor="#FFE2A0" stopOpacity="0.32" />
              <stop offset="1" stopColor="#FFE2A0" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle data-part="chandelier-glow" cx={x} cy={cy} r={h * 1.05} fill={`url(#${id}g)`} />
        </>
      )}
      {/* 꺼지면 전구가 꺼진 그림을, 방의 다른 가구처럼 조금 어둡게 */}
      {!lit && (
        <defs>
          <filter id={`${id}d`} colorInterpolationFilters="sRGB">
            <feColorMatrix values={DIM} />
          </filter>
        </defs>
      )}
      <image
        href={furnitureUrl(lit ? "penthouse-chandelier" : "penthouse-chandelier-off", res)}
        x={x - w / 2}
        y={top - u * 0.6}
        width={w}
        height={h}
        preserveAspectRatio="none"
        filter={lit ? undefined : `url(#${id}d)`}
      />
    </g>
  );
}

export function Skyline({ x, y, w, h, lit, ink, sw }: { x: number; y: number; w: number; h: number; lit: boolean; ink: string; sw: number }) {
  const blds: [number, number, number][] = [
    [0.02, 0.55, 0.24],
    [0.22, 0.38, 0.2],
    [0.46, 0.62, 0.18],
    [0.62, 0.3, 0.22],
    [0.82, 0.5, 0.18],
  ];
  return (
    <g data-part="skyline">
      <rect x={x} y={y} width={w} height={h} fill="#26386C" />
      <rect x={x} y={y} width={w} height={h * 0.5} fill="#1D2B58" />
      {blds.map(([bx, by, bw], i) => {
        const X = x + bx * w;
        const Y = y + by * h;
        const BW = bw * w;
        const cols = 2;
        const rows = Math.floor(((1 - by) * h) / (h * 0.09));
        return (
          <g key={i}>
            <rect x={X} y={Y} width={BW} height={y + h - Y} fill={i % 2 ? "#33467E" : "#2C3D73"} />
            {Array.from({ length: rows * cols }, (_, k) => {
              const cx = X + BW * (0.3 + 0.4 * (k % cols));
              const cy = Y + h * 0.05 + Math.floor(k / cols) * h * 0.09;
              return (k * 7 + i) % 3 === 0 ? null : <rect key={k} x={cx - w * 0.015} y={cy} width={w * 0.03} height={h * 0.035} fill="#FFE27A" opacity={lit ? 0.95 : 0.8} />;
            })}
          </g>
        );
      })}
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="#3D3536" strokeWidth={sw * 2.2} />
      <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} stroke="#3D3536" strokeWidth={sw * 1.4} />
      <rect x={x - sw} y={y - sw} width={w + 2 * sw} height={h + 2 * sw} fill="none" stroke={ink} strokeWidth={sw * 0.6} />
    </g>
  );
}

/** 금색 화분에 심은 키 큰 식물(생성 그림). (x, y) = 화분 바닥 가운데 */
export function Plant({ x, y, u, res = "full" }: { x: number; y: number; u: number; res?: FurnitureRes }) {
  const h = 30 * u;
  const w = h * (204 / 329);
  return (
    <g data-part="plant">
      <ellipse cx={x} cy={y - 0.4 * u} rx={w * 0.3} ry={1.2 * u} fill="#3A2420" opacity="0.18" />
      <image href={furnitureUrl("penthouse-plant", res)} x={x - w / 2} y={y - h} width={w} height={h} preserveAspectRatio="none" />
    </g>
  );
}

/** 금색 다리의 청록 벨벳 소파(생성 그림). (x, y) = 소파 바닥 가운데 */
export function Sofa({ x, y, u, res = "full" }: { x: number; y: number; u: number; res?: FurnitureRes }) {
  const w = 36 * u;
  const h = w * (231 / 300);
  return (
    <g data-part="sofa">
      <ellipse cx={x} cy={y - 0.6 * u} rx={w * 0.44} ry={1.8 * u} fill="#3A2420" opacity="0.2" />
      <image href={furnitureUrl("penthouse-sofa", res)} x={x - w / 2} y={y - h} width={w} height={h} preserveAspectRatio="none" />
    </g>
  );
}

/**
 * 상자 안에 펜트하우스 소품 배치. 오른쪽 뒷벽에 야경 창, 그 아래 뒷벽에 소파, 뒤 오른쪽 구석에 화분.
 */
export function PenthouseDecor({ g, u, lit, ink, sw, detail = false, res = "full" }: { g: Geom; u: number; lit: boolean; ink: string; sw: number; detail?: boolean; res?: FurnitureRes }) {
  const bw = g.bx1 - g.bx0;
  const fd = g.H - g.by1;
  const wx = g.bx1 - bw * 0.3;
  const ww = bw * 0.24;
  const id = useId().replace(/:/g, "");
  return (
    <g>
      <Skyline x={wx} y={g.by0 + sw * 2} w={ww} h={g.by1 - g.by0 - sw * 2} lit={lit} ink={ink} sw={sw} />
      {/* 꺼진 방에서는 방에 놓은 가구처럼 소파 · 화분을 어둡게 */}
      {!lit && (
        <defs>
          <filter id={`${id}d`} colorInterpolationFilters="sRGB">
            <feColorMatrix values={DIM} />
          </filter>
        </defs>
      )}
      <g filter={lit ? undefined : `url(#${id}d)`}>
        {/* 소파는 야경 창 아래 뒷벽에 붙이고 화분은 뒤 오른쪽 구석에 둔다. 앞 바닥은 가구 자리로 비워 둔다 */}
        <Plant x={g.bx1 - 6.5 * u} y={g.by1 + fd * 0.05} u={u} res={res} />
        <Sofa x={wx + ww * 0.42} y={g.by1 + fd * (detail ? 0.12 : 0.14)} u={u} res={res} />
      </g>
    </g>
  );
}
