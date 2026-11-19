import type { CSSProperties, ReactNode } from "react";
import { ELBOW_DY, HAND, INK, PIVOT, SHORTS, detail, line, paint, shade, type Mode } from "./ink";

// 옷 그림: 반팔 티 · 도복 두 벌 · 상점에서 사는 옷 (docs/art-reference/hair-outfits-accessories.webp 2 · 3줄).
// 모든 조각은 차렷 자세의 리그 좌표로 그리고, 붙는 관절 그룹(몸통 · 팔 · 아래팔 · 다리 · 머리) 안에 넣는다.
// 몸 · 옷은 한 덩어리 외곽선(ink.ts paint)으로 그린다: 같은 덩어리의 조각을 ink 단계와 fill 단계에 똑같이 그리고,
// 옷과 맨살의 경계 같은 안쪽 선만 fill 단계에서 가늘게(detail) 긋는다.
// 윗옷은 옷 색(shirt)으로 칠하고, 아래옷 · 소품은 정해진 색이다.

export const OUTFIT_IDS = ["tank-joggers", "hoodie", "sports-bra-leggings", "singlet", "cycling-jersey", "rashguard"] as const;
export type OutfitId = (typeof OUTFIT_IDS)[number];
export const isOutfit = (v: unknown): v is OutfitId => (OUTFIT_IDS as readonly unknown[]).includes(v);

/** 옷: 반팔 티 / 주짓수 도복(두꺼운 깃 · 파란 띠) / 태권도 도복(V넥 · 검은 띠) / 상점에서 산 옷 */
export type Uniform = "tee" | "gi" | "dobok" | OutfitId;

const thin = { ...line, strokeWidth: 1.1 };
const JOGGER = "#C9CACF";
const LEGGINGS = "#363C5A";
const BIKE = "#2C2D35";
const WHITE = "#FFFFFF";
const GI = "#FFFFFF";
const GI_SHADE = "#E6E9F0";
const BELT = { gi: "#2F6FD0", dobok: "#25252D" } as const;
const V_TRIM = "#2A2A33";
// 소품 기본색 (참고 그림의 하늘색)
export const ACC_BLUE = "#8DB8EC";
const TOWEL = "#FBFAF6";

/** 몸통 (아래가 살짝 넓은 말랑한 몸). 티셔츠 모양이자, 민소매 옷 아래 맨몸 */
const BODY = "M44 88 Q60 84 76 88 Q80.5 104 80 121 Q60 125 40 121 Q39.5 104 44 88 Z";

type Sleeve = "none" | "short" | "long" | "gi";
const SLEEVE: Record<OutfitId, Sleeve> = {
  "tank-joggers": "none",
  hoodie: "long",
  "sports-bra-leggings": "none",
  singlet: "none",
  "cycling-jersey": "short",
  rashguard: "long",
};
export const sleeveOf = (u: Uniform): Sleeve => (u === "tee" ? "short" : u === "gi" || u === "dobok" ? "gi" : SLEEVE[u]);
const sleeveColor = (u: Uniform, shirt: string) => (u === "gi" || u === "dobok" ? GI : shirt);

type Bottom = "shorts" | "joggers" | "leggings" | "bike" | "run";
const BOTTOM: Record<OutfitId, Bottom> = {
  "tank-joggers": "joggers",
  hoodie: "shorts",
  "sports-bra-leggings": "leggings",
  singlet: "run",
  "cycling-jersey": "bike",
  rashguard: "shorts",
};
/** 몸통 쪽에 그리는 아래옷. 도복 바지는 다리 그룹에 그린다(null) */
const bottomOf = (u: Uniform): Bottom | null => (u === "tee" ? "shorts" : u === "gi" || u === "dobok" ? null : BOTTOM[u]);
/** 발목까지 덮는 긴 바지인지 (맨다리를 그리지 않는다) */
export const longPants = (u: Uniform) => {
  const b = bottomOf(u);
  return b === "joggers" || b === "leggings";
};

// ---------- 소매 · 어깨 ----------
/** 어깨 덮개 모양: 위는 둥근 어깨, 아래는 팔(소매) 너비로 좁아진다. top · mid · bot = 위 · 가운데 · 아래 반너비 */
const capD = (x: number, y: number, top: number, mid: number, bot: number, topY = -3, peak = -7, end = 8) =>
  `M${x - top} ${y + topY} Q${x} ${y + peak} ${x + top} ${y + topY} Q${x + mid} ${y + 2} ${x + bot} ${y + end} ` +
  `L${x - bot} ${y + end} Q${x - mid} ${y + 2} ${x - top} ${y + topY} Z`;
