import type { ReactNode } from "react";
import { FRAME, INK, PAPER, WOOD, WOOD_D, line, thin } from "./style";

// 꾸미기 확장 가구 24종 (docs/art-reference/furniture-extra.webp).
// 바닥 가구는 바닥에 닿는 가운데를 (0,0)으로, 벽 가구는 가운데를 (0,0)으로 그린다. 캐릭터 키 ≈ 58 단위.

const BLUE = "#9CC3EE";
const BLUE_D = "#7FA7E0";
const SKY = "#CFE4F8";
const MINT = "#8FDCB2";
const MINT_D = "#6FC49A";
const PINK = "#F7A9C4";
const LAV = "#C8B2EE";
const LAV_D = "#B39BE0";
const DARK = "#4A4850";
const IRON = "#6B6E75";
const GLASS = "#EAF5FC";
const GOLD = "#F7D35A";
const GOLD_D = "#E3B53C";
const HI = { stroke: "#fff", strokeWidth: 1.1, strokeLinecap: "round" as const, fill: "none", opacity: 0.8 };

/* ---------- 운동 기구 ---------- */

export function ShakerStand() {
  return (
    <g>
      {/* 나무 선반 */}
      <path d="M-11 -12 V0 M11 -12 V0" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M-11 -12 V0 M11 -12 V0" stroke="#C9CBCF" strokeWidth={1} strokeLinecap="round" />
      <rect x="-12.5" y="-5.4" width="25" height="2.4" rx="1" fill={WOOD} {...thin} />
      <rect x="-13.5" y="-14" width="27" height="3.4" rx="1.2" fill={WOOD} {...line} />
      {/* 쉐이커 */}
      <rect x="-6" y="-16.6" width="12" height="2.6" rx="0.8" fill={DARK} {...thin} />
      <path d="M-5.4 -16.6 L-6.2 -31 H6.2 L5.4 -16.6 Z" fill={GLASS} {...line} />
      <path d="M2.6 -28 H4.6 M2.8 -25 H4.6 M3 -22 H4.6" stroke="#9AA6B8" strokeWidth={0.8} strokeLinecap="round" />
      <rect x="-7" y="-35" width="14" height="4.4" rx="1.4" fill={BLUE} {...line} />
      <path d="M-3.4 -35 L-2.8 -39 H3.6 L4.2 -35 Z" fill={BLUE} {...thin} />
      <rect x="-2" y="-41.6" width="4.6" height="2.8" rx="1" fill={BLUE_D} {...thin} />
      <path d="M-3.6 -28 V-20" {...HI} />
    </g>
  );
}

export function Blender() {
  return (
    <g>
      <rect x="-8" y="-2.4" width="3.6" height="2.4" rx="0.8" fill={DARK} />
      <rect x="4.4" y="-2.4" width="3.6" height="2.4" rx="0.8" fill={DARK} />
      <path d="M-9.6 -1.6 L-8 -14 H8 L9.6 -1.6 Q0 0.4 -9.6 -1.6 Z" fill={BLUE} {...line} />
      <circle cx="0" cy="-7.4" r="3.4" fill={PAPER} {...thin} />
      <circle cx="0" cy="-7.4" r="1.4" fill="#C9CBCF" {...thin} strokeWidth={0.7} />
      {/* 유리 통 */}
      <path d="M-7.4 -14 L-9.6 -38 H8.6 L6.6 -14 Z" fill={GLASS} {...line} />
      <path d="M8.2 -34 Q14.6 -33 13.6 -25 Q12.8 -19 7.2 -19" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M8.2 -34 Q14.6 -33 13.6 -25 Q12.8 -19 7.2 -19" fill="none" stroke={GLASS} strokeWidth={1} strokeLinecap="round" />
      <path d="M0 -32 V-20 M0 -32 H2 M0 -28 H2 M0 -24 H2" stroke="#9AA6B8" strokeWidth={0.8} strokeLinecap="round" />
      <rect x="-10.6" y="-41.4" width="20.2" height="4" rx="1.4" fill={DARK} {...thin} />
      <rect x="-2.4" y="-44.4" width="4.6" height="3.2" rx="1" fill={DARK} {...thin} />
      <path d="M-6 -33 L-4.8 -18" {...HI} />
    </g>
  );
}

export function MiniFridge() {
  return (
    <g>
      <rect x="-12" y="-2.6" width="5" height="2.6" rx="1" fill={BLUE_D} {...thin} />
      <rect x="7" y="-2.6" width="5" height="2.6" rx="1" fill={BLUE_D} {...thin} />
      <rect x="-15" y="-38" width="30" height="36" rx="5" fill={SKY} {...line} />
      <path d="M-15 -30 H15" stroke={INK} strokeWidth={1} opacity="0.5" />
      <rect x="-12.4" y="-24.6" width="2.6" height="9" rx="1.3" fill="#fff" {...thin} />
      <path d="M10.4 -35 Q12 -35 12 -32 M11.6 -26 V-8" {...HI} />
    </g>
  );
}

