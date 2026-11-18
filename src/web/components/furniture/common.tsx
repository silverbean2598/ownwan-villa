import { FRAME, INK, PAPER, WOOD, WOOD_D, line, thin } from "./style";

// 공용 가구. 바닥 가구는 바닥에 닿는 가운데를 (0,0)으로, 벽 가구는 가운데를 (0,0)으로 그린다.
// 캐릭터 키 ≈ 58 단위 기준.

export function Plant() {
  const leaf = (x: number, y: number, r: number, c: string) => (
    <path
      key={`${x},${y}`}
      d="M0 0 Q-5 -5 0 -13 Q5 -5 0 0 Z"
      transform={`translate(${x} ${y}) rotate(${r})`}
      fill={c}
      {...thin}
    />
  );
  return (
    <g>
      <path d="M0 -12 Q0.5 -20 -0.5 -26" fill="none" stroke="#6E8B4E" strokeWidth={1.2} strokeLinecap="round" />
      {leaf(0, -16, -48, "#7CC08A")}
      {leaf(0, -16, 46, "#7CC08A")}
      {leaf(0, -22, -18, "#93D49E")}
      {leaf(0, -22, 22, "#8FCB97")}
      {leaf(0, -13, -78, "#93D49E")}
      {leaf(0, -13, 80, "#8FCB97")}
      <path d="M-6 -11 L6 -11 L4.6 0 L-4.6 0 Z" fill="#EFA27F" {...line} />
      <rect x="-7.4" y="-13.6" width="14.8" height="3.6" rx="1.4" fill="#F4B898" {...line} />
    </g>
  );
}

export function Rug() {
  return (
    <g>
      <g stroke={INK} strokeWidth={0.9} strokeLinecap="round">
        {[-3, -1, 1, 3].map((d) => (
          <g key={d}>
            <line x1={-27} y1={-4 + d * 0.8} x2={-30} y2={-4 + d * 0.9} />
            <line x1={27} y1={-4 + d * 0.8} x2={30} y2={-4 + d * 0.9} />
          </g>
        ))}
      </g>
      <ellipse cx="0" cy="-4" rx="27" ry="5.6" fill="#F6B8C4" {...line} />
      <ellipse cx="0" cy="-4" rx="20" ry="3.6" fill="#FBD3DA" stroke="#fff" strokeWidth={0.9} strokeDasharray="2 1.6" />
      <ellipse cx="0" cy="-4" rx="8" ry="1.4" fill="#F6B8C4" />
    </g>
  );
}

export function FloorLamp() {
  return (
    <g>
      <ellipse cx="0" cy="-1.4" rx="6.5" ry="1.8" fill="#9C8F86" {...line} />
      <path d="M0 -2 V-42" stroke={INK} strokeWidth={2.6} strokeLinecap="round" />
      <path d="M0 -2 V-42" stroke="#C9BBB0" strokeWidth={1} strokeLinecap="round" />
      <path d="M-8.5 -41 L8.5 -41 L5.5 -53 L-5.5 -53 Z" fill="#FFE3A3" {...line} />
      <path d="M-7.6 -44.5 H7.6" stroke="#F2C66E" strokeWidth={1} />
      <circle cx="0" cy="-39.6" r="1.8" fill="#FFF3C4" {...thin} />
    </g>
  );
}

export function LandscapeFrame() {
  return (
    <g>
      <rect x="-15" y="-11" width="30" height="22" rx="2" fill={FRAME} {...line} />
      <rect x="-11.5" y="-7.5" width="23" height="15" fill="#BFE2F6" {...thin} />
      <circle cx="6" cy="-3" r="2.6" fill="#FFD66B" />
      <path d="M-11.5 5 L-5 -2.5 L-1 2 L3 -1 L11.5 6 V7.5 H-11.5 Z" fill="#9ED4A8" stroke={INK} strokeWidth={0.8} strokeLinejoin="round" />
      <path d="M-5 -2.5 L-3.6 -0.9 L-6.4 -0.9 Z" fill="#fff" />
    </g>
  );
}

export function OwunwanFrame() {
  return (
    <g>
      <rect x="-15" y="-10" width="30" height="20" rx="2" fill="#F2CF96" {...line} />
      <rect x="-12" y="-7" width="24" height="14" fill={PAPER} {...thin} />
      <text
        x="0"
        y="2.6"
        textAnchor="middle"
        fontSize="7.4"
        fontWeight="800"
        fill={INK}
        fontFamily="'Pretendard','Apple SD Gothic Neo','Noto Sans KR',sans-serif"
      >
        오운완
      </text>
      <path d="M8.6 -4.8 q1.2 -1.6 2.2 0 q-0.4 1.2 -2.2 2.4 q-1.8 -1.2 -2.2 -2.4 q1 -1.6 2.2 0z" fill="#F47FA4" />
    </g>
  );
}

export function WallClock() {
  return (
    <g>
      <circle cx="0" cy="0" r="11" fill="#F7A9C4" {...line} />
      <circle cx="0" cy="0" r="8.4" fill={PAPER} {...thin} />
      {[0, 90, 180, 270].map((a) => (
        <circle key={a} cx={6.4 * Math.sin((a * Math.PI) / 180)} cy={-6.4 * Math.cos((a * Math.PI) / 180)} r="0.8" fill={INK} />
      ))}
      <path d="M0 0 V-5.4 M0 0 L3.6 1.6" stroke={INK} strokeWidth={1.3} strokeLinecap="round" />
      <circle cx="0" cy="0" r="1" fill="#F47FA4" />
    </g>
  );
}

export function TrophyShelf() {
  return (
    <g>
      {/* 큰 트로피 */}
      <path d="M-4.5 -12 H4.5 Q4.5 -4 0 -3.2 Q-4.5 -4 -4.5 -12 Z" fill="#F7D35A" {...line} />
      <path d="M-4.5 -10.5 Q-8 -10.5 -7.4 -7.6 Q-6.8 -5.4 -3.4 -5.6 M4.5 -10.5 Q8 -10.5 7.4 -7.6 Q6.8 -5.4 3.4 -5.6" fill="none" stroke={INK} strokeWidth={1.1} />
      <rect x="-1" y="-3.4" width="2" height="2.6" fill="#E3B53C" {...thin} />
      <rect x="-3.6" y="-1" width="7.2" height="2.6" rx="0.8" fill="#E3B53C" {...thin} />
      <path d="M-2 -10.4 Q-2.2 -7.4 -0.6 -5.8" stroke="#fff" strokeWidth={0.9} fill="none" strokeLinecap="round" opacity="0.8" />
      {/* 작은 은 트로피 */}
      <path d="M-14 -6.8 H-8.6 Q-8.6 -2.4 -11.3 -2 Q-14 -2.4 -14 -6.8 Z" fill="#DADDE3" {...thin} />
      <rect x="-13.4" y="-1.2" width="4.2" height="2.8" rx="0.6" fill="#B9BDC6" {...thin} />
      {/* 메달 */}
      <path d="M9 -9 L11 -4 M14 -9 L12 -4" stroke="#6FA8F0" strokeWidth={1.6} strokeLinecap="round" />
      <circle cx="11.5" cy="-2" r="2.6" fill="#F7D35A" {...thin} />
      {/* 선반 */}
      <rect x="-17" y="1.6" width="34" height="3.6" rx="1.2" fill={WOOD} {...line} />
      <path d="M-12 5.2 L-12 9 L-8.6 5.2 M12 5.2 L12 9 L8.6 5.2" fill={WOOD_D} {...thin} />
    </g>
  );
}