/** 반팔 소매 */
const shortSleeveD = (x: number, y: number) =>
  `M${x - 6.5} ${y - 3} Q${x} ${y - 7} ${x + 6.5} ${y - 3} Q${x + 8.6} ${y + 4} ${x + 7.8} ${y + 9.5} Q${x} ${y + 12} ${x - 7.8} ${y + 9.5} Q${x - 8.6} ${y + 4} ${x - 6.5} ${y - 3} Z`;

/**
 * 어깨 (팔 각도를 따라 도는 그룹). 몸통과 같은 ink/fill 단계에 그려 몸통과 한 덩어리가 되고(어깨 이음선 없음),
 * 팔을 그린 뒤 fill 단계만 다시 덮어 팔 윗부분의 외곽선을 가린다.
 * 반팔은 소매 전체, 긴팔 · 도복은 소매 윗부분, 민소매는 맨살 어깨.
 */
export function Shoulders({ m, uniform, skin, shirt, aL, aR }: { m: Mode; uniform: Uniform; skin: string; shirt: string; aL: number; aR: number }) {
  const sleeve = sleeveOf(uniform);
  const color = sleeveColor(uniform, shirt);
  return (
    <>
      {(["L", "R"] as const).map((side) => {
        const [x, y] = side === "L" ? PIVOT.shoulderL : PIVOT.shoulderR;
        const out = side === "L" ? -1 : 1;
        return (
          <ArmGroup key={side} side={side} a={side === "L" ? aL : aR}>
            {sleeve === "short" ? (
              <>
                <path d={shortSleeveD(x, y)} {...paint(m, color)} />
                {m === "fill" && uniform === "cycling-jersey" && (
                  <path d={`M${x - 7.9} ${y + 7.6} Q${x} ${y + 10.1} ${x + 7.9} ${y + 7.6}`} fill="none" stroke={shade(shirt, -0.16)} strokeWidth={2} />
                )}
                {m === "fill" && <path d={`M${x - 7.6} ${y + 9.4} Q${x} ${y + 11.9} ${x + 7.6} ${y + 9.4}`} {...detail} />}
              </>
            ) : sleeve === "long" ? (
              <>
                <path d={capD(x, y, 5.6, 7.3, 5.65)} {...paint(m, color)} />
                {m === "fill" && uniform === "rashguard" && <path d={`M${x + out * 4.4} ${y + 0.5} L${x + out * 4.3} ${y + 8.5}`} stroke={shade(shirt, 0.55)} strokeWidth={1.8} strokeLinecap="round" />}
              </>
            ) : sleeve === "gi" ? (
              <path d={capD(x, y, 6, 7.8, 6.25)} {...paint(m, color)} />
            ) : (
              <path d={capD(x, y, 4.6, 6.4, 4.9, -1.5, -3.6)} {...paint(m, skin)} />
            )}
          </ArmGroup>
        );
      })}
    </>
  );
}

/** 팔 관절 그룹 */
function ArmGroup({ side, a, children }: { side: "L" | "R"; a: number; children: ReactNode }) {
  return <Rot part={`arm${side}`} at={side === "L" ? PIVOT.shoulderL : PIVOT.shoulderR} a={a}>{children}</Rot>;
}
/** 축(x, y)을 중심으로 a도 돌린 관절 그룹. CSS 애니메이션은 --a를 기준으로 움직인다. (parts.tsx가 Joint로 내보낸다) */
export function Rot({ part, at, a, children }: { part: string; at: readonly [number, number]; a: number; children: ReactNode }) {
  const style = { transformOrigin: `${at[0]}px ${at[1]}px`, transform: `rotate(${a}deg)`, "--a": `${a}deg` } as CSSProperties;
  return <g data-part={part} style={style}>{children}</g>;
}

/** 위팔 (팔 그룹 안). 반팔 · 민소매는 맨살, 긴팔 · 도복은 소매 */
export function UpperArm({ m, uniform, x, y, skin, shirt }: { m: Mode; uniform: Uniform; x: number; y: number; skin: string; shirt: string }) {
  const ey = y + ELBOW_DY;
  switch (sleeveOf(uniform)) {
    case "long":
      return <path d={`M${x - 5.9} ${y - 1} L${x + 5.9} ${y - 1} L${x + 5.6} ${ey} L${x - 5.6} ${ey} Z`} {...paint(m, shirt)} />;
    case "gi":
      return <path d={`M${x - 6.4} ${y - 1} L${x + 6.4} ${y - 1} L${x + 6.2} ${ey} L${x - 6.2} ${ey} Z`} {...paint(m, GI)} />;
    case "none":
      return <rect x={x - 4.9} y={y - 1} width="9.8" height={ELBOW_DY + 4} rx="4.9" {...paint(m, skin)} />;
    default:
      return <rect x={x - 4.9} y={y + 2} width="9.8" height={ELBOW_DY + 3} rx="4.9" {...paint(m, skin)} />;
  }
}

