import type { Sport } from "../../../shared/sports";
import { furnitureUrl, type FurnitureRes } from "../furniture";
import { FURNITURE_IMG } from "../furniture/art";

// 종목별 운동 기구. 캐릭터 발 위치를 (0,0)으로, 캐릭터 키 ≈ 58 단위 기준으로 그린다.
const INK = "#5B4640";
const line = { stroke: INK, strokeWidth: 1.4, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

const HOLDS: [number, number, string][] = [
  [-22, -60, "#F47FA4"],
  [18, -64, "#6FA8F0"],
  [-25, -40, "#F7D35A"],
  [22, -48, "#F47FA4"],
  [-14, -18, "#6FA8F0"],
  [24, -22, "#F7D35A"],
  [-2, -68, "#8FDCB2"],
  [-12, -6, "#F47FA4"],
  [10, -9, "#8FDCB2"],
];

/** 기구 발밑 옅은 그림자 */
const Shadow = ({ w, x = 0 }: { w: number; x?: number }) => <ellipse cx={x} cy="2.6" rx={w / 2} ry="2.4" fill={INK} opacity="0.14" />;
/** 매트 · 판 윗면의 옅은 하이라이트 */
const Shine = ({ x, w, y = -1.6 }: { x: number; w: number; y?: number }) => (
  <line x1={x} y1={y} x2={x + w} y2={y} stroke="#fff" strokeWidth="0.9" strokeLinecap="round" opacity="0.55" />
);

export function Equipment({ sport, lit, res = "full" }: { sport: Sport; lit: boolean; res?: FurnitureRes }) {
  switch (sport) {
    case "gym":
      return (
        <g data-equip="gym">
          <Shadow w={62} />
          <rect x="-28" y="-2.5" width="56" height="5" rx="2" fill="#6E6869" {...line} />
          <Shine x={-25} w={50} />
          {lit ? (
            <g>
              <rect x="30" y="-12" width="4" height="12" rx="1.5" fill="#5E5859" {...line} />
              <rect x="35" y="-10" width="3.5" height="10" rx="1.5" fill="#5E5859" {...line} />
              <path d="M31.4 -10 V-3 M36.3 -8.4 V-3" stroke="#8E8A8B" strokeWidth="0.8" strokeLinecap="round" />
            </g>
          ) : (
            <g>
              <rect x="-26" y="-4.5" width="52" height="2.4" rx="1.2" fill="#8E8A8B" {...line} strokeWidth={1} />
              <rect x="-24" y="-11" width="5" height="11" rx="1.8" fill="#5E5859" {...line} />
              <rect x="19" y="-11" width="5" height="11" rx="1.8" fill="#5E5859" {...line} />
              <path d="M-22.6 -9 V-3 M20.4 -9 V-3" stroke="#8E8A8B" strokeWidth="0.8" strokeLinecap="round" />
            </g>
          )}
        </g>
      );
    case "running":
      return (
        <g data-equip="running">
          <Shadow w={62} />
          <path d="M22 -3 L31 -40" {...line} stroke="#7C7F86" strokeWidth={3.2} />
          <path d="M22 -3 L31 -40" fill="none" {...line} strokeWidth={0.8} />
          <rect x="25" y="-45" width="15" height="6" rx="2" fill="#6B6E75" {...line} />
          <rect x="-26" y="-3" width="56" height="6" rx="3" fill="#C9CBCF" {...line} />
          <rect x="-24" y="-3.4" width="50" height="2.4" rx="1.2" fill="#55585F" />
          <line className="belt" x1="-23" y1="-2.2" x2="25" y2="-2.2" stroke="#8E9198" strokeWidth="0.9" strokeDasharray="3 3" />
        </g>
      );
    case "pilates":
      // 켜진 방은 캐릭터 그림에 리포머가 들어 있어 그리지 않는다. 잘 때는 가구 "리포머" 그림이 옆에 놓여 있다
      return (
        <g data-equip="pilates">
          <FurnitureImg id="reformer" res={res} />
        </g>
      );
    case "yoga":
      // 켜진 방은 캐릭터 그림에 매트가 있다. 잘 때는 돌돌 말아 세워 둔 라벤더 매트 + 요가 블록 (자는 캐릭터 발끝 오른쪽)
      return (
        <g data-equip="yoga">
          <Shadow w={10} x={3} />
          <rect x="-1" y="-25" width="8" height="25" rx="1.5" fill="#C8B2EE" {...line} />
          <path d="M-1 -18 H7 M-1 -6 H7" stroke="#A98FD8" strokeWidth="0.9" />
          <ellipse cx="3" cy="-25" rx="4" ry="1.8" fill="#D9C8F4" {...line} strokeWidth={1} />
          <path d="M3 -25.6 a1.3 0.6 0 1 1 -0.1 0" fill="none" stroke="#A98FD8" strokeWidth="0.7" />
          <line x1="0.6" y1="-22" x2="0.6" y2="-3" stroke="#fff" strokeWidth="0.9" strokeLinecap="round" opacity="0.5" />
          <FurnitureImg id="yoga-blocks" res={res} x={15} k={0.65} />
        </g>
      );
    case "hometraining":
      // 켜진 방은 캐릭터 그림에 매트 · 휴대폰이 있다. 잘 때는 가구 "스텝박스" 그림
      return (
        <g data-equip="hometraining">
          <FurnitureImg id="step-box" res={res} />
        </g>
      );
    case "climbing":
      return (
        <g data-equip="climbing">
          <Shadow w={78} />
          <rect x="-34" y="-74" width="68" height="74" rx="3" fill="#EFE3CC" {...line} />
          <path d="M-34 -50 H34 M-34 -25 H34 M0 -74 V0" stroke="#D9C9AC" strokeWidth="0.8" />
          {HOLDS.map(([x, y, col]) => (
            <path key={`${x},${y}`} d={`M${x - 3.5} ${y} q0 -3.5 3.5 -3.2 q3.6 0.4 3.2 3.4 q-0.6 3 -3.6 2.8 q-3.2 -0.2 -3.1 -3z`} fill={col} {...line} strokeWidth={0.9} />
          ))}
          <rect x="-38" y="-2" width="76" height="4" rx="2" fill="#5C6FA6" {...line} />
        </g>
      );
    case "jiujitsu":
      // 회색 매트. 잘 때(가드 자세가 아닐 때)는 더미가 매트 위에 서 있다
      return (
        <g data-equip="jiujitsu">
          <Shadow w={96} />
          <rect x="-46" y="-3" width="92" height="7" rx="1.5" fill="#A9ADB4" {...line} />
          <Shine x={-43} w={86} />
          <path d="M-42 -0.5 H42" stroke="#8D9199" strokeWidth="1" />
          {!lit && <Dummy x={-20} y={-1} res={res} />}
        </g>
      );
    case "taekwondo":
      // 파랑 · 빨강 겨루기 매트 + 스탠드 킥 미트
      return (
        <g data-equip="taekwondo">
          <Shadow w={84} />
          <rect x="-40" y="-3" width="80" height="7" rx="1.5" fill="#E2645E" {...line} />
          <rect x="-30" y="-2.2" width="60" height="5.4" fill="#4C7FD0" />
          <Shine x={-37} w={74} />
          <path d="M34 -1 V-30" stroke="#7C7F86" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M34 -1 V-30" stroke={INK} strokeWidth="0.6" />
          <rect x="28" y="-2.5" width="12" height="3" rx="1.5" fill="#6B6E75" {...line} strokeWidth={1} />
          <rect x="29" y="-44" width="10" height="16" rx="5" fill="#E2645E" {...line} />
          <path d="M31.5 -40 V-32" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
        </g>
      );
  }
  // 종목을 더하면 여기서 타입 오류가 난다: 위에 기구를 그려 넣을 것
  const missing: never = sport;
  return missing;
}

/** 가구 그림(webp)을 기구로 그린다: 가구와 같은 크기(× k), 발밑 그림자. (x,0) = 바닥 가운데 */
function FurnitureImg({ id, res, x = 0, k = 1 }: { id: string; res: FurnitureRes; x?: number; k?: number }) {
  const [w0, h0] = FURNITURE_IMG[id];
  const [w, h] = [w0 * k, h0 * k];
  return (
    <g data-part={id}>
      <ellipse cx={x} cy="-0.6" rx={w * 0.42} ry={Math.max(1.6, w * 0.06)} fill={INK} opacity="0.16" />
      <image href={furnitureUrl(id, res)} x={x - w / 2} y={-h} width={w} height={h} preserveAspectRatio="none" />
    </g>
  );
}

/** 주짓수 그래플링 더미 (잘 때 매트 옆에 둔다). 가구 "그래플링 더미" 그림을 같이 쓴다. (x,y) = 바닥 가운데 */
function Dummy({ x, y, res }: { x: number; y: number; res: FurnitureRes }) {
  const h = 44;
  const w = h * (241 / 272);
  return (
    <g data-part="dummy">
      <ellipse cx={x} cy={y - 0.6} rx={w * 0.42} ry="2.2" fill={INK} opacity="0.16" />
      <image href={furnitureUrl("grappling-dummy", res)} x={x - w / 2} y={y - h} width={w} height={h} preserveAspectRatio="none" />
    </g>
  );
}
