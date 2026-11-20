// 도시 지도의 거리 소품 · 하늘 그림. 모두 (0, 0) = 땅에 닿는 가운데 기준으로 그린다
import { INK, shade } from "../ink";

export const NIGHT = {
  sky: "#1E2B57",
  skyLow: "#2A3D72",
  road: "#4A5379",
  roadLine: "#9AA3C4",
  walk: "#9592AE",
  grass: "#4E7B56",
  grassHi: "#5A8A61",
  leaf: "#5E9B5A",
  leafHi: "#76B26A",
  trunk: "#8A5A3C",
  glow: "#FFE08A",
  lamp: "#3A4468",
  river: "#2E4F8F",
} as const;

const ln = { stroke: INK, strokeWidth: 1.4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

export function Tree({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <ellipse cx="0" cy="0" rx="11" ry="3" fill="#000" opacity=".18" />
      <path d="M-2.5 0 L-2 -12 L2 -12 L2.5 0 Z" fill={NIGHT.trunk} {...ln} />
      <path
        d="M-12 -16 C-17 -18 -16 -27 -10 -28 C-10 -36 0 -39 4 -33 C10 -36 16 -29 13 -24 C18 -20 14 -12 8 -13 C4 -9 -4 -9 -6 -12 C-10 -10 -14 -12 -12 -16 Z"
        fill={NIGHT.leaf}
        {...ln}
      />
      <path d="M-6 -27 C-4 -31 1 -32 3 -29" fill="none" stroke={NIGHT.leafHi} strokeWidth="2.2" strokeLinecap="round" />
    </g>
  );
}

export function Lamp({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="0" cy="-27" r="13" fill={NIGHT.glow} opacity=".16" />
      <circle cx="0" cy="-27" r="7" fill={NIGHT.glow} opacity=".28" />
      <ellipse cx="0" cy="0" rx="4.5" ry="1.6" fill={NIGHT.lamp} {...ln} strokeWidth={1.1} />
      <rect x="-1.3" y="-22" width="2.6" height="22" fill={NIGHT.lamp} {...ln} strokeWidth={1.1} />
      <path d="M-4.5 -22 L4.5 -22 L3.5 -31 L-3.5 -31 Z" fill="#FFF1B8" {...ln} strokeWidth={1.1} />
      <path d="M-5 -31 L5 -31 L0 -35 Z" fill={NIGHT.lamp} {...ln} strokeWidth={1.1} />
    </g>
  );
}

export function Bench({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-11" y="-12" width="22" height="3.5" rx="1" fill="#A8714A" {...ln} strokeWidth={1.1} />
      <rect x="-12" y="-6" width="24" height="3" rx="1" fill="#B97E52" {...ln} strokeWidth={1.1} />
      <path d="M-9 -3 V0 M9 -3 V0" {...ln} />
    </g>
  );
}

export function Bush({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M-8 0 C-11 0 -11 -6 -7 -6 C-7 -10 -1 -11 0 -7 C2 -10 8 -9 7 -5 C10 -5 10 0 7 0 Z"
      fill={NIGHT.leaf}
      {...ln}
      strokeWidth={1.1}
    />
  );
}

export function Planter({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <Bush x={0} y={-5} s={0.7} />
      <path d="M-5 -5 L5 -5 L4 0 L-4 0 Z" fill="#B9724F" {...ln} strokeWidth={1} />
    </g>
  );
}

export function BusStop({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-20" y="-30" width="34" height="27" fill="#BFE3F0" opacity=".55" />
      <path d="M-20 -30 V0 M14 -30 V0" {...ln} strokeWidth={1.6} stroke={NIGHT.lamp} />
      <rect x="-23" y="-34" width="40" height="5" rx="2" fill={NIGHT.lamp} {...ln} strokeWidth={1.1} />
      <rect x="-14" y="-10" width="22" height="3" rx="1" fill="#B97E52" {...ln} strokeWidth={1} />
      <path d="M22 0 V-24" {...ln} />
      <rect x="18" y="-34" width="9" height="12" rx="1.5" fill="#FFF6DA" {...ln} strokeWidth={1.1} />
      <path d="M20 -30 H25 M20 -27 H24" stroke={INK} strokeWidth=".8" />
    </g>
  );
}

export function Vending({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-7" y="-26" width="14" height="26" rx="2" fill="#F2B7A6" {...ln} strokeWidth={1.2} />
      <rect x="-5" y="-23" width="10" height="11" rx="1" fill="#FFF6DA" />
      {[-20.5, -16.5].map((cy) =>
        [-3, 0, 3].map((cx, i) => <circle key={`${cy}${cx}`} cx={cx} cy={cy} r="1.1" fill={["#E86A6A", "#5AA0D8", "#7CC46B"][i]} />),
      )}
      <rect x="-4" y="-7" width="8" height="3" rx="1" fill={INK} opacity=".7" />
    </g>
  );
}

export function Store({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="1" rx="34" ry="3" fill="#000" opacity=".18" />
      <rect x="-30" y="-34" width="60" height="34" rx="2" fill="#F6EAD0" {...ln} />
      <rect x="-32" y="-40" width="64" height="8" rx="2" fill="#F1F1EC" {...ln} />
      <rect x="-32" y="-36" width="64" height="2.5" fill="#E9876E" />
      <rect x="-32" y="-33.5" width="64" height="2" fill="#6FB38A" />
      <rect x="-24" y="-26" width="48" height="22" fill="#FFF3C4" {...ln} strokeWidth={1.2} />
      <path d="M-8 -26 V-4 M8 -26 V-4" stroke={INK} strokeWidth="1.1" />
      <rect x="-26" y="-28" width="52" height="26" fill={NIGHT.glow} opacity=".18" />
    </g>
  );
}

/** 초승달: 큰 원에서 작은 원을 뺀 모양 */
export function Moon({ x, y, r = 22 }: { x: number; y: number; r?: number }) {
  const k = r * 0.78;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r * 1.6} fill="#FFF3C4" opacity=".06" />
      <circle r={r * 1.25} fill="#FFF3C4" opacity=".08" />
      <path
        d={`M ${r * 0.2} ${-r * 0.98} A ${r} ${r} 0 1 0 ${r * 0.98} ${r * 0.2} A ${k} ${k} 0 1 1 ${r * 0.2} ${-r * 0.98} Z`}
        fill="#FFF0B5"
        stroke={shade("#FFF0B5", -0.25)}
        strokeWidth="1.2"
      />
    </g>
  );
}

export function Cloud({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M-26 0 C-30 0 -30 -7 -24 -7 C-23 -14 -13 -15 -10 -10 C-7 -18 6 -18 8 -9 C12 -12 20 -10 19 -4 C25 -4 25 0 21 0 Z"
      fill="#2E4378"
      opacity=".9"
    />
  );
}

export function Star({ x, y, s = 1, i }: { x: number; y: number; s?: number; i: number }) {
  return (
    <path
      className="city-star"
      style={{ animationDelay: `${(i % 7) * 0.45}s` }}
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 -3 L.8 -.8 L3 0 L.8 .8 L0 3 L-.8 .8 L-3 0 L-.8 -.8 Z"
      fill="#FFF6D6"
    />
  );
}
