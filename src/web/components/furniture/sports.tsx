import { FRAME, INK, PAPER, WOOD, WOOD_D, line, thin } from "./style";

// 종목별 가구. 바닥 가구는 바닥에 닿는 가운데를 (0,0)으로, 벽 가구는 가운데를 (0,0)으로 그린다.

const GREY = "#8E8A8B";
const IRON = "#5E5859";

/* 헬스 */
export function Bench() {
  return (
    <g>
      <path d="M-15 -8 L-17 0 M-13 -8 L-11 0 M13 -8 L11 0 M15 -8 L17 0" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M-15 -8 L-17 0 M-13 -8 L-11 0 M13 -8 L11 0 M15 -8 L17 0" stroke={GREY} strokeWidth={1} strokeLinecap="round" />
      <rect x="-18" y="-9.4" width="36" height="2.6" rx="1" fill={GREY} {...thin} />
      <rect x="-21" y="-14.6" width="42" height="5.6" rx="2.8" fill="#7FA7E8" {...line} />
      <path d="M-17 -12.8 H14" stroke="#fff" strokeWidth={0.9} strokeLinecap="round" opacity="0.6" />
    </g>
  );
}

export function DumbbellRack() {
  const bell = (x: number, y: number, c: string) => (
    <g key={`${x},${y}`}>
      <rect x={x - 3.2} y={y - 0.8} width="6.4" height="1.6" fill={c} {...thin} strokeWidth={0.7} />
      <rect x={x - 5.4} y={y - 2.6} width="2.6" height="5.2" rx="0.8" fill={IRON} {...thin} />
      <rect x={x + 2.8} y={y - 2.6} width="2.6" height="5.2" rx="0.8" fill={IRON} {...thin} />
    </g>
  );
  return (
    <g>
      <path d="M-14 0 L-12 -22 M14 0 L12 -22" stroke={INK} strokeWidth={3} strokeLinecap="round" />
      <path d="M-14 0 L-12 -22 M14 0 L12 -22" stroke={GREY} strokeWidth={1.4} strokeLinecap="round" />
      <rect x="-14" y="-17.6" width="28" height="2" rx="1" fill={GREY} {...thin} />
      <rect x="-15" y="-7.6" width="30" height="2" rx="1" fill={GREY} {...thin} />
      {bell(-6.5, -20.4, "#F47FA4")}
      {bell(6.5, -20.4, "#F47FA4")}
      {bell(-6.5, -10.4, "#6FA8F0")}
      {bell(6.5, -10.4, "#6FA8F0")}
      <rect x="-17" y="-1.6" width="34" height="2.6" rx="1.3" fill={IRON} {...thin} />
    </g>
  );
}

export function FullMirror() {
  return (
    <g>
      <path d="M-9 17 V-8 A9 9 0 0 1 9 -8 V17 Z" fill="#F2CF96" {...line} />
      <path d="M-6.4 14.6 V-7.6 A6.4 6.4 0 0 1 6.4 -7.6 V14.6 Z" fill="#DCEFF8" {...thin} />
      <path d="M-3.6 2 L2.4 -6 M-3.6 8 L4.2 -2.4" stroke="#fff" strokeWidth={1.3} strokeLinecap="round" />
    </g>
  );
}

/* 필라테스 */
export function Reformer() {
  return (
    <g>
      <path d="M-24 -6 V0 M24 -6 V0" stroke={INK} strokeWidth={2.4} strokeLinecap="round" />
      <path d="M-24 -6 V0 M24 -6 V0" stroke={WOOD_D} strokeWidth={0.9} strokeLinecap="round" />
      <rect x="-28" y="-9.4" width="56" height="4.4" rx="1.8" fill={WOOD} {...line} />
      {/* 스프링 */}
      <path d="M12 -10.2 q1 -1.4 2 0 q1 1.4 2 0 q1 -1.4 2 0 q1 1.4 2 0" fill="none" stroke={INK} strokeWidth={0.8} />
      {/* 캐리지와 어깨 받침 */}
      <rect x="-20" y="-13.6" width="30" height="4.6" rx="1.8" fill="#C8B2EE" {...line} />
      <rect x="-17" y="-18.4" width="2.4" height="5" rx="1" fill="#A98FDB" {...thin} />
      <rect x="-12" y="-18.4" width="2.4" height="5" rx="1" fill="#A98FDB" {...thin} />
      <rect x="-24.6" y="-15" width="5" height="5.6" rx="1.6" fill="#A98FDB" {...thin} />
      {/* 발 막대 */}
      <path d="M22 -9 L25 -21" stroke={INK} strokeWidth={2.2} strokeLinecap="round" />
      <path d="M22 -9 L25 -21" stroke="#C9CBCF" strokeWidth={0.8} strokeLinecap="round" />
      <rect x="21.6" y="-23" width="7" height="3" rx="1.5" fill="#6B6E75" {...thin} />
    </g>
  );
}