/** 아래팔 + 손 (아래팔 그룹 안). 팔꿈치 높이 ey, 손목 hy */
export function Forearm({ m, uniform, side, x, ey, hy, skin, shirt, wristband }: { m: Mode; uniform: Uniform; side: "L" | "R"; x: number; ey: number; hy: number; skin: string; shirt: string; wristband?: boolean }) {
  const sleeve = sleeveOf(uniform);
  const out = side === "L" ? -1 : 1;
  const hand = <ellipse cx={x + out * HAND.dx} cy={hy + HAND.dy} rx={HAND.rx} ry={HAND.ry} {...paint(m, skin)} />;
  const cuff = hy - 2;
  const g = Math.max(hy - 6.5, ey + 4);
  return (
    <>
      {sleeve === "long" ? (
        <>
          {hand}
          <circle cx={x} cy={ey} r="5.6" {...paint(m, shirt)} />
          <path d={`M${x - 5.6} ${ey} L${x + 5.6} ${ey} L${x + 5.2} ${cuff} Q${x} ${cuff + 1.8} ${x - 5.2} ${cuff} Z`} {...paint(m, shirt)} />
          {m === "fill" && uniform === "hoodie" && (
            <path d={`M${x - 5.25} ${cuff - 3.4} Q${x} ${cuff - 1.6} ${x + 5.25} ${cuff - 3.4} L${x + 5.2} ${cuff} Q${x} ${cuff + 1.8} ${x - 5.2} ${cuff} Z`} {...detail} fill={shade(shirt, -0.16)} />
          )}
          {m === "fill" && uniform === "rashguard" && <path d={`M${x + out * 4.1} ${ey - 2} L${x + out * 3.8} ${cuff - 1}`} stroke={shade(shirt, 0.55)} strokeWidth={1.7} strokeLinecap="round" />}
          {m === "fill" && <path d={`M${x - 5.2} ${cuff} Q${x} ${cuff + 1.8} ${x + 5.2} ${cuff}`} {...detail} />}
        </>
      ) : (
        <>
          <rect x={x - 4.6} y={ey - 4.6} width="9.2" height={hy - ey + 4.6} rx="4.6" {...paint(m, skin)} />
          {hand}
          {sleeve === "gi" && (
            <>
              <circle cx={x} cy={ey} r="6.2" {...paint(m, GI)} />
              <path d={`M${x - 6.2} ${ey} L${x + 6.2} ${ey} L${x + 6.4} ${g} Q${x} ${g + 1.8} ${x - 6.4} ${g} Z`} {...paint(m, GI)} />
              {m === "fill" && <path d={`M${x - 6.3} ${g} Q${x} ${g + 1.8} ${x + 6.3} ${g}`} {...detail} />}
            </>
          )}
        </>
      )}
      {wristband && <Wristband m={m} x={x} hy={hy} wide={sleeve === "long"} />}
    </>
  );
}