export function YogaSet() {
  return (
    <g>
      {/* 블록 두 개 */}
      <rect x="-21" y="-9.4" width="20" height="9.4" rx="2" fill={PINK} {...line} />
      <rect x="-21" y="-19" width="20" height="9.6" rx="2" fill={LAV} {...line} />
      <path d="M-18.6 -16.6 H-6" {...HI} opacity={0.6} />
      {/* 세워 둔 매트 */}
      <rect x="2" y="-29" width="15" height="29" rx="3" fill={MINT} {...line} />
      <ellipse cx="9.5" cy="-29" rx="7.5" ry="2.6" fill="#B5EBCD" {...line} />
      <path d="M6.6 -29.4 Q9.5 -31 12.4 -29.4 Q9.5 -27.6 6.6 -29.4" fill="none" stroke={MINT_D} strokeWidth={0.9} />
      <rect x="2" y="-23" width="15" height="3.4" fill={DARK} {...thin} />
      <rect x="2" y="-8" width="15" height="3.4" fill={DARK} {...thin} />
    </g>
  );
}

function Kettlebell({ x, r, c }: { x: number; r: number; c: string }) {
  return (
    <g>
      <path d={`M${x - r * 0.55} ${-r * 1.6} Q${x - r * 0.75} ${-r * 2.55} ${x} ${-r * 2.55} Q${x + r * 0.75} ${-r * 2.55} ${x + r * 0.55} ${-r * 1.6}`} fill="none" stroke={INK} strokeWidth={r * 0.55 + 1.4} strokeLinecap="round" />
      <path d={`M${x - r * 0.55} ${-r * 1.6} Q${x - r * 0.75} ${-r * 2.55} ${x} ${-r * 2.55} Q${x + r * 0.75} ${-r * 2.55} ${x + r * 0.55} ${-r * 1.6}`} fill="none" stroke={c} strokeWidth={r * 0.55 - 0.6} strokeLinecap="round" />
      <path d={`M${x - r * 0.7} 0 Q${x - r} ${-0.3} ${x - r} ${-r} A${r} ${r} 0 1 1 ${x + r} ${-r} Q${x + r} ${-0.3} ${x + r * 0.7} 0 Z`} fill={c} {...line} />
      <path d={`M${x - r * 0.55} ${-r * 1.3} Q${x - r * 0.3} ${-r * 1.65} ${x} ${-r * 1.7}`} {...HI} />
    </g>
  );
}

export function KettlebellSet() {
  return (
    <g>
      <Kettlebell x={12} r={8.6} c={DARK} />
      <Kettlebell x={-2} r={6.8} c={BLUE} />
      <Kettlebell x={-15} r={4.8} c={PINK} />
    </g>
  );
}

/** 벽 */
export function JumpRopeHook() {
  return (
    <g>
      <rect x="-3.6" y="-16" width="7.2" height="8" rx="1.4" fill={WOOD_D} {...line} />
      <path d="M0 -11 V-8.6 Q0 -6.6 2 -7" fill="none" stroke={IRON} strokeWidth={1.4} strokeLinecap="round" />
      {/* 감아 걸어 둔 줄 */}
      <ellipse cx="0" cy="-1" rx="6.6" ry="7.6" fill="none" stroke={INK} strokeWidth={2.6} />
      <ellipse cx="0" cy="-1" rx="6.6" ry="7.6" fill="none" stroke={BLUE_D} strokeWidth={1.1} />
      <ellipse cx="0.6" cy="-0.4" rx="4.6" ry="5.8" fill="none" stroke={INK} strokeWidth={2.4} />
      <ellipse cx="0.6" cy="-0.4" rx="4.6" ry="5.8" fill="none" stroke={BLUE_D} strokeWidth={0.9} />
      <path d="M-5 4 L-6 8 M5 4 L6 8" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      <rect x="-8" y="7.6" width="4" height="9" rx="2" fill={BLUE} {...line} />
      <rect x="4" y="7.6" width="4" height="9" rx="2" fill={BLUE} {...line} />
    </g>
  );
}