export function GymBall() {
  return (
    <g>
      <circle cx="0" cy="-10" r="10" fill="#F7A9C4" {...line} />
      <path d="M-9.4 -13 Q0 -9 9.4 -13 M-8 -4 Q0 -7.6 8 -4" fill="none" stroke="#E784A6" strokeWidth={1} />
      <path d="M-5.6 -15.4 Q-3.6 -17.6 -0.8 -17.8" fill="none" stroke="#fff" strokeWidth={1.4} strokeLinecap="round" />
    </g>
  );
}

export function FoamRoller() {
  return (
    <g>
      <rect x="-12" y="-7.6" width="22" height="7.6" rx="1" fill="#8FDCB2" {...line} />
      <ellipse cx="10" cy="-3.8" rx="2.4" ry="3.8" fill="#B5EBCD" {...line} />
      <ellipse cx="10" cy="-3.8" rx="0.9" ry="1.5" fill="#6FBF95" />
      <ellipse cx="-12" cy="-3.8" rx="2.4" ry="3.8" fill="#8FDCB2" stroke={INK} strokeWidth={1.4} />
      {[-7, -3, 1, 5].map((x) => (
        <path key={x} d={`M${x} -6 v1.4 M${x + 2} -3 v1.4`} stroke="#5FB389" strokeWidth={1} strokeLinecap="round" />
      ))}
    </g>
  );
}

/* 러닝 */
function Shoe({ x, y, c }: { x: number; y: number; c: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M-4.6 0 V-3.6 Q-4.4 -5.4 -2.4 -5.2 L0 -4 Q3.6 -3.4 4.8 -1.2 V0 Z" fill={c} {...thin} />
      <rect x="-5" y="-1.2" width="10.2" height="1.6" rx="0.8" fill={PAPER} {...thin} strokeWidth={0.7} />
      <path d="M-1.6 -4 l1.6 1.8" stroke="#fff" strokeWidth={0.7} strokeLinecap="round" />
    </g>
  );
}

export function ShoeShelf() {
  return (
    <g>
      <rect x="-13" y="-24" width="26" height="24" rx="1.6" fill={WOOD_D} {...line} />
      <rect x="-10.6" y="-21.6" width="21.2" height="8.6" fill="#F3DCC0" {...thin} />
      <rect x="-10.6" y="-10.6" width="21.2" height="8.6" fill="#F3DCC0" {...thin} />
      <Shoe x={-4.8} y={-13.2} c="#F47FA4" />
      <Shoe x={5} y={-13.2} c="#F47FA4" />
      <Shoe x={-4.8} y={-2.2} c="#6FA8F0" />
      <Shoe x={5} y={-2.2} c="#8FDCB2" />
    </g>
  );
}

export function BottleStand() {
  const bottle = (x: number, c: string, h: number) => (
    <g key={x}>
      <rect x={x - 2.4} y={-6 - h} width="4.8" height={h} rx="1.6" fill={c} {...thin} />
      <rect x={x - 1.4} y={-8 - h} width="2.8" height="2.4" rx="0.6" fill="#fff" {...thin} strokeWidth={0.8} />
      <path d={`M${x - 1} ${-3 - h} v${h * 0.6}`} stroke="#fff" strokeWidth={0.8} strokeLinecap="round" opacity="0.8" />
    </g>
  );
  return (
    <g>
      <path d="M-8 -6 V0 M8 -6 V0" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      {bottle(-5.6, "#6FA8F0", 12)}
      {bottle(0, "#8FDCB2", 14)}
      {bottle(5.6, "#F7A9C4", 11)}
      <rect x="-10" y="-7" width="20" height="3" rx="1.2" fill={WOOD} {...line} />
    </g>
  );
}

export function MedalFrame() {
  return (
    <g>
      <rect x="-12" y="-14" width="24" height="28" rx="2" fill={FRAME} {...line} />
      <rect x="-9" y="-11" width="18" height="22" fill="#5C6FA6" {...thin} />
      <path d="M-5 -11 L-1 1 H2 L-2 -11 Z" fill="#F47F7F" {...thin} strokeWidth={0.7} />
      <path d="M5 -11 L1 1 H-2 L2 -11 Z" fill="#7FBFF2" {...thin} strokeWidth={0.7} />
      <circle cx="0" cy="4" r="4.6" fill="#F7D35A" {...thin} />
      <path d="M0 1.6 l0.8 1.6 1.7 0.2 -1.25 1.15 0.35 1.7 -1.6 -0.85 -1.6 0.85 0.35 -1.7 -1.25 -1.15 1.7 -0.2z" fill="#E3A93C" />
    </g>
  );
}