// ---------- 다리 · 아래옷 ----------
/** 다리 (다리 그룹 안): 맨다리 + 운동화, 도복이면 흰 바지 + 맨발. 긴 바지는 몸통 쪽(Bottoms)에서 덮는다 */
export function LegShape({ m, uniform, side, skin }: { m: Mode; uniform: Uniform; side: "L" | "R"; skin: string }) {
  const [x, hy] = side === "L" ? PIVOT.hipL : PIVOT.hipR;
  const o = side === "L" ? -1 : 1;
  if (sleeveOf(uniform) === "gi")
    return (
      <>
        <ellipse cx={x + o * 1.2} cy="152.6" rx="6.8" ry="3.9" {...paint(m, skin)} />
        <path d={`M${x - 8} 118 L${x + 8} 118 L${x + 7.8} 149.5 Q${x} 151.3 ${x - 7.8} 149.5 Z`} {...paint(m, GI)} />
        {m === "fill" && <path d={`M${x - 7.7} 149.5 Q${x} 151.3 ${x + 7.7} 149.5`} {...detail} />}
      </>
    );
  return (
    <>
      {!longPants(uniform) && <rect x={x - 5.3} y={hy} width="10.6" height="24" rx="5.3" {...paint(m, skin)} />}
      {/* 동글동글 운동화 */}
      <path d={`M${x - 6.8 + o} 156 Q${x - 8 + o} 147 ${x + o} 146.5 Q${x + 8 + o} 147 ${x + 6.8 + o} 156 Q${x + o} 157.5 ${x - 6.8 + o} 156 Z`} {...paint(m, WHITE)} />
      {m === "fill" && (
        <>
          <path d={`M${x - 7 + o} 153.4 Q${x + o} 154.8 ${x + 7 + o} 153.4`} {...detail} stroke="#CFC6C3" strokeWidth={1.4} />
          <path d={`M${x - 5.6 + o} 148.6 Q${x + o} 150.4 ${x + 5.6 + o} 148.6`} {...detail} strokeWidth={0.9} />
        </>
      )}
    </>
  );
}

/** 아래옷 다리통 [허리 바깥, 허리 안쪽, 가운데 바깥, 가운데 높이, 단 높이, 단 바깥, 단 안쪽] (다리 가운데 기준 거리) */
const TUBE: Record<Bottom, [number, number, number, number, number, number, number]> = {
  shorts: [12.5, 7.5, 13.4, 126, 135, 13.6, 4.5],
  run: [12.5, 7.5, 13.4, 125, 132.5, 13.8, 4.8],
  bike: [12, 7.5, 10, 129, 141, 7.4, 6.6],
  joggers: [12.5, 7.5, 9.2, 133, 147.6, 7, 7],
  leggings: [11.5, 7.5, 8, 133, 147.6, 6, 6],
};
const BOTTOM_COLOR: Record<Bottom, string> = { shorts: SHORTS, run: SHORTS, bike: BIKE, joggers: JOGGER, leggings: LEGGINGS };

/**
 * 아래옷 (몸통 그룹, 윗옷보다 먼저): 골반 + 다리를 따라 도는 다리통 두 개를 한 덩어리로 그린다.
 * 다리통은 몸통 회전(torso)을 되돌린 뒤 다리 각도로 돌려, 다리 그룹과 같은 자리에 온다.
 */
export function Bottoms({ m, uniform, legL, legR, torso }: { m: Mode; uniform: Uniform; legL: number; legR: number; torso: number }) {
  const b = bottomOf(uniform);
  if (!b) return null;
  const color = BOTTOM_COLOR[b];
  const [tO, tI, mO, mY, hY, hO, hI] = TUBE[b];
  const waist = b === "leggings" ? 111 : 115;
  const tube = (side: "L" | "R") => {
    const [x] = side === "L" ? PIVOT.hipL : PIVOT.hipR;
    const o = side === "L" ? -1 : 1;
    const X = (d: number) => x + o * d;
    const Xi = (d: number) => x - o * d;
    return (
      <Rot key={side} part={`leg${side}`} at={side === "L" ? PIVOT.hipL : PIVOT.hipR} a={side === "L" ? legL : legR}>
        <path d={`M${X(tO)} 117 Q${X(mO)} ${mY} ${X(hO)} ${hY} Q${x} ${hY + 1.8} ${Xi(hI)} ${hY} L${Xi(tI)} 117 Z`} {...paint(m, color)} />
        {m === "fill" && b === "joggers" && (
          <>
            <path d={`M${x - 7.2} ${hY - 4.4} Q${x} ${hY - 2.8} ${x + 7.2} ${hY - 4.4}`} {...detail} strokeWidth={0.9} />
            <path d={`M${X(3)} 123 L${X(2.4)} ${hY - 7}`} stroke={WHITE} strokeWidth={1} opacity="0.6" strokeLinecap="round" />
          </>
        )}
        {m === "fill" && b === "leggings" && <path d={`M${X(2.4)} 126 L${X(1.6)} ${hY - 4}`} stroke={shade(LEGGINGS, 0.25)} strokeWidth={1} strokeLinecap="round" />}
        {m === "fill" && b === "bike" && <path d={`M${Xi(6.5)} ${hY - 2.6} Q${x} ${hY - 0.8} ${X(7.3)} ${hY - 2.6}`} fill="none" stroke={shade(BIKE, 0.35)} strokeWidth={1.2} />}
        {m === "fill" && b === "run" && <path d={`M${X(11.6)} 121 Q${X(12.4)} 126 ${X(12.6)} ${hY - 0.6}`} fill="none" stroke={WHITE} strokeWidth={1.5} strokeLinecap="round" />}
      </Rot>
    );
  };
  const hip = `M40.8 ${waist} L79.2 ${waist} Q80.3 ${waist + 6} 80.3 127 Q60 129 39.7 127 Q39.7 ${waist + 6} 40.8 ${waist} Z`;
  return (
    <g data-part={m === "fill" ? (b === "joggers" ? "joggers" : b === "leggings" ? "leggings" : b === "bike" ? "bike-shorts" : "shorts") : undefined}>
      <g transform={torso ? `rotate(${-torso} 60 127)` : undefined}>
        {tube("L")}
        {tube("R")}
      </g>
      <path d={hip} {...paint(m, color)} />
      {m === "fill" && (
        <>
          <path d="M60 123.5 V129.4" {...detail} strokeWidth={0.9} stroke={b === "shorts" ? INK : shade(color, 0.3)} />
          {b === "leggings" && <path d="M41.2 114.4 Q60 115.8 78.8 114.4" fill="none" stroke={shade(LEGGINGS, 0.25)} strokeWidth={1} />}
          {b === "leggings" && <path d="M40.9 111 L79.1 111" {...detail} />}
        </>
      )}
    </g>
  );
}

