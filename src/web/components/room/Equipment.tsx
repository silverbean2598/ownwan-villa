import type { Sport } from "../../../shared/sports";
import { Dummy } from "../avatar/parts";

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

export function Equipment({ sport, lit }: { sport: Sport; lit: boolean }) {
  switch (sport) {
    case "gym":
      return (
        <g data-equip="gym">
          <rect x="-28" y="-2.5" width="56" height="5" rx="2" fill="#6E6869" {...line} />
          {lit ? (
            <g>
              <rect x="30" y="-12" width="4" height="12" rx="1.5" fill="#5E5859" {...line} />
              <rect x="35" y="-10" width="3.5" height="10" rx="1.5" fill="#5E5859" {...line} />
            </g>
          ) : (
            <g>
              <rect x="-26" y="-4.5" width="52" height="2.4" rx="1.2" fill="#8E8A8B" {...line} strokeWidth={1} />
              <rect x="-24" y="-11" width="5" height="11" rx="1.8" fill="#5E5859" {...line} />
              <rect x="19" y="-11" width="5" height="11" rx="1.8" fill="#5E5859" {...line} />
            </g>
          )}
        </g>
      );
    case "running":
      return (
        <g data-equip="running">
          <path d="M22 -3 L31 -40" {...line} stroke="#7C7F86" strokeWidth={3.2} />
          <path d="M22 -3 L31 -40" fill="none" {...line} strokeWidth={0.8} />
          <rect x="25" y="-45" width="15" height="6" rx="2" fill="#6B6E75" {...line} />
          <rect x="-26" y="-3" width="56" height="6" rx="3" fill="#C9CBCF" {...line} />
          <rect x="-24" y="-3.4" width="50" height="2.4" rx="1.2" fill="#55585F" />
          <line className="belt" x1="-23" y1="-2.2" x2="25" y2="-2.2" stroke="#8E9198" strokeWidth="0.9" strokeDasharray="3 3" />
        </g>
      );
    case "pilates":
      return (
        <g data-equip="pilates">
          <rect x="-46" y="-3" width="92" height="6" rx="2" fill="#C8B2EE" {...line} />
          <line x1="-42" y1="-1" x2="42" y2="-1" stroke="#fff" strokeWidth="0.8" opacity="0.5" />
        </g>
      );
    case "climbing":
      return (
        <g data-equip="climbing">
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
          <rect x="-46" y="-3" width="92" height="7" rx="1.5" fill="#A9ADB4" {...line} />
          <path d="M-42 -0.5 H42" stroke="#8D9199" strokeWidth="1" />
          {!lit && <Dummy transform="translate(-20 -1) scale(0.8)" />}
        </g>
      );
    case "taekwondo":
      // 파랑 · 빨강 겨루기 매트 + 스탠드 킥 미트
      return (
        <g data-equip="taekwondo">
          <rect x="-40" y="-3" width="80" height="7" rx="1.5" fill="#E2645E" {...line} />
          <rect x="-30" y="-2.2" width="60" height="5.4" fill="#4C7FD0" />
          <path d="M34 -1 V-30" stroke="#7C7F86" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M34 -1 V-30" stroke={INK} strokeWidth="0.6" />
          <rect x="28" y="-2.5" width="12" height="3" rx="1.5" fill="#6B6E75" {...line} strokeWidth={1} />
          <rect x="29" y="-44" width="10" height="16" rx="5" fill="#E2645E" {...line} />
          <path d="M31.5 -40 V-32" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
        </g>
      );
  }
}
