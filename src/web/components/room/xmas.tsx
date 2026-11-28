import { useId } from "react";
import type { ThemeId } from "../../../shared/premium";
import { floorPt, type Geom } from "./Box";

// 크리스마스 테마(프리미엄): 눈꽃 · 호랑가시 벽지, 가랜드, 리스, 벽난로, 선물 더미, 눈사람, 러그.
// 방 그림(파스텔 · 부드러운 갈색 외곽선 · 옅은 그림자)과 같은 그림체로 그린다.
// 장식은 테마에 딸려 있어 가구 5칸(벽 2 · 바닥 3)을 비켜 놓는다.
//   보통 방: 벽난로 = 뒷벽 가운데 · 리스 = 창문 · 선물 = 앞 왼쪽 구석 · 눈사람 = 앞 가운데 오른쪽
//   펜트하우스: 벽난로 = 뒷벽 왼쪽 가운데 · 리스 = 야경 창 · 선물 = 소파 왼쪽 · 눈사람 = 앞 오른쪽

const INK = "#5B4640";
const pts = (a: number[][]) => a.map((p) => p.join(",")).join(" ");

/** 벽지 색: 낮(파스텔 세이지) / 밤(푸른 남색) */
const PAPER = {
  lit: { base: "#E3EFE0", flake: "#FFFFFF", flakeLine: "#C3D8C6", leaf: "#6FA77A", leafLine: "#4F8A5E", berry: "#D9534F", dot: "#FFFFFF" },
  unlit: { base: "#2C4670", flake: "#9FB5DA", flakeLine: "#9FB5DA", leaf: "#3E6B5A", leafLine: "#2F5446", berry: "#94465A", dot: "#7F95BD" },
};

/** 벽지 무늬(SVG pattern). Box 의 defs 안에 넣고 벽면을 url(#id) 로 덮는다. u = 뒷벽 높이 / 54 */
export function ThemePaper({ id, theme, lit, u, x, y }: { id: string; theme: ThemeId; lit: boolean; u: number; x: number; y: number }) {
  if (theme !== "xmas") return null;
  const c = lit ? PAPER.lit : PAPER.unlit;
  const P = 13 * u;
  const flake = (cx: number, cy: number, r: number) => (
    <g stroke={c.flake} strokeWidth={0.5 * u} strokeLinecap="round">
      {[0, 60, 120].map((a) => {
        const rad = (a * Math.PI) / 180;
        const dx = Math.cos(rad) * r;
        const dy = Math.sin(rad) * r;
        return <line key={a} x1={cx - dx} y1={cy - dy} x2={cx + dx} y2={cy + dy} />;
      })}
      {[30, 90, 150, 210, 270, 330].map((a) => {
        const rad = (a * Math.PI) / 180;
        const mx = cx + Math.cos(rad) * r * 0.62;
        const my = cy + Math.sin(rad) * r * 0.62;
        return <circle key={a} cx={mx} cy={my} r={0.22 * u} fill={c.flake} stroke="none" />;
      })}
    </g>
  );
  const holly = (cx: number, cy: number) => (
    <g>
      <ellipse cx={cx - 1.3 * u} cy={cy} rx={1.9 * u} ry={0.85 * u} transform={`rotate(-28 ${cx - 1.3 * u} ${cy})`} fill={c.leaf} stroke={c.leafLine} strokeWidth={0.25 * u} />
      <ellipse cx={cx + 1.3 * u} cy={cy} rx={1.9 * u} ry={0.85 * u} transform={`rotate(28 ${cx + 1.3 * u} ${cy})`} fill={c.leaf} stroke={c.leafLine} strokeWidth={0.25 * u} />
      {[[-0.55, -0.75], [0.55, -0.75], [0, -0.05]].map(([dx, dy], i) => (
        <circle key={i} cx={cx + dx * u} cy={cy + dy * u - 0.2 * u} r={0.55 * u} fill={c.berry} />
      ))}
    </g>
  );
  return (
    <pattern id={id} data-part="wallpaper-pattern" patternUnits="userSpaceOnUse" width={P} height={P} patternTransform={`translate(${x} ${y})`}>
      <rect width={P} height={P} fill={c.base} />
      {flake(P * 0.25, P * 0.27, 1.9 * u)}
      {holly(P * 0.75, P * 0.76)}
      <circle cx={P * 0.78} cy={P * 0.2} r={0.35 * u} fill={c.dot} opacity="0.8" />
      <circle cx={P * 0.2} cy={P * 0.8} r={0.35 * u} fill={c.dot} opacity="0.8" />
      <circle cx={P * 0.5} cy={P * 0.52} r={0.25 * u} fill={c.dot} opacity="0.6" />
    </pattern>
  );
}