// ---------- 몸통 윗옷 ----------
function Belt({ m, color }: { m: Mode; color: string }) {
  const p = (d: string) => <path d={d} {...paint(m, color)} {...(m === "fill" ? { stroke: INK, strokeWidth: 1.1, strokeLinejoin: "round" as const } : {})} />;
  return (
    <>
      {p("M39.6 113.5 H80.4 Q81 117 80.6 120.5 H39.4 Q39 117 39.6 113.5 Z")}
      {p("M57 120 L53 131 L56.5 131.5 L60 121 L63.5 131.5 L67 131 L63 120 Z")}
      {p("M56.5 113 H63.5 V121 H56.5 Z")}
    </>
  );
}

const JACKET = "M43.5 87 Q60 83 76.5 87 Q80.8 108 80.4 131 Q60 134.5 39.6 131 Q39.2 108 43.5 87 Z";

/** 도복 윗도리 (몸통 그룹) */
function Jacket({ m, kind, skin }: { m: Mode; kind: "gi" | "dobok"; skin: string }) {
  return (
    <g data-part={m === "fill" ? kind : undefined}>
      <path d={JACKET} {...paint(m, GI)} />
      {m === "fill" &&
        (kind === "gi" ? (
          <>
            <path d="M53 86 L67 115 M67 86 L57.5 106" fill="none" stroke={GI_SHADE} strokeWidth={4.2} strokeLinecap="round" />
            <path d="M53 86 L67 115 M67 86 L57.5 106" {...detail} strokeWidth={1} />
          </>
        ) : (
          <>
            <path d="M54 87 L60 99 L66 87 Z" fill={skin} />
            <path d="M52.5 86.5 L60 100.5 L67.5 86.5" fill="none" stroke={V_TRIM} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
          </>
        ))}
      <Belt m={m} color={BELT[kind]} />
    </g>
  );
}

// 민소매 윗옷 모양과 안쪽 경계선(목선 · 진동둘레). 진동둘레 아래쪽은 앞에 그리는 팔이 가린다
const TANK = "M51 86.3 L55 86 Q60 91.5 65 86 L69 86.3 Q68.5 96 78.7 100.5 Q80.6 110 80 121 Q60 125 40 121 Q39.4 110 41.3 100.5 Q51.5 96 51 86.3 Z";
const TANK_EDGE = "M55 86 Q60 91.5 65 86 M69 86.3 Q68.5 96 78.7 100.5 M51 86.3 Q51.5 96 41.3 100.5";
const BRA = "M51 86.3 L55 86 Q60 93 65 86 L69 86.3 Q69 94 78.4 98.5 Q79.6 101.5 79.6 104.5 Q60 107.5 40.4 104.5 Q40.4 101.5 41.6 98.5 Q51 94 51 86.3 Z";
const BRA_EDGE = "M55 86 Q60 93 65 86 M69 86.3 Q69 94 78.4 98.5 M51 86.3 Q51 94 41.6 98.5 M79.6 104.5 Q60 107.5 40.4 104.5";
const SINGLET = "M51.5 86.3 L55 86 Q60 91 65 86 L68.5 86.3 Q68 96 78.9 101.5 Q80.6 110 80 121 Q60 125 40 121 Q39.4 110 41.1 101.5 Q52 96 51.5 86.3 Z";
const SINGLET_EDGE = "M55 86 Q60 91 65 86 M68.5 86.3 Q68 96 78.9 101.5 M51.5 86.3 Q52 96 41.1 101.5";
const SINGLET_TRIM = "M55.6 87.3 Q60 91.6 64.4 87.3 M67.3 87 Q66.9 96.4 78.2 102.6 M52.7 87 Q53.1 96.4 41.8 102.6";