/* 클라이밍 */
export function CrashPad() {
  return (
    <g>
      <path d="M-21 -7.6 L-17 -11 H21 L17 -7.6 Z" fill="#F7B190" {...line} />
      <rect x="-21" y="-7.6" width="38" height="7.6" rx="1.4" fill="#F28F6B" {...line} />
      <path d="M17 -7.6 L21 -11 V-3 L17 0" fill="#D97752" {...line} />
      <path d="M-21 -3.8 H17" stroke="#5C6FA6" strokeWidth={1.4} />
      <path d="M-6 -7.6 Q-2 -12 2 -7.6" fill="none" stroke={INK} strokeWidth={1.2} strokeLinecap="round" />
    </g>
  );
}

const HOLDS: [number, number, string][] = [
  [-9, -9, "#F47FA4"],
  [6, -10, "#6FA8F0"],
  [-3, -2, "#F7D35A"],
  [9, 1, "#8FDCB2"],
  [-8, 7, "#6FA8F0"],
  [3, 8, "#F47FA4"],
];

export function MiniWall() {
  return (
    <g>
      <rect x="-15" y="-15" width="30" height="30" rx="2" fill="#EFE3CC" {...line} />
      <path d="M-15 0 H15 M0 -15 V15" stroke="#D9C9AC" strokeWidth={0.8} />
      {HOLDS.map(([x, y, c]) => (
        <path key={`${x},${y}`} d={`M${x - 2.6} ${y} q0 -2.6 2.6 -2.4 q2.7 0.3 2.4 2.5 q-0.4 2.2 -2.7 2.1 q-2.4 -0.2 -2.3 -2.2z`} fill={c} {...thin} strokeWidth={0.8} />
      ))}
      {[[-12, -12], [12, -12], [-12, 12], [12, 12]].map(([x, y]) => (
        <circle key={`${x},${y}`} cx={x} cy={y} r="0.8" fill={INK} />
      ))}
    </g>
  );
}

export function ChalkHook() {
  return (
    <g>
      <rect x="-6" y="-13" width="12" height="3.4" rx="1.4" fill={WOOD} {...line} />
      <path d="M0 -10 V-7.4 Q0 -5.6 2 -6" fill="none" stroke={IRON} strokeWidth={1.4} strokeLinecap="round" />
      <path d="M-4 -2 Q-3 -7.4 0 -7 Q3 -7.4 4 -2" fill="none" stroke={INK} strokeWidth={1} />
      <path d="M-5.6 -2 H5.6 L5 10 Q0 12 -5 10 Z" fill="#F7D35A" {...line} />
      <ellipse cx="0" cy="-2" rx="5.6" ry="1.6" fill={PAPER} {...thin} />
      <path d="M-5.4 3.4 Q0 5 5.3 3.4" fill="none" stroke="#E3B53C" strokeWidth={1} />
      <path d="M3.6 -6 L5.4 -10" stroke={INK} strokeWidth={1.6} strokeLinecap="round" />
      <path d="M5 -9.4 l1.8 -2.6" stroke="#F3DCC0" strokeWidth={1.8} strokeLinecap="round" />
    </g>
  );
}

/* 주짓수 */
export function GrapplingDummy() {
  const BODY = "#B08560";
  const DARK = "#8C6646";
  return (
    <g>
      {/* 앉아 있는 더미: 다리를 앞으로 뻗음 */}
      <rect x="-15" y="-6" width="16" height="6" rx="3" fill={BODY} {...line} transform="rotate(-6 -7 -3)" />
      <rect x="-1" y="-6" width="16" height="6" rx="3" fill={BODY} {...line} transform="rotate(6 7 -3)" />
      <path d="M-8 -4 Q-10 -18 -7 -26 L7 -26 Q10 -18 8 -4 Z" fill={BODY} {...line} />
      <path d="M-8 -26 Q0 -30 8 -26 Q7 -22 0 -22 Q-7 -22 -8 -26 Z" fill={DARK} {...thin} />
      <rect x="-14" y="-26" width="6" height="13" rx="3" fill={BODY} {...line} transform="rotate(16 -11 -25)" />
      <rect x="8" y="-26" width="6" height="13" rx="3" fill={BODY} {...line} transform="rotate(-16 11 -25)" />
      <circle cx="0" cy="-33" r="6.4" fill={BODY} {...line} />
      <path d="M0 -20 V-8" stroke={DARK} strokeWidth="1" strokeLinecap="round" />
    </g>
  );
}