/** 테마가 켜진 보통 방의 징두리 · 걸레받이 색(옅은 산타 빨강). 펜트하우스는 원래 나무색 그대로 */
export const XMAS_TRIM = {
  lit: { wain: "#F4D3CA", base: "#C9806F" },
  unlit: { wain: "#2E3563", base: "#4A3E58" },
};

const BULB_COLORS = ["#FF6B6B", "#FFD166", "#7CC6FE", "#8BD17C"];

/** 가랜드 처짐: 뒷벽 위끝을 따라 n 번 늘어진다. 처진 곡선의 점 (t 0..1) */
function garlandGeom(g: Geom, u: number) {
  const bw = g.bx1 - g.bx0;
  const n = Math.max(3, Math.round(bw / (24 * u)));
  const top = g.by0 + 2.2 * u;
  const sag = 5.5 * u;
  const seg = bw / n;
  const at = (i: number, t: number) => {
    const x = g.bx0 + seg * (i + t);
    // 2차 곡선(끝 0, 가운데 sag)
    const y = top + sag * 4 * t * (1 - t);
    return [x, y] as [number, number];
  };
  return { n, top, sag, seg, at };
}

/** 가랜드 위 전구 자리 (밤에 빛나는 점) */
export function garlandBulbs(g: Geom, u: number) {
  const { n, at } = garlandGeom(g, u);
  const out: { x: number; y: number; color: string }[] = [];
  for (let i = 0; i < n; i++) {
    [0.22, 0.5, 0.78].forEach((t, j) => {
      const [x, y] = at(i, t);
      out.push({ x, y: y + 1.3 * u, color: BULB_COLORS[(i * 3 + j) % BULB_COLORS.length] });
    });
  }
  return out;
}

/** 뒷벽 위끝을 따라 늘어진 초록 가랜드 + 전구 + 이음매마다 빨간 리본 */
export function Garland({ g, u }: { g: Geom; u: number }) {
  const { n, at, seg, top, sag } = garlandGeom(g, u);
  let d = "";
  for (let i = 0; i < n; i++) {
    const [x0, y0] = at(i, 0);
    const [x1, y1] = at(i, 1);
    // 2차 베지어의 조절점: 가운데 높이가 sag 가 되게 2배
    d += `${i === 0 ? `M${x0} ${y0}` : ""} Q${(x0 + x1) / 2} ${top + sag * 2} ${x1} ${y1} `;
  }
  const w = 2.6 * u;
  const bow = (x: number, y: number) => (
    <g key={`b${x}`}>
      <path d={`M${x} ${y} l${-2.4 * u} ${-1.4 * u} v${2.8 * u} Z M${x} ${y} l${2.4 * u} ${-1.4 * u} v${2.8 * u} Z`} fill="#E25B57" stroke={INK} strokeWidth={0.3 * u} strokeLinejoin="round" />
      <path d={`M${x} ${y} l${-1.2 * u} ${3.2 * u} M${x} ${y} l${1.2 * u} ${3.2 * u}`} stroke="#E25B57" strokeWidth={0.8 * u} strokeLinecap="round" />
      <circle cx={x} cy={y} r={0.75 * u} fill="#C94440" stroke={INK} strokeWidth={0.25 * u} />
    </g>
  );
  return (
    <g data-part="xmas-garland">
      <path d={d} fill="none" stroke={INK} strokeWidth={w + 0.7 * u} strokeLinecap="round" opacity="0.85" />
      <path d={d} fill="none" stroke="#5E9B66" strokeWidth={w} strokeLinecap="round" />
      <path d={d} fill="none" stroke="#86C08A" strokeWidth={w * 0.45} strokeDasharray={`${0.9 * u} ${1.3 * u}`} strokeLinecap="round" />
      {garlandBulbs(g, u).map((b, i) => (
        <g key={i}>
          <line x1={b.x} y1={b.y - 1.1 * u} x2={b.x} y2={b.y - 0.4 * u} stroke={INK} strokeWidth={0.3 * u} />
          <ellipse cx={b.x} cy={b.y} rx={0.65 * u} ry={0.85 * u} fill={b.color} stroke={INK} strokeWidth={0.22 * u} />
        </g>
      ))}
      {Array.from({ length: n + 1 }, (_, i) => bow(g.bx0 + seg * i, top))}
    </g>
  );
}

