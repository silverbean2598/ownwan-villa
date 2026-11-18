import { INK } from "../avatar/parts";

// 축하 장면 소품. 캐릭터와 같은 갈색 외곽선 + 파스텔 채색 (docs/art-reference/celebrations.webp)
const line = { stroke: INK, strokeWidth: 1.5, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const GOLD = "#F6C445";
const GOLD_DARK = "#D9A12A";
const GOLD_HI = "#FCE59A";
const KRAFT = "#D6A877";
const KRAFT_DARK = "#B9895A";

/** 반짝이 (네 갈래 별). cx, cy 중심, r 크기 */
export function Sparkle({ cx, cy, r = 6, color = "#F8CE4E", className = "cel-twinkle" }: { cx: number; cy: number; r?: number; color?: string; className?: string }) {
  const k = r * 0.28;
  return (
    <path
      className={className}
      style={{ transformOrigin: `${cx}px ${cy}px` }}
      d={`M${cx} ${cy - r} Q${cx + k} ${cy - k} ${cx + r} ${cy} Q${cx + k} ${cy + k} ${cx} ${cy + r} Q${cx - k} ${cy + k} ${cx - r} ${cy} Q${cx - k} ${cy - k} ${cx} ${cy - r} Z`}
      fill={color}
    />
  );
}

const CONFETTI = ["#B7A1EA", "#7FC4F0", "#F9A3B5", "#F8CE4E", "#8FDCB2", "#FDB07A"];

/** 색종이: [x, y, 회전] 목록 */
export function Confetti({ pieces }: { pieces: [number, number, number][] }) {
  return (
    <g data-part="confetti">
      {pieces.map(([x, y, rot], i) => (
        // 회전은 바깥 g 속성, 흔들림은 안쪽 rect 의 CSS (CSS transform 이 속성 transform 을 덮어쓰므로 나눈다)
        <g key={i} transform={`rotate(${rot} ${x} ${y})`}>
          <rect
            className="cel-confetti"
            style={{ animationDelay: `${(i % 5) * 0.35}s`, transformOrigin: `${x}px ${y}px` }}
            x={x - 3.5}
            y={y - 2}
            width="7"
            height="4"
            rx="1"
            fill={CONFETTI[i % CONFETTI.length]}
          />
        </g>
      ))}
    </g>
  );
}

/** 우승컵. (x, y) = 손잡이를 쥔 손 위치(받침 아래 가운데) */
export function Trophy({ x, y }: { x: number; y: number }) {
  return (
    <g data-part="trophy" transform={`translate(${x} ${y})`}>
      <path d="M-11 -46 C-22 -46 -22 -30 -9 -28" fill="none" stroke={INK} strokeWidth="5.2" strokeLinecap="round" />
      <path d="M11 -46 C22 -46 22 -30 9 -28" fill="none" stroke={INK} strokeWidth="5.2" strokeLinecap="round" />
      <path d="M-11 -46 C-22 -46 -22 -30 -9 -28" fill="none" stroke={GOLD} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M11 -46 C22 -46 22 -30 9 -28" fill="none" stroke={GOLD} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M-14 -50 H14 Q14 -26 2.5 -21 L2.5 -14 H-2.5 L-2.5 -21 Q-14 -26 -14 -50 Z" fill={GOLD} {...line} />
      <path d="M-9 -46 Q-9 -32 -2 -27" fill="none" stroke={GOLD_HI} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M-15 -51 H15" stroke={GOLD_DARK} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M-8 -14 H8 L9 -9 H-9 Z" fill={GOLD_DARK} {...line} strokeWidth={1.2} />
      <rect x="-11" y="-9" width="22" height="9" rx="2" fill="#7A5236" {...line} strokeWidth={1.2} />
      <rect x="-5" y="-6.5" width="10" height="4" rx="1" fill={GOLD} />
    </g>
  );
}

/** 이삿짐 상자. (x, y) 가운데, w × h */
export function Box({ x, y, w = 36, h = 30 }: { x: number; y: number; w?: number; h?: number }) {
  const l = x - w / 2;
  const t = y - h / 2;
  const lid = 7;
  return (
    <g data-part="box">
      <path d={`M${l} ${t + lid} L${l + 5} ${t} H${l + w + 5} L${l + w} ${t + lid} Z`} fill="#E3BC90" {...line} strokeWidth={1.3} />
      <path d={`M${l + w} ${t + lid} L${l + w + 5} ${t} V${t + h - 6} L${l + w} ${t + h} Z`} fill={KRAFT_DARK} {...line} strokeWidth={1.3} />
      <rect x={l} y={t + lid} width={w} height={h - lid} rx="1.5" fill={KRAFT} {...line} strokeWidth={1.3} />
      <path d={`M${x - 3} ${t + lid} V${t + lid + 9} M${x + 3} ${t + lid} V${t + lid + 9}`} stroke={KRAFT_DARK} strokeWidth="1.2" />
      <path d={`M${x - 3} ${t + lid} L${x + 2} ${t} M${x + 3} ${t + lid} L${x + 8} ${t}`} stroke={KRAFT_DARK} strokeWidth="1.1" />
    </g>
  );
}

/** 화분. (x, y) = 화분 윗면 가운데 */
export function Plant({ x, y }: { x: number; y: number }) {
  const leaf = "#6FAF6A";
  const leafDark = "#4F8F52";
  return (
    <g data-part="plant" transform={`translate(${x} ${y})`}>
      <path d="M0 0 C-2 -10 -12 -18 -16 -30 C-6 -26 -1 -16 0 0 Z" fill={leaf} {...line} strokeWidth={1.2} />
      <path d="M0 0 C2 -12 10 -22 16 -32 C18 -20 8 -10 0 0 Z" fill={leafDark} {...line} strokeWidth={1.2} />
      <path d="M0 0 C-1 -14 1 -26 3 -38 C8 -26 5 -12 0 0 Z" fill={leaf} {...line} strokeWidth={1.2} />
      <path d="M0 0 C-4 -6 -14 -8 -20 -14 C-10 -16 -3 -8 0 0 Z" fill={leafDark} {...line} strokeWidth={1.2} />
      <path d="M-10 -1 H10 L8 15 Q0 17 -8 15 Z" fill="#9B8A80" {...line} strokeWidth={1.3} />
      <rect x="-11.5" y="-3" width="23" height="5" rx="1.5" fill="#B4A398" {...line} strokeWidth={1.3} />
    </g>
  );
}

/** 계단: 왼쪽 위에서 오른쪽 아래로 내려간다. (x, y) = 맨 위 계단 왼쪽 끝, step 수 */
export function Stairs({ x, y, steps = 5, run = 34, rise = 16, bottom }: { x: number; y: number; steps?: number; run?: number; rise?: number; bottom?: number }) {
  let d = `M${x} ${y}`;
  for (let i = 0; i < steps; i++) d += ` h${run} v${rise}`;
  d += ` V${bottom ?? y + steps * rise + 40} H${x} Z`;
  return (
    <g data-part="stairs">
      <path d={d} fill="#DEDAD8" {...line} />
      {Array.from({ length: steps }, (_, i) => (
        <path key={i} d={`M${x + i * run} ${y + i * rise + 3.5} h${run}`} stroke="#F1EEEC" strokeWidth="3" strokeLinecap="round" />
      ))}
    </g>
  );
}

/** 위로 휘어 오르는 화살표. (x, y) = 화살촉 끝 */
export function UpArrow({ x, y }: { x: number; y: number }) {
  return (
    <g data-part="arrow" transform={`translate(${x} ${y})`}>
      <path d="M-22 30 C-14 24 -8 16 -5 7 L-11 8 L0 -2 L5 12 L0 9 C-3 20 -10 30 -18 36 Z" fill={GOLD} {...line} strokeWidth={1.3} />
    </g>
  );
}

/** "+1" 글자 */
export function PlusOne({ x, y }: { x: number; y: number }) {
  return (
    <text data-part="plus-one" x={x} y={y} fontSize="20" fontWeight="900" fontFamily="sans-serif" fill={GOLD} stroke={GOLD_DARK} strokeWidth="1" transform={`rotate(-14 ${x} ${y})`}>
      +1
    </text>
  );
}

/** 놀람 · 깨달음 선 (머리 옆 세 줄). (x, y) 기준, dir 1 = 오른쪽 위로 뻗음, -1 = 왼쪽 위 */
export function Burst({ x, y, dir = 1, color = INK }: { x: number; y: number; dir?: 1 | -1; color?: string }) {
  return (
    <path
      data-part="burst"
      d={`M${x} ${y} l${dir * 7} -5 M${x + dir * 2} ${y - 9} l${dir * 5} -8 M${x - dir * 7} ${y - 12} l${dir * 1.5} -9`}
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
    />
  );
}

/** 하이파이브 손뼉 선 (위로 퍼지는 세 줄) */
export function ClapLines({ x, y }: { x: number; y: number }) {
  return <path data-part="clap" d={`M${x} ${y} v-7 M${x - 7} ${y + 2} l-4 -5 M${x + 7} ${y + 2} l4 -5`} stroke={GOLD_DARK} strokeWidth="1.8" strokeLinecap="round" />;
}

/** 펜트하우스 왕관 */
export function Crown({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g data-part="crown" transform={`translate(${x} ${y}) rotate(${rot})`}>
      <path d="M-13 6 L-15 -8 L-6 -1 L0 -11 L6 -1 L15 -8 L13 6 Z" fill={GOLD} {...line} strokeWidth={1.3} />
      <rect x="-13.5" y="5" width="27" height="5" rx="1.5" fill={GOLD_DARK} {...line} strokeWidth={1.2} />
      <circle cx="0" cy="-11.5" r="2" fill="#F9A3B5" {...line} strokeWidth={0.9} />
    </g>
  );
}

/** 하트 */
export function Heart({ x, y, s = 1, color = "#F9A3B5" }: { x: number; y: number; s?: number; color?: string }) {
  return (
    <path
      className="cel-twinkle"
      style={{ transformOrigin: `${x}px ${y}px` }}
      d={`M${x} ${y + 5 * s} C${x - 9 * s} ${y - 1 * s} ${x - 6 * s} ${y - 8 * s} ${x} ${y - 4 * s} C${x + 6 * s} ${y - 8 * s} ${x + 9 * s} ${y - 1 * s} ${x} ${y + 5 * s} Z`}
      fill={color}
      stroke="#E77F97"
      strokeWidth="0.9"
    />
  );
}

/** 초승달 (밤 알림) */
export function Moon({ x, y, r = 7 }: { x: number; y: number; r?: number }) {
  return <path data-part="moon" d={`M${x + r * 0.3} ${y - r} A${r} ${r} 0 1 0 ${x + r} ${y + r * 0.45} A${r * 0.8} ${r * 0.8} 0 0 1 ${x + r * 0.3} ${y - r} Z`} fill="#F8CE4E" stroke={GOLD_DARK} strokeWidth="0.9" />;
}

/** 하품 입김 동그라미 */
export function Bubbles({ x, y }: { x: number; y: number }) {
  return (
    <g fill="none" stroke="#B9B1AF" strokeWidth="1.1">
      <circle cx={x} cy={y} r="2.6" />
      <circle cx={x - 3} cy={y + 6} r="1.6" />
    </g>
  );
}

/** 발밑 그림자 */
export function Shadow({ x, y, rx = 30, className }: { x: number; y: number; rx?: number; className?: string }) {
  return <ellipse className={className} style={{ transformOrigin: `${x}px ${y}px` }} cx={x} cy={y} rx={rx} ry="4.5" fill="#000" opacity="0.08" />;
}

/** 방장 열쇠 (방장이 됐어요). (x, y) = 고리 가운데, rot 기울기 */
export function Key({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) {
  return (
    <g data-part="key" transform={`translate(${x} ${y}) rotate(${rot})`}>
      <circle cx="0" cy="0" r="8" fill={GOLD} {...line} strokeWidth={1.3} />
      <circle cx="0" cy="0" r="3" fill="#fff" {...line} strokeWidth={1.1} />
      <path d="M7 -2 H28 V2 H25 V7 H21 V2 H18 V6 H14 V2 H7 Z" fill={GOLD} {...line} strokeWidth={1.2} />
      <path d="M-4 -5 a5 5 0 0 1 4 -1.5" stroke={GOLD_HI} strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </g>
  );
}

/** 불 꺼진 작은 빌라 (해체 · 떠남). (x, y) = 바닥 가운데 */
export function MiniVilla({ x, y, w = 56, floors = 3 }: { x: number; y: number; w?: number; floors?: number }) {
  const fh = 18;
  const h = fh * floors + 8;
  const l = x - w / 2;
  const t = y - h;
  const wins = [];
  for (let f = 0; f < floors; f++) for (const c of [0, 1]) {
    wins.push(<rect key={`${f}-${c}`} x={l + 9 + c * (w / 2)} y={t + 10 + f * fh} width={w / 2 - 18} height={9} rx="1.5" fill="#E6E2E0" stroke="#B9B1AF" strokeWidth="1" />);
  }
  return (
    <g data-part="mini-villa">
      <path d={`M${l - 4} ${t + 2} L${x} ${t - 12} L${l + w + 4} ${t + 2} Z`} fill="#D9D3D1" stroke="#B9B1AF" strokeWidth="1.2" strokeLinejoin="round" />
      <rect x={l} y={t} width={w} height={h} rx="2" fill="#F3F1F0" stroke="#B9B1AF" strokeWidth="1.2" />
      {wins}
      <rect x={x - 6} y={y - 12} width="12" height="12" rx="1.5" fill="#D9D3D1" stroke="#B9B1AF" strokeWidth="1" />
    </g>
  );
}