export function PullupBar() {
  return (
    <g>
      <rect x="-21" y="-46" width="4" height="46" rx="0.8" fill={WOOD} {...line} />
      <rect x="17" y="-46" width="4" height="46" rx="0.8" fill={WOOD} {...line} />
      <rect x="-22.6" y="-48.6" width="45.2" height="4" rx="0.8" fill={WOOD} {...line} />
      <path d="M-22 -38 H22" stroke={INK} strokeWidth={3.2} strokeLinecap="round" />
      <path d="M-22 -38 H22" stroke="#C9CBCF" strokeWidth={1.4} strokeLinecap="round" />
      <rect x="-13" y="-39.8" width="7" height="3.6" rx="1.6" fill={DARK} {...thin} />
      <rect x="6" y="-39.8" width="7" height="3.6" rx="1.6" fill={DARK} {...thin} />
      <rect x="-24" y="-40.2" width="3.4" height="4.4" rx="1" fill={IRON} {...thin} />
      <rect x="20.6" y="-40.2" width="3.4" height="4.4" rx="1" fill={IRON} {...thin} />
    </g>
  );
}

export function RowingMachine() {
  return (
    <g>
      {/* 레일 */}
      <path d="M-14 -6 L24 -8" stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
      <path d="M-14 -6 L24 -8" stroke="#8E8A8B" strokeWidth={1.8} strokeLinecap="round" />
      <rect x="21" y="-8" width="4" height="8" rx="1" fill={DARK} {...thin} />
      <rect x="18" y="-2" width="9" height="2.4" rx="1.2" fill={DARK} {...thin} />
      {/* 받침 프레임 */}
      <path d="M-22 -16 L-10 -2" stroke={INK} strokeWidth={3.4} strokeLinecap="round" />
      <path d="M-22 -16 L-10 -2" stroke={DARK} strokeWidth={1.8} strokeLinecap="round" />
      <rect x="-28" y="-2.4" width="10" height="2.6" rx="1.2" fill={DARK} {...thin} />
      <rect x="-12" y="-2.4" width="6" height="2.6" rx="1.2" fill={DARK} {...thin} />
      {/* 좌석 */}
      <rect x="6" y="-12" width="10" height="3.4" rx="1.6" fill={DARK} {...thin} />
      {/* 발판 */}
      <path d="M-10 -8 L-4 -13" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M-10 -8 L-4 -13" stroke={IRON} strokeWidth={1.2} strokeLinecap="round" />
      {/* 플라이휠 · 손잡이 */}
      <circle cx="-22" cy="-17" r="7.6" fill={BLUE} {...line} />
      <circle cx="-22" cy="-17" r="3.6" fill={DARK} {...thin} />
      <path d="M-16.6 -21 L-10 -26" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
      <path d="M-11.6 -28 L-8 -24" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      <path d="M-11.6 -28 L-8 -24" stroke={DARK} strokeWidth={1} strokeLinecap="round" />
      <path d="M-25 -21 Q-23 -23 -20.6 -23.2" {...HI} />
    </g>
  );
}

export function SpinBike() {
  return (
    <g>
      {/* 바닥 받침 */}
      <rect x="-16" y="-2.6" width="12" height="2.6" rx="1.2" fill={DARK} {...thin} />
      <rect x="6" y="-2.6" width="12" height="2.6" rx="1.2" fill={DARK} {...thin} />
      {/* 프레임 */}
      <path d="M-10 -2 L-6.4 -28 M-8.4 -14 L8 -12 M12 -2 L8 -12 L10.4 -34" fill="none" stroke={INK} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M-10 -2 L-6.4 -28 M-8.4 -14 L8 -12 M12 -2 L8 -12 L10.4 -34" fill="none" stroke={BLUE} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      {/* 플라이휠 */}
      <circle cx="9" cy="-11" r="8.4" fill="#C9CBCF" {...line} />
      <circle cx="9" cy="-11" r="5" fill="#fff" {...thin} />
      <path d="M6 -7.6 A5 5 0 0 0 13.6 -12.4" fill="none" stroke={BLUE_D} strokeWidth={2} />
      {/* 페달 */}
      <circle cx="-4" cy="-12" r="3.2" fill={BLUE} {...thin} />
      <path d="M-4 -12 L-1 -7.6" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      <rect x="-2.6" y="-7.6" width="4" height="1.6" rx="0.6" fill={DARK} />
      {/* 안장 · 핸들 */}
      <path d="M-13 -30.6 Q-8 -33.6 -0.6 -31 Q-1.4 -27.6 -6 -27.6 Q-11 -27.4 -13 -30.6 Z" fill={DARK} {...line} />
      <path d="M10.4 -34 L16 -37 Q19.6 -39 18.6 -43.4" fill="none" stroke={INK} strokeWidth={3.6} strokeLinecap="round" />
      <path d="M10.4 -34 L16 -37 Q19.6 -39 18.6 -43.4" fill="none" stroke={DARK} strokeWidth={1.8} strokeLinecap="round" />
    </g>
  );
}