/** 초록 리스 + 빨간 열매 + 아래 리본. (cx, cy) = 가운데, r = 바깥 반지름 */
export function Wreath({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const ring = r * 0.68;
  const leaves = 12;
  return (
    <g data-part="xmas-wreath">
      <circle cx={cx} cy={cy + r * 0.08} r={r} fill="#3A2420" opacity="0.12" />
      <circle cx={cx} cy={cy} r={ring} fill="none" stroke={INK} strokeWidth={r * 0.62} />
      <circle cx={cx} cy={cy} r={ring} fill="none" stroke="#5E9B66" strokeWidth={r * 0.52} />
      {Array.from({ length: leaves }, (_, i) => {
        const a = (i / leaves) * Math.PI * 2;
        const x = cx + Math.cos(a) * ring;
        const y = cy + Math.sin(a) * ring;
        const deg = (a * 180) / Math.PI + 90;
        return <ellipse key={i} cx={x} cy={y} rx={r * 0.13} ry={r * 0.3} transform={`rotate(${deg + 35} ${x} ${y})`} fill={i % 2 ? "#78B583" : "#4F8A5E"} />;
      })}
      {[0.4, 1.5, 2.6, 3.9, 5.1].map((a, i) => (
        <circle key={i} cx={cx + Math.cos(a) * ring * 1.05} cy={cy + Math.sin(a) * ring * 1.05} r={r * 0.1} fill="#E0504C" stroke={INK} strokeWidth={r * 0.03} />
      ))}
      {/* 아래 리본 */}
      <g transform={`translate(${cx} ${cy + ring})`}>
        <path d={`M0 0 l${-r * 0.42} ${-r * 0.24} v${r * 0.48} Z M0 0 l${r * 0.42} ${-r * 0.24} v${r * 0.48} Z`} fill="#E25B57" stroke={INK} strokeWidth={r * 0.05} strokeLinejoin="round" />
        <path d={`M0 0 l${-r * 0.22} ${r * 0.55} M0 0 l${r * 0.22} ${r * 0.55}`} stroke="#E25B57" strokeWidth={r * 0.13} strokeLinecap="round" />
        <circle r={r * 0.12} fill="#C94440" stroke={INK} strokeWidth={r * 0.04} />
      </g>
    </g>
  );
}

/** 벽난로(가구 좌표: 바닥 가운데가 (0,0), 폭 34 · 높이 28). 불은 늘 타고, 벽난로 선반에 양말 두 짝 · 초 */
export function Fireplace() {
  return (
    <g data-part="xmas-fireplace" strokeLinejoin="round">
      <ellipse cx={0} cy={-0.3} rx={17} ry={1.6} fill="#3A2420" opacity="0.18" />
      {/* 돌 몸통 · 벽돌 줄 */}
      <rect x={-13.5} y={-21} width={27} height={21} rx={1} fill="#F3E3D3" stroke={INK} strokeWidth={0.9} />
      <g stroke="#D9C2AD" strokeWidth={0.5}>
        <line x1={-13} y1={-15} x2={-8.5} y2={-15} />
        <line x1={8.5} y1={-15} x2={13} y2={-15} />
        <line x1={-13} y1={-8} x2={-8.5} y2={-8} />
        <line x1={8.5} y1={-8} x2={13} y2={-8} />
        <line x1={-11} y1={-21} x2={-11} y2={-15} />
        <line x1={11} y1={-15} x2={11} y2={-8} />
      </g>
      {/* 불 아궁이 */}
      <path d="M-8.5 0 V-9 Q-8.5 -16 0 -16 Q8.5 -16 8.5 -9 V0 Z" fill="#4A3530" stroke={INK} strokeWidth={0.8} />
      <path d="M-6.5 -1.5 Q-6.5 -9 0 -12 Q6.5 -9 6.5 -1.5 Z" fill="#FFB347" opacity="0.35" />
      {/* 장작 · 불꽃 */}
      <rect x={-6} y={-3} width={12} height={2.2} rx={1.1} fill="#9C6A45" stroke={INK} strokeWidth={0.5} />
      <rect x={-5} y={-4.6} width={10} height={2} rx={1} fill="#B98257" stroke={INK} strokeWidth={0.5} transform="rotate(-8 0 -3.6)" />
      <path d="M-4.6 -4 Q-5.4 -8 -2.6 -10.2 Q-2.4 -7.6 -0.8 -7 Q-0.6 -11 2.2 -12.6 Q2 -9 4 -7.6 Q5.6 -6 4.4 -4 Z" fill="#F59E4B" />
      <path d="M-2.6 -4 Q-3 -6.6 -1.2 -8 Q-0.6 -6.4 0.6 -6.2 Q1 -8.6 2.4 -9.4 Q2.6 -6.6 3 -4 Z" fill="#FFD66B" />
      {/* 아궁이 앞 받침 */}
      <rect x={-15.5} y={-1.6} width={31} height={1.6} rx={0.6} fill="#D7C2AE" stroke={INK} strokeWidth={0.6} />
      {/* 선반 */}
      <rect x={-16.5} y={-24} width={33} height={3.4} rx={1} fill="#B98257" stroke={INK} strokeWidth={0.9} />
      <line x1={-15.8} y1={-22.9} x2={15.8} y2={-22.9} stroke="#D9A57A" strokeWidth={0.6} />
      {/* 초 두 개 */}
      {[-12.5, 12.5].map((x) => (
        <g key={x}>
          <rect x={x - 1} y={-28.5} width={2} height={4.5} rx={0.5} fill="#FFF7EA" stroke={INK} strokeWidth={0.45} />
          <path d={`M${x} -31.2 Q${x + 1} -29.8 ${x} -28.8 Q${x - 1} -29.8 ${x} -31.2 Z`} fill="#FFD66B" />
        </g>
      ))}
      {/* 양말: 선반에 걸려 돌 앞으로 */}
      <Stocking x={-9.5} color="#E25B57" flip={false} />
      <Stocking x={9.5} color="#6FAE7C" flip />
    </g>
  );
}

function Stocking({ x, color, flip }: { x: number; color: string; flip: boolean }) {
  const s = flip ? -1 : 1;
  return (
    <g transform={`translate(${x} -21) scale(${s} 1)`}>
      <path d="M-1.6 1.5 V7 Q-1.6 9 0.4 9 H3 Q4.2 9 4.2 7.8 Q4.2 6.6 3 6.6 H1.6 V1.5 Z" fill={color} stroke={INK} strokeWidth={0.5} />
      <rect x={-2.1} y={0.2} width={4.2} height={2} rx={0.8} fill="#FFFFFF" stroke={INK} strokeWidth={0.45} />
    </g>
  );
}

/** 선물 더미(가구 좌표: 바닥 가운데가 (0,0), 폭 26 · 높이 21) */
export function Gifts() {
  const box = (x: number, y: number, w: number, h: number, fill: string, ribbon: string, key: string) => (
    <g key={key}>
      <rect x={x} y={y} width={w} height={h} rx={0.8} fill={fill} stroke={INK} strokeWidth={0.8} />
      <rect x={x + w / 2 - w * 0.08} y={y} width={w * 0.16} height={h} fill={ribbon} />
      <rect x={x} y={y + h * 0.42} width={w} height={h * 0.16} fill={ribbon} />
      <rect x={x} y={y} width={w} height={h} rx={0.8} fill="none" stroke={INK} strokeWidth={0.8} />
      <path
        d={`M${x + w / 2} ${y} q${-w * 0.28} ${-h * 0.32} ${-w * 0.3} ${-h * 0.02} Z M${x + w / 2} ${y} q${w * 0.28} ${-h * 0.32} ${w * 0.3} ${-h * 0.02} Z`}
        fill={ribbon}
        stroke={INK}
        strokeWidth={0.5}
        strokeLinejoin="round"
      />
    </g>
  );
  return (
    <g data-part="xmas-gifts">
      <ellipse cx={0} cy={-0.3} rx={13.5} ry={1.5} fill="#3A2420" opacity="0.18" />
      {box(-13, -13, 14, 13, "#E2675F", "#FFF4E6", "big")}
      {box(0.5, -9.5, 12, 9.5, "#6FAE7C", "#F3C24F", "green")}
      {box(-10, -20, 8.5, 7, "#FFF1D6", "#E25B57", "small")}
    </g>
  );
}

/** 눈사람 인형(가구 좌표: 바닥 가운데가 (0,0), 높이 28) */
export function Snowman() {
  return (
    <g data-part="xmas-snowman" strokeLinejoin="round">
      <ellipse cx={0} cy={-0.3} rx={8} ry={1.3} fill="#3A2420" opacity="0.18" />
      {/* 나뭇가지 팔 */}
      <path d="M-6 -10 L-11 -14 M-9.2 -12.6 L-10.6 -11" stroke="#8A5A3B" strokeWidth={0.9} strokeLinecap="round" fill="none" />
      <path d="M6 -10 L11 -14.5 M9.4 -13 L9.8 -15.4" stroke="#8A5A3B" strokeWidth={0.9} strokeLinecap="round" fill="none" />
      <circle cx={0} cy={-7.2} r={7.2} fill="#FFFFFF" stroke={INK} strokeWidth={0.8} />
      <path d="M-5.5 -3 Q0 1 5.5 -3" stroke="#DCE8F5" strokeWidth={1.6} fill="none" />
      <circle cx={0} cy={-17.6} r={5} fill="#FFFFFF" stroke={INK} strokeWidth={0.8} />
      {/* 목도리 */}
      <path d="M-4.6 -14.2 Q0 -12.2 4.6 -14.2 L4.6 -12.4 Q0 -10.6 -4.6 -12.4 Z" fill="#E25B57" stroke={INK} strokeWidth={0.5} />
      <path d="M2.4 -12 L3.6 -7.6 L5.6 -8.2 L4.2 -12.4 Z" fill="#E25B57" stroke={INK} strokeWidth={0.5} />
      {/* 단추 */}
      <circle cx={0} cy={-9.4} r={0.7} fill={INK} />
      <circle cx={0} cy={-6.4} r={0.7} fill={INK} />
      {/* 얼굴 */}
      <circle cx={-1.7} cy={-18.4} r={0.6} fill={INK} />
      <circle cx={1.7} cy={-18.4} r={0.6} fill={INK} />
      <path d="M0 -17.4 L3.4 -16.6 L0 -16.3 Z" fill="#F59E4B" stroke="#C9772F" strokeWidth={0.3} />
      <circle cx={-3} cy={-16.6} r={0.8} fill="#F7B4B4" opacity="0.7" />
      <circle cx={3} cy={-16.6} r={0.8} fill="#F7B4B4" opacity="0.7" />
      {/* 모자 */}
      <rect x={-5.2} y={-22.4} width={10.4} height={1.6} rx={0.6} fill="#4B4458" stroke={INK} strokeWidth={0.5} />
      <rect x={-3.4} y={-27.6} width={6.8} height={5.4} rx={0.6} fill="#4B4458" stroke={INK} strokeWidth={0.5} />
      <rect x={-3.4} y={-23.8} width={6.8} height={1.2} fill="#E25B57" />
    </g>
  );
}

/** 크리스마스 러그: 캐릭터 발밑 바닥에 납작하게 깐 타원. (cx, cy) = 가운데, rx = 가로 반지름 */
export function XmasRug({ cx, cy, rx }: { cx: number; cy: number; rx: number }) {
  const ry = rx * 0.3;
  return (
    <g data-part="xmas-rug">
      <ellipse cx={cx} cy={cy + ry * 0.12} rx={rx * 1.02} ry={ry * 1.05} fill="#3A2420" opacity="0.12" />
      <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#D9675F" stroke={INK} strokeWidth={rx * 0.02} />
      <ellipse cx={cx} cy={cy} rx={rx * 0.86} ry={ry * 0.86} fill="none" stroke="#FFF4E6" strokeWidth={rx * 0.025} strokeDasharray={`${rx * 0.05} ${rx * 0.04}`} />
      <ellipse cx={cx} cy={cy} rx={rx * 0.7} ry={ry * 0.7} fill="#7DB387" />
      {/* 납작한 눈꽃 */}
      <g transform={`translate(${cx} ${cy}) scale(1 0.3)`} stroke="#FFFFFF" strokeWidth={rx * 0.04} strokeLinecap="round">
        {[0, 60, 120].map((a) => {
          const rad = (a * Math.PI) / 180;
          const r = rx * 0.42;
          return <line key={a} x1={-Math.cos(rad) * r} y1={-Math.sin(rad) * r} x2={Math.cos(rad) * r} y2={Math.sin(rad) * r} />;
        })}
      </g>
    </g>
  );
}

/** 밤에 빛나는 것: 벽난로 불빛(바닥까지 번짐) · 가랜드 전구 */
export function XmasGlow({ g, u, bulbs, fire }: { g: Geom; u: number; bulbs: boolean; fire: { x: number; y: number; s: number } | null }) {
  const id = useId().replace(/:/g, "");
  return (
    <g data-part="xmas-glow">
      <defs>
        <radialGradient id={`${id}f`}>
          <stop offset="0" stopColor="#FFC46B" stopOpacity="0.55" />
          <stop offset="0.5" stopColor="#FFB04F" stopOpacity="0.2" />
          <stop offset="1" stopColor="#FFB04F" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${id}b`}>
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>
      {fire && (
        <>
          <ellipse cx={fire.x} cy={fire.y - 6 * fire.s} rx={26 * fire.s} ry={18 * fire.s} fill={`url(#${id}f)`} />
          <ellipse cx={fire.x} cy={fire.y + 4 * fire.s} rx={30 * fire.s} ry={7 * fire.s} fill={`url(#${id}f)`} />
          <path
            transform={`translate(${fire.x} ${fire.y}) scale(${fire.s})`}
            d="M-4.6 -4 Q-5.4 -8 -2.6 -10.2 Q-2.4 -7.6 -0.8 -7 Q-0.6 -11 2.2 -12.6 Q2 -9 4 -7.6 Q5.6 -6 4.4 -4 Z"
            fill="#FFC15E"
          />
        </>
      )}
      {bulbs &&
        garlandBulbs(g, u).map((b, i) => (
          <g key={i}>
            <circle cx={b.x} cy={b.y} r={2.4 * u} fill={b.color} opacity="0.35" />
            <circle cx={b.x} cy={b.y} r={0.7 * u} fill={b.color} />
            <circle cx={b.x} cy={b.y} r={1.2 * u} fill={`url(#${id}b)`} opacity="0.6" />
          </g>
        ))}
    </g>
  );
}