/** 민소매 옷의 안쪽 경계선 (fill 단계) */
function TopEdges({ uniform, shirt }: { uniform: Uniform; shirt: string }) {
  switch (uniform) {
    case "tank-joggers":
      return <path d={TANK_EDGE} {...detail} />;
    case "sports-bra-leggings":
      return <path d={BRA_EDGE} {...detail} />;
    case "singlet":
      return (
        <>
          <path d={SINGLET_TRIM} fill="none" stroke={shade(shirt, 0.55)} strokeWidth={1.1} strokeLinecap="round" />
          <path d={SINGLET_EDGE} {...detail} />
        </>
      );
    default:
      return null;
  }
}

/** 몸통 윗옷 (몸통 그룹, 아래옷 다음). 티 · 도복 · 상점 옷 */
export function Top({ m, uniform, skin, shirt }: { m: Mode; uniform: Uniform; skin: string; shirt: string }) {
  if (uniform === "gi" || uniform === "dobok") return <Jacket m={m} kind={uniform} skin={skin} />;
  const f = m === "fill";
  const top = (d: string) => <path data-part={f ? (uniform === "tee" ? "tee" : "top") : undefined} d={d} {...paint(m, shirt)} />;
  const dark = shade(shirt, -0.16);
  const light = shade(shirt, 0.55);
  switch (uniform) {
    case "tee":
      return (
        <>
          {top(BODY)}
          {f && <path d="M53.5 86.8 Q60 92.6 66.5 86.8" {...detail} />}
        </>
      );
    case "tank-joggers":
      return (
        <>
          {top(TANK)}
          {f && <path d="M47.6 105 L47.2 117 M72.4 105 L72.8 117" stroke={WHITE} strokeWidth="1" opacity="0.35" strokeLinecap="round" />}
          {f && <TopEdges uniform={uniform} shirt={shirt} />}
        </>
      );
    case "sports-bra-leggings":
      return (
        <>
          {f && <path d="M58.6 108.6 Q60 109.8 61.4 108.6" fill="none" stroke={INK} strokeWidth={0.9} strokeLinecap="round" opacity="0.6" />}
          {top(BRA)}
          {f && <path d="M40.8 101.2 Q60 104 79.2 101.2" fill="none" stroke={light} strokeWidth={1.1} opacity="0.8" />}
          {f && <TopEdges uniform={uniform} shirt={shirt} />}
        </>
      );
    case "singlet":
      return (
        <>
          {top(SINGLET)}
          {f && <TopEdges uniform={uniform} shirt={shirt} />}
          {/* 레이스 번호표 (글자 없이) */}
          {f && (
            <g data-part="bib">
              <rect x="50.6" y="103" width="18.8" height="12" rx="1.4" fill={WHITE} {...thin} />
              <path d="M54 107.6 H66 M54 110.6 H62" stroke="#D9D3D0" strokeWidth={1.4} strokeLinecap="round" />
              {[[52.4, 104.8], [67.6, 104.8], [52.4, 113.2], [67.6, 113.2]].map(([cx, cy]) => (
                <circle key={`${cx},${cy}`} cx={cx} cy={cy} r="0.7" fill="#B9B1AF" />
              ))}
            </g>
          )}
        </>
      );
    case "hoodie":
      return (
        <>
          {top("M43.5 88 Q60 83.5 76.5 88 Q81.6 106 81.1 124.5 Q60 128.6 38.9 124.5 Q38.4 106 43.5 88 Z")}
          {/* 목 뒤로 넘긴 후드 */}
          <path data-part={f ? "hood" : undefined} d="M52.4 90 C51.4 83 55 79.5 60 80.8 C65 79.5 68.6 83 67.6 90 Q60 94.2 52.4 90 Z" {...paint(m, dark)} />
          {f && (
            <>
              <path d="M52.4 90 C51.4 83 55 79.5 60 80.8 C65 79.5 68.6 83 67.6 90 Q60 94.2 52.4 90 Z" {...detail} />
              <path d="M54.6 88.8 Q60 91.6 65.4 88.8" {...detail} />
              <path d="M39.3 120.3 Q60 124.2 80.7 120.3 L81.1 124.5 Q60 128.6 38.9 124.5 Z" fill={dark} />
              <path d="M39.3 120.3 Q60 124.2 80.7 120.3" {...detail} />
              {/* 캥거루 주머니 */}
              <path d="M49 107.5 H71 L73.6 119 Q60 121.4 46.4 119 Z" {...detail} fill={shirt} />
              <path d="M49 107.5 L46.4 119 M71 107.5 L73.6 119" {...detail} strokeWidth={1.3} />
              {/* 끈 */}
              <path d="M56.6 91.6 Q56 96 56.4 101.5 M63.4 91.6 Q64 96 63.6 101.5" fill="none" stroke={WHITE} strokeWidth={1.4} strokeLinecap="round" />
              <path d="M56.6 91.6 Q56 96 56.4 101.5 M63.4 91.6 Q64 96 63.6 101.5" fill="none" stroke={INK} strokeWidth={0.5} strokeLinecap="round" opacity="0.7" />
              <circle cx="56.4" cy="102.4" r="1.1" fill={WHITE} {...thin} strokeWidth={0.7} />
              <circle cx="63.6" cy="102.4" r="1.1" fill={WHITE} {...thin} strokeWidth={0.7} />
            </>
          )}
        </>
      );
    case "cycling-jersey":
      return (
        <>
          {top(BODY)}
          {f && (
            <>
              <path d="M44.3 91 Q40.6 104 40.4 120.8 Q43.6 121.8 46.8 122.3 Q47 106 48.6 92.2 Z M75.7 91 Q79.4 104 79.6 120.8 Q76.4 121.8 73.2 122.3 Q73 106 71.4 92.2 Z" fill={dark} />
              <path d="M40.3 118.2 Q60 122.2 79.7 118.2" fill="none" stroke={dark} strokeWidth={1.6} />
              {/* 지퍼 · 칼라 */}
              <path d="M60 88.4 V123.4" stroke={WHITE} strokeWidth={1.6} strokeLinecap="round" />
              <path d="M60 88.4 V123.4" stroke={INK} strokeWidth={0.45} opacity="0.55" />
              <circle cx="60" cy="90.6" r="1" fill={WHITE} {...thin} strokeWidth={0.7} />
              <path d="M54.2 87.2 L54.4 84.4 Q60 86.2 65.6 84.4 L65.8 87.2 Q60 89.2 54.2 87.2 Z" fill={shirt} {...thin} />
            </>
          )}
        </>
      );
    case "rashguard":
      return (
        <>
          {top("M44 88 Q60 84 76 88 Q80.6 104 80.2 122 Q60 126 39.8 122 Q39.4 104 44 88 Z")}
          {f && (
            <>
              <path d="M45 92 Q41.6 105 41.4 120 M75 92 Q78.4 105 78.6 120" fill="none" stroke={light} strokeWidth={2.2} strokeLinecap="round" />
              <path d="M54.2 87.6 L54.4 84 Q60 85.8 65.6 84 L65.8 87.6 Q60 89.6 54.2 87.6 Z" fill={dark} {...thin} />
            </>
          )}
        </>
      );
  }
}