/** 벽 */
export function StretchFrame() {
  return (
    <g>
      <rect x="-12" y="-15" width="24" height="30" rx="1.6" fill={FRAME} {...line} />
      <rect x="-9" y="-12" width="18" height="24" fill="#EEF0F5" {...thin} />
      {/* 옆구리 늘리기: 한 팔을 머리 위로 넘기고 다른 손은 허리에 */}
      <g fill="none" stroke="#7FA0CC" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
        <path d="M-1 -1 Q-0.4 3 -0.6 4.6 L-4 9.4 M-0.6 4.6 L3 9.4" />
        <path d="M-1 -1 Q-3.6 -0.6 -3.4 2.4" />
        <path d="M0 -2.6 Q2 -8 0 -11 Q-2.4 -12.6 -5 -10.4" />
      </g>
      <path d="M-3.4 -3 Q-1 -1.4 1 -3.4 L0.6 1.4 Q-1 2.4 -2.6 1.4 Z" fill="#7FA0CC" />
      <circle cx="-3.6" cy="-6" r="2.6" fill="#7FA0CC" />
      <path d="M-6.6 9.6 H6.6" stroke="#9AA6B8" strokeWidth={0.9} strokeLinecap="round" />
    </g>
  );
}

/* ---------- 휴식 가구 ---------- */

/** 벽 */
export function HeartNeon() {
  const heart = "M0 12 C-6 7 -15 1 -15 -6 C-15 -11 -11 -14 -7 -14 C-3.6 -14 -1.4 -12 0 -9.6 C1.4 -12 3.6 -14 7 -14 C11 -14 15 -11 15 -6 C15 1 6 7 0 12 Z";
  return (
    <g transform="scale(0.88)">
      <path d={heart} fill="none" stroke="#FCD3E1" strokeWidth={5.4} opacity="0.7" />
      <path d={heart} fill="none" stroke="#F27FA6" strokeWidth={2.6} strokeLinejoin="round" />
      <path d={heart} fill="none" stroke="#FFF2F7" strokeWidth={0.9} strokeLinejoin="round" />
      <path d="M8 6.4 Q11 9 12.4 13" fill="none" stroke={DARK} strokeWidth={1} strokeLinecap="round" />
      <rect x="10.6" y="12.6" width="4" height="4.4" rx="1" fill={DARK} {...thin} />
    </g>
  );
}

export function Bookshelf() {
  const books: [number, number, string][] = [
    [-15.4, 8, "#6FA8F0"], [-12.6, 9, "#8FDCB2"], [-9.6, 8.4, "#F7A9C4"], [-6.8, 9, "#F7D35A"],
  ];
  const books2: [number, number, string][] = [
    [-1.6, 8.4, "#F47F7F"], [1.2, 9, "#8FDCB2"], [4, 8, "#C8B2EE"], [6.8, 9, "#6FA8F0"], [9.6, 8.6, "#F7A9C4"],
  ];
  return (
    <g>
      <rect x="-19" y="-44" width="38" height="44" rx="1.6" fill={WOOD_D} {...line} />
      <rect x="-16.6" y="-41.6" width="33.2" height="12.4" fill="#F3DCC0" {...thin} />
      <rect x="-16.6" y="-27" width="33.2" height="12.4" fill="#F3DCC0" {...thin} />
      <rect x="-16.6" y="-12.4" width="33.2" height="10" fill={WOOD} {...thin} />
      <path d="M0 -12.4 V-2.4" stroke={INK} strokeWidth={1} />
      <path d="M-10 -7.6 H-6 M6 -7.6 H10" stroke={INK} strokeWidth={1.4} strokeLinecap="round" />
      {/* 위 칸: 책 + 트로피 + 공 */}
      {books.map(([x, h, c]) => (
        <rect key={x} x={x} y={-29.2 - h} width="2.6" height={h} fill={c} {...thin} strokeWidth={0.7} />
      ))}
      <path d="M1 -38.6 H7 Q7 -34 4 -33.4 Q1 -34 1 -38.6 Z" fill={GOLD} {...thin} />
      <rect x="2.4" y="-31.6" width="3.2" height="2.2" fill={GOLD_D} {...thin} strokeWidth={0.7} />
      <circle cx="12.6" cy="-33.4" r="3.8" fill="#fff" {...thin} />
      <path d="M12.6 -35 l1.4 1 -0.6 1.6 h-1.6 l-0.6 -1.6 z" fill={DARK} />
      {/* 가운데 칸: 농구공 + 책 */}
      <circle cx="-11" cy="-19" r="4.6" fill="#F39A5B" {...thin} />
      <path d="M-15.6 -19 H-6.4 M-11 -23.6 V-14.4 M-14.4 -22 Q-11.6 -19 -14.4 -16 M-7.6 -22 Q-10.4 -19 -7.6 -16" fill="none" stroke={INK} strokeWidth={0.7} />
      {books2.map(([x, h, c]) => (
        <rect key={x} x={x} y={-14.6 - h} width="2.6" height={h} fill={c} {...thin} strokeWidth={0.7} />
      ))}
      <rect x="12.6" y="-21.8" width="2.6" height="7.2" fill="#F7D35A" {...thin} strokeWidth={0.7} transform="rotate(14 13.9 -14.6)" />
    </g>
  );
}