/** 바닥 장식 자리(가로 a, 깊이 f). hug 이면 그쪽 옆벽에 붙인다 */
export type DecorSpot = { a: number; f: number; hug?: "left" };

/** 테마 장식 배치: 보통 방 / 펜트하우스 */
export function xmasLayout(penthouse: boolean) {
  return penthouse
    ? { fireA: 0.42, gifts: { a: 0.66, f: 0.2 } as DecorSpot, snowman: { a: 0.74, f: 0.94 } as DecorSpot }
    : { fireA: 0.5, gifts: { a: 0, f: 0.88, hug: "left" } as DecorSpot, snowman: { a: 0.63, f: 0.95 } as DecorSpot };
}

/** 바닥 자리(a, f)에 폭 w(가구 좌표) 장식을 놓을 방 좌표 x, y. 상자 테두리 안쪽으로 */
export function decorPoint(g: Geom, spot: DecorSpot, w: number, s: number, margin: number) {
  const [px, y] = floorPt(g, spot.a, spot.f);
  const x0 = g.bx0 * (1 - spot.f) + margin;
  const x1 = g.bx1 + (g.W - g.bx1) * spot.f - margin;
  const half = (w / 2) * s;
  const x = spot.hug === "left" ? x0 + half : Math.min(Math.max(px, x0 + half), x1 - half);
  return { x, y };
}

/** 창문 위 리스 자리 (보통 방 창문 / 펜트하우스 야경 창) */
export function wreathSpot(g: Geom, penthouse: boolean) {
  const bw = g.bx1 - g.bx0;
  const bh = g.by1 - g.by0;
  if (penthouse) {
    const wx = g.bx1 - bw * 0.3;
    const ww = bw * 0.24;
    return { cx: wx + ww / 2, cy: g.by0 + bh * 0.34, r: Math.min(ww * 0.24, bh * 0.13) };
  }
  const w = bw * 0.2;
  const x = g.bx0 + bw * 0.66;
  const y = g.by0 + bh * 0.18;
  const h = bh * 0.34;
  return { cx: x + w / 2, cy: y + h * 0.46, r: Math.min(w * 0.3, h * 0.36) };
}