/** 민소매 옷 아래 맨몸 */
export const bareBody = (u: Uniform) => sleeveOf(u) === "none";
export { BODY };

// ---------- 소품 ----------

/** 손목 밴드 (아래팔 그룹 안, 손 바로 위). 팔과 한 덩어리 외곽선, 안쪽 경계만 가는 선 */
export function Wristband({ m, x, hy, wide }: { m: Mode; x: number; hy: number; wide?: boolean }) {
  const w = wide ? 5.9 : 5.4;
  const band = { x: x - w, y: hy - 6.8, width: w * 2, height: 4.6, rx: 1.8 };
  if (m === "ink") return <rect {...band} {...paint(m, ACC_BLUE)} />;
  return (
    <g data-part="wristband">
      <rect {...band} {...detail} fill={ACC_BLUE} />
      <path d={`M${x - w + 0.8} ${hy - 4.5} H${x + w - 0.8}`} stroke={WHITE} strokeWidth={0.9} opacity="0.7" />
    </g>
  );
}

/** 머리 소품 (머리 그룹 안, 앞머리 위) */
export function Headwear({ id }: { id: string }) {
  if (id === "headband")
    return (
      <g data-part="headband">
        <path d="M25.6 46.5 C34 33.5 86 33.5 94.4 46.5 L94.6 53.6 C86 41.6 34 41.6 25.4 53.6 Z" fill={WHITE} {...line} />
        <path d="M25.6 48.9 C34 36.2 86 36.2 94.4 48.9 M25.5 51.2 C34 38.9 86 38.9 94.5 51.2" fill="none" stroke={ACC_BLUE} strokeWidth={1.6} />
      </g>
    );
  if (id === "cap")
    return (
      <g data-part="cap">
        {/* 왼쪽 앞으로 비스듬히 나온 챙 */}
        <path d="M46 49.5 C36 45.5 21 46.5 15.5 53 C17.5 56.5 29 56.5 38 55 C42 54.4 45 52.6 46 49.5 Z" fill={shade(ACC_BLUE, -0.12)} {...line} />
        <path d="M28.6 52.6 C28 32 42 20.5 60 20.5 C78 20.5 92 32 91.4 52.6 Q60 45 28.6 52.6 Z" fill={ACC_BLUE} {...line} />
        <path d="M60 21 C57 30 56 40 56.6 47.6 M44 26 C41 33 40 41 40.6 49" fill="none" {...thin} strokeWidth={0.9} opacity="0.55" />
        <path d="M70 27 C78 30 84 37 86 44" fill="none" stroke={WHITE} strokeWidth={1.6} strokeLinecap="round" opacity="0.6" />
        <circle cx="60" cy="21" r="2" fill={ACC_BLUE} {...thin} />
      </g>
    );
  return null;
}