export function GamingChair() {
  return (
    <g>
      {/* 바퀴 다리 */}
      <path d="M0 -10 V-3 M-12 -1.6 L12 -1.6 M-8 -4 L0 -2 L8 -4" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M0 -10 V-3 M-12 -1.6 L12 -1.6" stroke={DARK} strokeWidth={1.2} strokeLinecap="round" />
      {[-12, -5, 5, 12].map((x) => (
        <circle key={x} cx={x} cy="0" r="1.8" fill={DARK} {...thin} strokeWidth={0.8} />
      ))}
      {/* 등받이 */}
      <path d="M-10 -15 L-11.4 -42 Q-11 -48 -6 -49 H6 Q11 -48 11.4 -42 L10 -15 Z" fill={BLUE} {...line} />
      <path d="M-5 -46 L-5.6 -16 M5 -46 L5.6 -16" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" opacity="0.85" />
      <rect x="-5" y="-45" width="10" height="5" rx="2" fill={BLUE_D} {...thin} />
      {/* 좌석 · 팔걸이 */}
      <rect x="-13" y="-16" width="26" height="6.4" rx="3" fill={BLUE} {...line} />
      <path d="M-15 -14 V-22 H-11 M15 -14 V-22 H11" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M-15 -14 V-22 H-11 M15 -14 V-22 H11" fill="none" stroke={DARK} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}

export function Beanbag() {
  return (
    <g>
      <path d="M-20 -1.4 C-24 -6 -22 -16 -15 -22 C-9 -28 2 -30 10 -27 C18 -24 23 -16 22 -8 C21.6 -3 19 -0.6 14 0 Q0 1.6 -14 0.4 Q-18 0 -20 -1.4 Z" fill={LAV} {...line} />
      <path d="M-14 -5 Q0 -9 16 -5" fill="none" stroke={LAV_D} strokeWidth={1.2} strokeLinecap="round" />
      <path d="M0 -24 Q-2 -20 -4 -19 M0 -24 Q3 -21 5 -20.6 M0 -24 Q0 -19 1 -17" fill="none" stroke={LAV_D} strokeWidth={1} strokeLinecap="round" />
      <path d="M-15 -16 Q-12 -21 -6 -24" {...HI} />
    </g>
  );
}

export function Aquarium() {
  return (
    <g>
      <rect x="-21" y="-4" width="42" height="4" rx="1" fill={DARK} {...line} />
      <rect x="-20" y="-30" width="40" height="26" fill="#BFE4F7" {...line} />
      <rect x="-21.6" y="-33" width="43.2" height="3.6" rx="1" fill={DARK} {...line} />
      <path d="M-20 -26.4 H20" stroke="#E6F5FC" strokeWidth={1.2} />
      {/* 모래 · 성 · 수초 */}
      <path d="M-19.4 -4.6 Q-10 -8 0 -6.6 Q10 -8 19.4 -5.4 V-4.6 Z" fill="#F2DDB0" />
      {[-15, -10, -4, 6, 13].map((x, i) => (
        <circle key={x} cx={x} cy={-5.6 - (i % 2)} r="0.9" fill="#D9B98A" />
      ))}
      <path d="M-6 -6 V-15 H-4 V-13 H-2 V-15 H0 V-13 H2 V-15 H4 V-6 Z" fill="#D9CBB4" {...thin} strokeWidth={0.8} />
      <path d="M-1.4 -15 V-20 L1 -23 L3.4 -20 V-15" fill="#D9CBB4" {...thin} strokeWidth={0.8} />
      <path d="M-1.4 -20 L1 -23 L3.4 -20 Z" fill={BLUE_D} {...thin} strokeWidth={0.8} />
      <path d="M-0.2 -8.4 Q1 -10 2.2 -8.4 V-6 H-0.2 Z" fill={INK} opacity="0.6" />
      <path d="M-16 -6 Q-18 -12 -15.6 -17 Q-14 -12 -14.6 -6 M-13 -6 Q-11 -11 -13 -15 M14 -6 Q12 -12 15 -18 Q16.4 -12 15.6 -6 M17 -6 Q18.6 -10 17 -13" fill="none" stroke="#5FB389" strokeWidth={1.6} strokeLinecap="round" />
      {/* 금붕어 */}
      <path d="M8 -19 Q11 -22 14 -19 Q11 -16 8 -19 Z M14 -19 L16.4 -21 V-17 Z" fill="#F39A5B" {...thin} strokeWidth={0.7} />
      <circle cx="9.6" cy="-19.4" r="0.5" fill={INK} />
      <circle cx="6" cy="-23" r="0.9" fill="none" stroke="#fff" strokeWidth={0.6} />
      <circle cx="5" cy="-26" r="0.6" fill="none" stroke="#fff" strokeWidth={0.6} />
      <path d="M-17 -27 V-9" {...HI} opacity={0.6} />
    </g>
  );
}

/** 둥근 쿠션 침대 (고양이 · 강아지 공통) */
function PetBed({ c, cd, children }: { c: string; cd: string; children: ReactNode }) {
  return (
    <g>
      <ellipse cx="0" cy="-6.4" rx="21" ry="7.2" fill={c} {...line} />
      <path d="M-21 -6.4 V-4 Q-20 0 0 0.4 Q20 0 21 -4 V-6.4" fill={cd} {...line} />
      <ellipse cx="0" cy="-8.2" rx="15.4" ry="4.4" fill={shadeInner(c)} {...thin} />
      {children}
      {/* 앞쪽 테두리를 동물 위로 다시 */}
      <path d="M-20.6 -5 Q0 4 20.6 -5 Q20 -1 0 -0.4 Q-20 -1 -20.6 -5 Z" fill={c} {...line} />
    </g>
  );
}
const shadeInner = (c: string) => (c === "#E9D6BE" ? "#F5EADB" : "#D9E9FA");

export function CatBed() {
  return (
    <PetBed c="#E9D6BE" cd="#D6BC9C">
      {/* 웅크려 자는 회색 고양이 */}
      <path d="M-11 -6 C-13 -13 -6 -18 3 -17 C11 -16.4 15 -12 13.6 -7 Q8 -3.6 -4 -4 Q-10 -4.4 -11 -6 Z" fill="#8C8B93" {...line} />
      <path d="M9 -6.4 Q15 -7 14.4 -11" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M9 -6.4 Q15 -7 14.4 -11" fill="none" stroke="#8C8B93" strokeWidth={1.2} strokeLinecap="round" />
      <path d="M-4 -15 Q2 -13 7 -15" fill="none" stroke="#6E6D75" strokeWidth={1} strokeLinecap="round" />
      {/* 머리 */}
      <path d="M-16 -9 L-15.4 -16.4 L-12 -13.4 Q-9 -14.6 -6 -13.4 L-2.6 -16.4 L-2.2 -9 Q-3 -4.6 -9 -4.4 Q-15 -4.6 -16 -9 Z" fill="#8C8B93" {...line} />
      <path d="M-12.6 -9.6 Q-9 -11.4 -6 -9.6 Q-6 -5.6 -9.2 -5.4 Q-12.6 -5.6 -12.6 -9.6 Z" fill="#fff" />
      <path d="M-13.6 -9.6 Q-12.6 -8.6 -11.6 -9.6 M-7 -9.6 Q-6 -8.6 -5 -9.6" fill="none" stroke={INK} strokeWidth={0.8} strokeLinecap="round" />
      <path d="M-9.6 -7.6 l0.5 0.5 0.5 -0.5" fill="none" stroke={INK} strokeWidth={0.6} />
      <path d="M-14.6 -15 l0.8 1.6 M-3.6 -15 l-0.8 1.6" stroke="#F7A9C4" strokeWidth={1} strokeLinecap="round" />
    </PetBed>
  );
}

export function DogBed() {
  const FUR = "#E9B877";
  const EAR = "#C98F4E";
  return (
    <PetBed c="#9CC3EE" cd="#7FA7E0">
      {/* 웅크려 자는 강아지 */}
      <path d="M-9 -6 C-11 -13.6 -3 -18 5 -17 C12.6 -16 16 -12 14.4 -7 Q8 -3.6 -3 -4 Q-8 -4.4 -9 -6 Z" fill={FUR} {...line} />
      <path d="M10 -6.4 Q16 -7.6 15 -12" fill="none" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M10 -6.4 Q16 -7.6 15 -12" fill="none" stroke={FUR} strokeWidth={1.2} strokeLinecap="round" />
      {/* 머리 + 늘어진 귀 */}
      <path d="M-17 -9 C-17.6 -14 -13.6 -16.6 -9.6 -16.4 C-5.6 -16.2 -2.4 -13.6 -2.6 -9.4 Q-3 -4.6 -9.6 -4.4 Q-16 -4.6 -17 -9 Z" fill={FUR} {...line} />
      <path d="M-6 -15.4 C-2.4 -15 -0.6 -11 -2 -6.6 C-4.4 -7.4 -5.6 -10.4 -6 -15.4 Z" fill={EAR} {...thin} />
      <ellipse cx="-15.6" cy="-8" rx="2.4" ry="1.8" fill="#F5D7AE" />
      <circle cx="-17" cy="-8.6" r="0.9" fill={INK} />
      <path d="M-12.6 -10.6 Q-11.4 -9.6 -10.2 -10.6" fill="none" stroke={INK} strokeWidth={0.8} strokeLinecap="round" />
    </PetBed>
  );
}

/* ---------- 계절 · 특별 ---------- */

export function XmasTree() {
  const tier = (y: number, w: number, h: number) => `M0 ${y - h} L${w} ${y} Q0 ${y + 2.4} ${-w} ${y} Z`;
  return (
    <g>
      <path d="M-5 -8 L-4 0 H4 L5 -8 Z" fill="#C98F4E" {...line} />
      <rect x="-1.6" y="-11" width="3.2" height="3.6" fill={WOOD_D} {...thin} />
      <path d={tier(-10, 15, 14)} fill="#5FAE7A" {...line} />
      <path d={tier(-20, 12, 13)} fill="#68B984" {...line} />
      <path d={tier(-30, 9, 12)} fill="#74C38F" {...line} />
      {[[-8, -13, "#F47FA4"], [6, -15, "#6FA8F0"], [-2, -18, GOLD], [9, -12, GOLD], [-5, -25, "#6FA8F0"], [4, -24, "#F47FA4"], [-10, -12, "#C8B2EE"], [1, -32, "#F47F7F"]].map(([x, y, c]) => (
        <circle key={`${x},${y}`} cx={x as number} cy={y as number} r="1.5" fill={c as string} {...thin} strokeWidth={0.7} />
      ))}
      <path d="M0 -46 l1.6 3.2 3.5 0.5 -2.5 2.4 0.6 3.5 -3.2 -1.7 -3.2 1.7 0.6 -3.5 -2.5 -2.4 3.5 -0.5z" fill={GOLD} {...thin} />
    </g>
  );
}

export function JackOLantern() {
  return (
    <g>
      <rect x="-11" y="-6.4" width="22" height="6.4" rx="2.4" fill={DARK} {...line} />
      <path d="M-1 -32 Q-12 -32 -14.6 -21 Q-16 -11 -8 -7 Q0 -5 8 -7 Q16 -11 14.6 -21 Q12 -32 1 -32 Z" fill="#F39A5B" {...line} />
      <path d="M-5.6 -31 Q-9 -20 -5 -7.6 M5.6 -31 Q9 -20 5 -7.6" fill="none" stroke="#DD7D3E" strokeWidth={1.1} />
      <ellipse cx="0" cy="-31.6" rx="6" ry="1.8" fill="#C46A2E" {...thin} />
      {/* 얼굴 (안에서 빛나는 노랑) */}
      <path d="M-9 -21 L-5 -25 L-3 -20.6 Z M9 -21 L5 -25 L3 -20.6 Z" fill="#5A3A26" />
      <path d="M-9.6 -16 Q0 -11 9.6 -16 Q8 -10.6 0 -10 Q-8 -10.6 -9.6 -16 Z" fill="#5A3A26" />
      <path d="M-4 -14.2 V-12.2 H-1 V-14 M2 -14 V-12 H4.6 V-14.6" fill="#F39A5B" />
    </g>
  );
}

export function CherryVase() {
  const blossom = (x: number, y: number) => (
    <g key={`${x},${y}`} transform={`translate(${x} ${y})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <circle key={a} cx={1.7 * Math.sin((a * Math.PI) / 180)} cy={-1.7 * Math.cos((a * Math.PI) / 180)} r="1.5" fill="#F9C6D6" stroke="#E995AF" strokeWidth={0.5} />
      ))}
      <circle r="0.8" fill="#E06B8A" />
    </g>
  );
  return (
    <g>
      <path d="M0 -14 Q-1 -24 -8 -32 M0 -16 Q2 -28 9 -36 M-1 -22 Q-6 -26 -12 -26 M3 -26 Q8 -28 11 -26" fill="none" stroke="#7A5A4C" strokeWidth={1.4} strokeLinecap="round" />
      {[[-8, -32], [9, -36], [-12, -26], [11, -26], [-4, -38], [4, -30], [-10, -35], [14, -32]].map(([x, y]) => blossom(x, y))}
      {/* 유리 화병 */}
      <path d="M-3.4 -18 V-15 Q-8 -12 -8 -6 Q-8 0 0 0 Q8 0 8 -6 Q8 -12 3.4 -15 V-18 Z" fill={GLASS} {...line} />
      <path d="M-7.4 -8 Q0 -6.4 7.4 -8 Q7.6 -0.6 0 -0.6 Q-7.6 -0.6 -7.4 -8 Z" fill="#BFE4F7" />
      <path d="M-5.4 -10 Q-6 -6 -4.6 -3" {...HI} />
    </g>
  );
}

export function Fan() {
  return (
    <g>
      <ellipse cx="0" cy="-2.4" rx="10" ry="2.8" fill={MINT} {...line} />
      <rect x="-1.8" y="-24" width="3.6" height="21" fill="#fff" {...line} />
      <circle cx="0" cy="-34" r="13" fill="#F4FBF7" {...line} />
      {[0, 120, 240].map((a) => (
        <path key={a} d="M0 0 C-4 -3 -4 -9 0 -10.4 C4 -9 4 -3 0 0 Z" transform={`translate(0 -34) rotate(${a + 20})`} fill={MINT} stroke={MINT_D} strokeWidth={0.8} />
      ))}
      <circle cx="0" cy="-34" r="2.4" fill={MINT_D} {...thin} />
      {/* 철망 */}
      <g fill="none" stroke="#9AA6B8" strokeWidth={0.5} opacity="0.8">
        {[-8, -4, 0, 4, 8].map((x) => (
          <path key={x} d={`M${x} ${-34 - Math.sqrt(169 - x * x)} V${-34 + Math.sqrt(169 - x * x)}`} />
        ))}
      </g>
      <circle cx="0" cy="-34" r="13" fill="none" {...line} />
    </g>
  );
}

export function Heater() {
  return (
    <g>
      <rect x="-12" y="-2.4" width="6" height="2.4" rx="1" fill={DARK} />
      <rect x="6" y="-2.4" width="6" height="2.4" rx="1" fill={DARK} />
      <rect x="-14" y="-38" width="28" height="36" rx="5" fill={PAPER} {...line} />
      <rect x="-10.4" y="-34" width="20.8" height="16" rx="1.6" fill={DARK} {...thin} />
      <rect x="-8.6" y="-29.6" width="17.2" height="10" fill="#F39A5B" />
      {[-27.4, -25, -22.6, -20.2].map((y) => (
        <path key={y} d={`M-8.6 ${y} H8.6`} stroke="#FCD3A7" strokeWidth={1} />
      ))}
      <path d="M-8.6 -29.6 H8.6" stroke={DARK} strokeWidth={0.6} />
      <circle cx="0" cy="-10" r="3.4" fill="#fff" {...thin} />
      <path d="M0 -10 V-12.6" stroke={INK} strokeWidth={0.9} strokeLinecap="round" />
    </g>
  );
}

/** 벽 */
export function StringLights() {
  const bulbs = [-14, -7, 0, 7, 14];
  const y = (x: number) => -6 + (x * x) / 40;
  return (
    <g>
      <path d="M-17 -10 Q0 4 17 -10" fill="none" stroke={DARK} strokeWidth={1.2} strokeLinecap="round" />
      <circle cx="-17" cy="-10" r="0.9" fill={DARK} />
      <circle cx="17" cy="-10" r="0.9" fill={DARK} />
      {bulbs.map((x) => (
        <g key={x} transform={`translate(${x} ${y(x) + (x === 0 ? 1 : 0.4)})`}>
          <circle cx="0" cy="4.6" r="4.6" fill="#FFF1B8" opacity="0.6" />
          <rect x="-1.2" y="-0.4" width="2.4" height="2.2" fill={DARK} />
          <circle cx="0" cy="4" r="2.4" fill="#FFE38A" {...thin} strokeWidth={0.8} />
        </g>
      ))}
    </g>
  );
}

/* ---------- 펜트하우스 전용 ---------- */

export function GoldStatue() {
  return (
    <g>
      <rect x="-12" y="-6" width="24" height="6" rx="1" fill={DARK} {...line} />
      <path d="M-10 -6 L-8.6 -9.4 H8.6 L10 -6 Z" fill="#3A383F" {...thin} />
      {/* 각진 황금 조각 */}
      <path d="M-8 -9.4 L-10 -20 L-4 -26 L-8 -36 L0 -48 L3 -38 L9 -44 L8 -30 L11 -22 L6 -16 L8 -9.4 Z" fill={GOLD} {...line} />
      <path d="M-4 -26 L2 -28 L3 -38 M2 -28 L8 -30 M2 -28 L1 -18 L-10 -20 M1 -18 L6 -16 M1 -18 L-1 -9.4" fill="none" stroke={GOLD_D} strokeWidth={1} strokeLinejoin="round" />
      <path d="M-4 -26 L-8 -36 L0 -48 L2 -28 Z" fill="#FBE59A" />
      <path d="M-4 -26 L-8 -36 L0 -48 L3 -38" fill="none" {...line} strokeWidth={1} />
      <path d="M-5 -36 L-1.6 -43" {...HI} />
      <path d="M13 -40 l1 2 2 1 -2 1 -1 2 -1 -2 -2 -1 2 -1z" fill={GOLD} />
    </g>
  );
}