export function GiHanger() {
  return (
    <g>
      <path d="M0 -15 V-12.6" stroke={IRON} strokeWidth={1.2} strokeLinecap="round" />
      <circle cx="0" cy="-15.6" r="1.4" fill="none" stroke={IRON} strokeWidth={1} />
      <path d="M-13 -9.4 L0 -12.6 L13 -9.4" fill="none" stroke={WOOD_D} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
      {/* 도복 상의 */}
      <path d="M-12 -9 L-6 -11 L0 -4 L6 -11 L12 -9 L13 0 L8.6 0.6 L8.6 14 H-8.6 L-8.6 0.6 L-13 0 Z" fill="#fff" {...line} />
      <path d="M-6 -11 L2.6 3 M6 -11 L-0.6 0.4" fill="none" stroke={INK} strokeWidth={1} />
      <path d="M-6 -11 L0 -4 L6 -11" fill="none" stroke="#E6E9F0" strokeWidth={1.6} />
      {/* 파란 띠 */}
      <rect x="-8.8" y="4.4" width="17.6" height="2.8" fill="#3D6FD6" {...thin} />
      <path d="M-1 7 L-3 12 M1 7 L2.6 12" stroke="#3D6FD6" strokeWidth={2} strokeLinecap="round" />
    </g>
  );
}

export function BeltFrame() {
  return (
    <g>
      <rect x="-16" y="-8" width="32" height="16" rx="2" fill={FRAME} {...line} />
      <rect x="-13" y="-5" width="26" height="10" fill={PAPER} {...thin} />
      <rect x="-11" y="-1.6" width="22" height="3.4" fill="#3D6FD6" {...thin} />
      <rect x="5" y="-1.6" width="5" height="3.4" fill="#2A2A33" />
      <path d="M6.4 -1.6 v3.4 M8.4 -1.6 v3.4" stroke="#fff" strokeWidth={0.7} />
    </g>
  );
}

/* 태권도 */
export function Sandbag() {
  return (
    <g>
      <ellipse cx="0" cy="-3" rx="9.4" ry="3.6" fill="#3E4A6B" {...line} />
      <rect x="-2.2" y="-12" width="4.4" height="8" fill="#6B6E75" {...thin} />
      <rect x="-7" y="-46" width="14" height="36" rx="6" fill="#E2645E" {...line} />
      <path d="M-7 -36 H7 M-7 -20 H7" stroke="#2A2A33" strokeWidth={1.6} />
      <path d="M-4 -42 V-38" stroke="#fff" strokeWidth={1.3} strokeLinecap="round" opacity="0.7" />
    </g>
  );
}

export function KickPaddleStand() {
  const paddle = (x: number, y: number, c: string, r: number) => (
    <g transform={`rotate(${r} ${x} ${y})`}>
      <rect x={x - 4.4} y={y} width="8.8" height="13" rx="4.4" fill={c} {...line} />
      <rect x={x - 1.6} y={y + 12} width="3.2" height="4" rx="1" fill="#2A2A33" {...thin} strokeWidth={0.7} />
    </g>
  );
  return (
    <g>
      <rect x="-8" y="-2.6" width="16" height="2.6" rx="1.3" fill="#6B6E75" {...line} />
      <path d="M0 -2 V-38" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M0 -2 V-38" stroke="#C9CBCF" strokeWidth={1} strokeLinecap="round" />
      <path d="M-7 -36 H7" stroke={INK} strokeWidth={2} strokeLinecap="round" />
      {paddle(-6, -36, "#E2645E", 8)}
      {paddle(6, -36, "#4C7FD0", -8)}
    </g>
  );
}

export function BoardFrame() {
  return (
    <g>
      <rect x="-15" y="-12" width="30" height="24" rx="2" fill={FRAME} {...line} />
      <rect x="-12" y="-9" width="24" height="18" fill={PAPER} {...thin} />
      <path d="M-9.6 -6 H-0.6 L0.8 -3 L-1 0 L0.6 3 L-0.4 6 H-9.6 Z" fill="#F2D19B" {...thin} transform="rotate(-8 -5 0)" />
      <path d="M1.8 -6 H9.6 V6 H1.4 L2.6 3 L1 0 L2.8 -3 Z" fill="#F2D19B" {...thin} transform="rotate(8 5 0)" />
      <path d="M-7.6 -3 H-3 M4 2 H8" stroke="#D9AE70" strokeWidth={0.8} strokeLinecap="round" />
      <path d="M-10 -8 l1.4 1.4 M10 -8 l-1.4 1.4" stroke="#F47F7F" strokeWidth={1} strokeLinecap="round" />
    </g>
  );
}