/** 동그란 안경 (머리 그룹 안, 맨 위) */
export function Glasses() {
  const rim = { fill: WHITE, fillOpacity: 0.22, stroke: "#5E4B46", strokeWidth: 1.3 };
  return (
    <g data-part="glasses">
      <path d="M41.8 66 L31.5 63.6 M78.2 66 L88.5 63.6" stroke="#5E4B46" strokeWidth={1.1} strokeLinecap="round" />
      <circle cx="48" cy="67" r="6.3" {...rim} />
      <circle cx="72" cy="67" r="6.3" {...rim} />
      <path d="M54.3 66.2 Q60 63.4 65.7 66.2" fill="none" stroke="#5E4B46" strokeWidth={1.2} strokeLinecap="round" />
      <path d="M44.4 63.8 Q46 62.4 47.8 62.4 M68.4 63.8 Q70 62.4 71.8 62.4" fill="none" stroke={WHITE} strokeWidth={0.9} strokeLinecap="round" opacity="0.8" />
    </g>
  );
}

/** 목에 건 유선 이어폰 (몸통 그룹, 옷 위) */
export function Earphones() {
  const cord = "M54 86.8 C52.8 92 53.2 97.5 55.2 101.6 M66 86.8 C67.2 92 66.8 97.5 64.8 101.6";
  return (
    <g data-part="earphones">
      <path d={cord} fill="none" stroke={INK} strokeWidth={2.3} strokeLinecap="round" />
      <path d={cord} fill="none" stroke={WHITE} strokeWidth={1.1} strokeLinecap="round" />
      <ellipse cx="55.6" cy="103.4" rx="2.2" ry="2.6" fill={WHITE} {...thin} strokeWidth={0.9} />
      <ellipse cx="64.4" cy="103.4" rx="2.2" ry="2.6" fill={WHITE} {...thin} strokeWidth={0.9} />
    </g>
  );
}

/** 오른쪽(화면) 어깨에 걸친 수건 (몸통 그룹, 팔 위) */
export function Towel() {
  return (
    <g data-part="towel">
      <path d="M65.6 87.6 C67 83.2 76 82.6 80.6 86.4 L81.4 116.4 Q76.6 118.6 71.6 116.6 L71 93.2 C70.4 90.4 68.4 88.6 65.6 87.6 Z" fill={TOWEL} {...line} />
      <path d="M71.9 110.2 Q76.6 112.2 81.2 110.2 M71.9 112.6 Q76.6 114.6 81.3 112.6" fill="none" stroke={ACC_BLUE} strokeWidth={1} />
      <path d="M71 93.2 C73.5 91.5 77.5 91.2 80.7 92.4" fill="none" {...thin} strokeWidth={0.9} opacity="0.6" />
      <path d="M74.2 96 L74.6 107" stroke="#E7E3DA" strokeWidth={1.2} strokeLinecap="round" />
    </g>
  );
}
