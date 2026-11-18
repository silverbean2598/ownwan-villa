import type { Geom } from "./Box";

// 펜트하우스 소품: 샹들리에 · 통유리 야경 창 · 화분 · 벨벳 소파. u = 뒷벽 높이 / 54.
const GOLD = "#D9A93A";
const GOLD_D = "#B4862A";

export function Chandelier({ x, top, u, lit, ink }: { x: number; top: number; u: number; lit: boolean; ink: string }) {
  const y = top + 10 * u;
  const sw = 0.9 * u;
  const candle = (dx: number) => (
    <g key={dx}>
      <rect x={x + dx * u - 0.9 * u} y={y - 3.6 * u} width={1.8 * u} height={3.4 * u} fill="#FFF7E2" stroke={ink} strokeWidth={sw * 0.6} />
      <ellipse cx={x + dx * u} cy={y - 4.6 * u} rx={0.9 * u} ry={1.4 * u} fill={lit ? "#FFD460" : "#8A8A80"} />
    </g>
  );
  return (
    <g data-part="chandelier">
      {lit && (
        <g fill="#FFE9A8">
          <circle cx={x} cy={y} r={20 * u} opacity="0.12" />
          <circle cx={x} cy={y} r={13 * u} opacity="0.16" />
          <circle cx={x} cy={y} r={7 * u} opacity="0.2" />
        </g>
      )}
      <line x1={x} y1={top} x2={x} y2={y - 2 * u} stroke={GOLD_D} strokeWidth={sw * 1.4} />
      <path d={`M${x - 8 * u} ${y - 0.5 * u} Q${x - 7 * u} ${y + 4 * u} ${x} ${y + 3.5 * u} Q${x + 7 * u} ${y + 4 * u} ${x + 8 * u} ${y - 0.5 * u}`} fill="none" stroke={GOLD} strokeWidth={sw * 1.6} strokeLinecap="round" />
      <ellipse cx={x} cy={y + 2.6 * u} rx={2.2 * u} ry={2.6 * u} fill={GOLD} stroke={ink} strokeWidth={sw * 0.7} />
      {[-8, -4, 4, 8].map(candle)}
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

export function Plant({ x, y, u, ink }: { x: number; y: number; u: number; ink: string }) {
  const sw = 0.8 * u;
  const leaf = (dx: number, dy: number, r: number) => (
    <ellipse key={`${dx},${dy}`} cx={x + dx * u} cy={y + dy * u} rx={3.6 * u} ry={2.2 * u} transform={`rotate(${r} ${x + dx * u} ${y + dy * u})`} fill="#5E9F57" stroke={ink} strokeWidth={sw} />
  );
  return (
    <g data-part="plant">
      <path d={`M${x} ${y - 5 * u} Q${x + 0.5 * u} ${y - 14 * u} ${x} ${y - 22 * u}`} stroke="#6B4C2E" strokeWidth={sw * 1.2} fill="none" />
      {[leaf(-3.5, -20, -30), leaf(3.5, -22, 30), leaf(-4, -14, -20), leaf(4, -15, 25), leaf(-3, -9, -35), leaf(3.5, -8.5, 30), leaf(0, -25, 0)]}
      <path d={`M${x - 4.5 * u} ${y - 6 * u} L${x + 4.5 * u} ${y - 6 * u} L${x + 3.6 * u} ${y} L${x - 3.6 * u} ${y} Z`} fill={GOLD} stroke={ink} strokeWidth={sw} strokeLinejoin="round" />
      <path d={`M${x - 3.5 * u} ${y - 3.5 * u} l1.5 ${-1 * u} l1.5 ${1 * u} l1.5 ${-1 * u} l1.5 ${1 * u}`} stroke={GOLD_D} strokeWidth={sw * 0.7} fill="none" />
    </g>
  );
}

export function Sofa({ x, y, u, ink }: { x: number; y: number; u: number; ink: string }) {
  const sw = 0.8 * u;
  const TEAL = "#1F6F8B";
  const TEAL_D = "#175A72";
  return (
    <g data-part="sofa" stroke={ink} strokeWidth={sw} strokeLinejoin="round">
      <rect x={x - 15 * u} y={y - 14 * u} width={30 * u} height={9 * u} rx={3 * u} fill={TEAL_D} />
      <rect x={x - 15 * u} y={y - 7 * u} width={30 * u} height={5.5 * u} rx={1.6 * u} fill={TEAL} />
      <rect x={x - 17.5 * u} y={y - 10 * u} width={4.6 * u} height={9 * u} rx={2.2 * u} fill={TEAL} />
      <rect x={x + 12.9 * u} y={y - 10 * u} width={4.6 * u} height={9 * u} rx={2.2 * u} fill={TEAL} />
      <rect x={x - 11 * u} y={y - 13.5 * u} width={6 * u} height={5.4 * u} rx={1.4 * u} fill="#5D86A0" transform={`rotate(-8 ${x - 8 * u} ${y - 11 * u})`} />
      <line x1={x - 15 * u} y1={y} x2={x - 15 * u} y2={y - 1.5 * u} stroke={GOLD} strokeWidth={sw * 1.6} />
      <line x1={x + 15 * u} y1={y} x2={x + 15 * u} y2={y - 1.5 * u} stroke={GOLD} strokeWidth={sw * 1.6} />
    </g>
  );
}

/** 상자 안에 펜트하우스 소품 배치 */
export function PenthouseDecor({ g, u, lit, ink, sw }: { g: Geom; u: number; lit: boolean; ink: string; sw: number }) {
  const bw = g.bx1 - g.bx0;
  const wx = g.bx1 - bw * 0.3;
  const ww = bw * 0.24;
  return (
    <g>
      <Skyline x={wx} y={g.by0 + sw * 2} w={ww} h={g.by1 - g.by0 - sw * 2} lit={lit} ink={ink} sw={sw} />
      <Plant x={wx - 6 * u} y={g.by1 + 1 * u} u={u} ink={ink} />
      <Sofa x={g.bx1 - 4 * u} y={g.by1 + 14 * u} u={u} ink={ink} />
    </g>
  );
}
