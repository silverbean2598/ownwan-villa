import type { ReactNode } from "react";
import type { Face } from "./poses";

import { ELBOW_DY, HAIR, HAIR_HI, HAND, INK, PIVOT, SW, line, type Mode } from "./ink";
import { paint } from "./ink";
import { BODY, Bottoms, Forearm, LegShape, Rot, Shoulders, Top, UpperArm, bareBody, type Uniform } from "./wear";

export { INK, SW, PIVOT };
export type { Uniform };

/** 축(x, y)을 중심으로 a도 돌린 관절 그룹. CSS 애니메이션은 --a를 기준으로 움직인다. */
export const Joint = Rot;

/**
 * 한 덩어리 외곽선으로 그리는 부위. children을 ink 단계(진한 색 + 굵은 선)와 fill 단계(채색만)로 두 번 부른다.
 * 안쪽 관절 그룹(Joint)도 두 단계에 같은 data-part · 각도로 들어가므로 CSS 움직임이 함께 맞는다.
 */
export function Limb({ children }: { children: (m: Mode) => ReactNode }) {
  return (
    <>
      <g>{children("ink")}</g>
      <g>{children("fill")}</g>
    </>
  );
}

// ---------- 머리카락 ----------
export function Highlights({ spots }: { spots: [number, number, number, number, number][] }) {
  return (
    <g fill={HAIR_HI} opacity="0.85">
      {spots.map(([cx, cy, rx, ry, r], i) => (
        <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} transform={`rotate(${r} ${cx} ${cy})`} />
      ))}
    </g>
  );
}

// 앞머리 끝(아래로 뾰족한 머리 다발) 공통 경로: 오른쪽 관자놀이 → 왼쪽 관자놀이
export const BANGS =
  "C86 53 83 52 81 57 C80 52 78 50 76 49 C75 53 72 56 69 58 C68 53 66 50 64 48 C63 52 60 55 57 57 " +
  "C56 52 54 49 52 48 C51 52 48 54 45 56 C44 52 43 50 41 49 C40 54 37 57 35 61";

// 올림머리 앞머리: 끝이 둥근 다발. 오른쪽 관자놀이(88,58) → 왼쪽 관자놀이(35,61)
export const SOFT_BANGS =
  "C86 54 83 52 80 54 C79 50 75 47.5 71 48.5 C71 53 67 56 62.5 56.5 C63 51.5 59 48.5 55 49.5 " +
  "C54 54 50 56.5 46 57 C46.5 52.5 43 50.5 40 52.5 C38.5 56 36.5 59 35 61";

/** 올림머리 · 양갈래 · 포니테일이 함께 쓰는 몽글한 머리 뚜껑 + 둥근 앞머리 + 얼굴을 감싸는 짧은 옆머리 */
export const SOFT_CAP =
  "M33.5 79 C31 74 29.5 68 30 63 C27.5 59 27.5 53 29.5 49 C28.5 41 33 34 39.5 32 C43 27.5 50 26 55 27.5 C58 26.5 62 26.5 65 27.5 " +
  "C70 26 77 27.5 80.5 32 C87 34 91.5 41 90.5 49 C92.5 53 92.5 59 90 63 C90.5 68 89 74 86.5 79 C85.5 73 85.5 66 88 58 " +
  SOFT_BANGS +
  " C34.5 66 34.5 73 33.5 79 Z";

/** 올림머리 똥머리 원(머리 그룹 좌표). viewBox 위로 잘리지 않는지 테스트가 확인한다. */
export const BUN = { cx: 60, cy: 18.5, r: 10 } as const;

export function HairBack({ hair }: { hair: string }) {
  if (hair !== "long") return null;
  return (
    <path
      d="M30 50 C25 76 25 100 27 116 C38 121 49 119 60 120 C71 119 82 121 93 116 C95 100 95 76 90 50 Z"
      fill={HAIR}
      {...line}
    />
  );
}

export function HairFront({ hair }: { hair: string }) {
  switch (hair) {
    case "long":
      return (
        <g>
          <path
            d={
              "M29 66 C25 40 39 24 60 24 C81 24 95 40 91 66 C93 82 94 98 92 112 C89 113 86 112 84 109 " +
              "C86 94 87 78 87 62 " +
              BANGS +
              " C34 76 34 94 36 109 C34 112 31 113 28 112 C26 98 27 82 29 66 Z"
            }
            fill={HAIR}
            {...line}
          />
          <path d="M62 27 C58 34 57 41 58 47 M89 70 C90 84 90 96 89 106 M31 70 C30 84 30 96 31 106" fill="none" {...line} strokeWidth={1} opacity="0.55" />
          <Highlights spots={[[42, 34, 5, 3, -25], [74, 31, 4, 2.6, 20], [83, 40, 2, 2, 0]]} />
        </g>
      );
    case "bun":
      // 올림머리: 정수리에 외곽선 있는 동그란 똥머리 + 몽글한 머리 뚜껑 + 둥근 앞머리 + 얼굴을 감싸는 짧은 옆머리(한 덩어리)
      return (
        <g>
          <g data-part="bun">
            <circle cx={BUN.cx} cy={BUN.cy} r={BUN.r} fill={HAIR} {...line} />
            <path d="M51.5 20 C53 13 62 10.5 67.5 15.5 M53.5 24.5 C56 18.5 64 17 68.5 21.5" fill="none" stroke={HAIR_HI} strokeWidth={1.1} strokeLinecap="round" />
          </g>
          <path
            d={SOFT_CAP}
            fill={HAIR}
            {...line}
          />
          <path d="M60 30 C58 36 58 42 59 47 M72 31 C74 36 74 41 72 46 M47 32 C46 37 45 42 46 46" fill="none" {...line} strokeWidth={1} opacity="0.5" />
          <Highlights spots={[[40, 37, 5, 3, -25], [73, 32, 4, 2.4, 20], [56, 13.5, 2.4, 1.5, -20]]} />
        </g>
      );
    case "buzz":
      return (
        <g>
          <path
            d="M30.5 60 C28 40 42 29 60 29 C78 29 92 40 89.5 60 C88.5 55 87 51 85 48.5 C77 45 70 45.5 60 45.5 C50 45.5 43 45 35 48.5 C33 51 31.5 55 30.5 60 Z"
            fill={HAIR}
            {...line}
          />
          <Highlights spots={[[44, 36, 4.5, 2.4, -25], [72, 34, 3.6, 2, 20]]} />
        </g>
      );
    default:
      // short: 몽글몽글한 바깥선 + 한 가닥 바보털
      return (
        <g>
          <path d="M58.5 21 C56 13 62 8.5 68 11.5 C63.5 11.5 61.5 15 62.5 21 Z" fill={HAIR} {...line} />
          <path
            d={
              "M29 68 C23 64 23 57 26 53 C21 47 23 39 29 36 C27 28 35 22 43 23 C47 17 56 16 61 20 " +
              "C67 16 77 17 81 23 C89 23 95 30 93 37 C98 42 98 50 94 54 C97 59 96 65 91 68 " +
              "C90 64 89 61 88 58 " +
              BANGS +
              " C33 63 31 66 29 68 Z"
            }
            fill={HAIR}
            {...line}
          />
          <path d="M60 25 C58 33 57 40 58 47 M73 27 C75 34 75 40 73 46 M46 28 C45 34 44 40 45 45" fill="none" {...line} strokeWidth={1} opacity="0.5" />
          <Highlights spots={[[39, 32, 5, 3.2, -25], [70, 26, 4.2, 2.6, 15], [84, 34, 2.4, 2, 0], [52, 26, 2, 1.4, 0]]} />
        </g>
      );
  }
}

// ---------- 얼굴 ----------
export function Head({ skin }: { skin: string }) {
  return (
    <>
      {[31.5, 88.5].map((x) => (
        <g key={x}>
          <circle cx={x} cy="68" r="6.5" fill={skin} {...line} />
          <path d={x < 60 ? "M30.5 65.5 C28.5 67 28.5 70 31 71" : "M89.5 65.5 C91.5 67 91.5 70 89 71"} fill="none" {...line} strokeWidth={1} />
        </g>
      ))}
      <path d="M30.5 57 C30.5 38 43 29 60 29 C77 29 89.5 38 89.5 57 C89.5 75 77 84.5 60 84.5 C43 84.5 30.5 75 30.5 57 Z" fill={skin} {...line} />
    </>
  );
}

function Eye({ x }: { x: number }) {
  return (
    <g>
      <ellipse cx={x} cy="67" rx="4.4" ry="5" fill="#3B2A26" />
      <circle cx={x + 1.5} cy="65" r="1.7" fill="#fff" />
      <circle cx={x - 1.4} cy="69" r="0.8" fill="#fff" />
    </g>
  );
}

const MOUTH_RED = "#E06B73";
const TONGUE = "#F59CA3";
const TEAR = "#A9DBF7";
const TEAR_INK = "#6FA8DC";

/** 눈을 감고 웃는 눈(^ ^) */
const HAPPY_EYES = "M43.5 68.5 Q48 62.5 52.5 68.5 M67.5 68.5 Q72 62.5 76.5 68.5";

/** 반쯤 감은 눈: 눈동자 위를 피부색 눈꺼풀로 덮고 눈꺼풀 선을 긋는다 */
function LidEye({ x, skin, lid = 66 }: { x: number; skin: string; lid?: number }) {
  return (
    <g>
      <ellipse cx={x} cy="68" rx="4.2" ry="3.6" fill="#3B2A26" />
      <circle cx={x + 1.3} cy="67.6" r="1.1" fill="#fff" />
      <rect x={x - 5.5} y={lid - 6} width="11" height="6" fill={skin} />
      <path d={`M${x - 5.2} ${lid} L${x + 5.2} ${lid}`} stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
    </g>
  );
}

function Mouth({ face }: { face: Face }) {
  const ink = { stroke: "#8E4B44", strokeWidth: 1.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  switch (face) {
    case "happy":
      return (
        <>
          <path d="M55.5 75 Q60 75.8 64.5 75 Q63.8 81 60 81 Q56.2 81 55.5 75 Z" fill={MOUTH_RED} stroke={INK} strokeWidth="1.1" strokeLinejoin="round" />
          <path d="M57.5 79.6 Q60 78 62.5 79.6" fill={TONGUE} />
        </>
      );
    case "tears":
    case "laugh":
    case "love":
      return (
        <>
          <path d="M53.5 74 Q60 75.2 66.5 74 Q65.5 83.5 60 83.5 Q54.5 83.5 53.5 74 Z" fill={MOUTH_RED} stroke={INK} strokeWidth="1.1" strokeLinejoin="round" />
          <path d="M56.5 81.6 Q60 79 63.5 81.6 Q62 83 60 83 Q58 83 56.5 81.6 Z" fill={TONGUE} />
        </>
      );
    case "shocked":
      return <ellipse cx="60" cy="78.5" rx="3.6" ry="4.6" fill={MOUTH_RED} stroke={INK} strokeWidth="1.1" />;
    case "yawn":
      return (
        <>
          <ellipse cx="60" cy="78.5" rx="4" ry="5" fill={MOUTH_RED} stroke={INK} strokeWidth="1.1" />
          <ellipse cx="60" cy="81.3" rx="2.4" ry="1.6" fill={TONGUE} />
        </>
      );
    case "sulk":
    case "angry":
      // 볼을 부풀린 입 (3 모양을 눕힌 꼴)
      return <path d="M56.5 77.5 Q58.2 75.6 60 77.5 Q61.8 75.6 63.5 77.5" {...ink} />;
    case "shy":
      return <path d="M55.5 77.5 Q56.9 75.9 58.3 77.5 Q59.7 79.1 61.1 77.5 Q62.5 75.9 63.9 77.5" {...ink} />;
    case "sad":
      return <path d="M56.5 78.5 Q60 75.3 63.5 78.5" {...ink} />;
    case "smug":
      return (
        <>
          <path d="M53.5 75 Q60 78 66.5 74.5 Q65.5 80.5 60 81 Q55 80.5 53.5 75 Z" fill="#fff" stroke={INK} strokeWidth="1.1" strokeLinejoin="round" />
          <path d="M54.8 77.2 Q60 79.4 65.6 76.6 M58 76.7 V80.6 M62 76.4 V80.5" fill="none" stroke={INK} strokeWidth="0.6" />
        </>
      );
    case "cool":
      return <path d="M55 76.5 Q61 79.5 66 74.8" {...ink} />;
    case "proud":
      return <path d="M55.5 75.5 Q60 79.5 64.5 75.5" {...ink} />;
    default:
      return <path d="M56.5 75.5 Q60 78.8 63.5 75.5" {...ink} />;
  }
}

function Eyes({ face, skin }: { face: Face; skin: string }) {
  switch (face) {
    case "tears":
      return (
        <>
          {/* 눈물 줄기: 감은 눈 바깥에서 볼을 타고 흐른다 */}
          <path d="M42.5 68.5 C41 72 41.5 78 42.5 83 C44.5 83.5 46 83 46.5 82 C45.5 77 45.5 72 45.5 69 Z" fill={TEAR} stroke={TEAR_INK} strokeWidth="0.9" strokeLinejoin="round" />
          <path d="M77.5 68.5 C79 72 78.5 78 77.5 83 C75.5 83.5 74 83 73.5 82 C74.5 77 74.5 72 74.5 69 Z" fill={TEAR} stroke={TEAR_INK} strokeWidth="0.9" strokeLinejoin="round" />
          <path d={HAPPY_EYES} fill="none" stroke={INK} strokeWidth="1.7" strokeLinecap="round" />
        </>
      );
    case "love":
      // 하트 눈 (docs/art-reference/expressions.webp 아래 줄 둘째)
      return (
        <>
          {[48, 72].map((x) => (
            <path
              key={x}
              data-part="heart-eye"
              d={`M${x} 72 C${x - 7.5} 67 ${x - 5.5} 60.5 ${x} 64 C${x + 5.5} 60.5 ${x + 7.5} 67 ${x} 72 Z`}
              fill="#F2667E"
              stroke={INK}
              strokeWidth="1.1"
              strokeLinejoin="round"
            />
          ))}
        </>
      );
    case "laugh":
      return <path d={HAPPY_EYES} fill="none" stroke={INK} strokeWidth="1.7" strokeLinecap="round" />;
    case "yawn":
      return <path d="M43.5 67 Q48 70.5 52.5 67 M67.5 67 Q72 70.5 76.5 67" fill="none" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />;
    case "shocked":
      return (
        <>
          {[48, 72].map((x) => (
            <g key={x}>
              <circle cx={x} cy="66.5" r="5" fill="#fff" stroke={INK} strokeWidth="1.4" />
              <circle cx={x} cy="66.5" r="2.3" fill="#3B2A26" />
            </g>
          ))}
        </>
      );
    case "sulk":
    case "smug":
      return (
        <>
          <LidEye x={48} skin={skin} />
          <LidEye x={72} skin={skin} />
        </>
      );
    case "cool":
      return null;
    default:
      return (
        <>
          <Eye x={48} />
          <Eye x={72} />
        </>
      );
  }
}

export function FaceFeatures({ face, skin = "#FDE7DA" }: { face: Face; skin?: string }) {
  const mouthInk = { stroke: "#8E4B44", strokeWidth: 1.2, strokeLinecap: "round" as const, fill: "none" };
  return (
    <g data-part="face" data-face={face}>
      {[42, 78].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="75" rx="4.6" ry="2.9" fill="#F7A6A2" opacity={face === "shy" ? 1 : 0.8} />
          <path d={`M${x - 2.6} 76.2 l1.2 -2.2 M${x - 0.4} 76.2 l1.2 -2.2 M${x + 1.8} 76.2 l1.2 -2.2`} stroke="#E68784" strokeWidth="0.6" strokeLinecap="round" />
        </g>
      ))}
      <circle cx="60" cy="71.5" r="0.9" fill="#EE9C90" />
      {face === "sleep" ? (
        <>
          <path d="M43.5 67 Q48 70.5 52.5 67 M67.5 67 Q72 70.5 76.5 67" {...mouthInk} stroke={INK} strokeWidth={1.4} />
          <ellipse cx="60" cy="77.5" rx="1.7" ry="2.1" fill="#D9707A" stroke={INK} strokeWidth="0.9" />
        </>
      ) : face === "effort" ? (
        <>
          <path d="M44.5 63.5 L50.5 67 L44.5 70.5 M75.5 63.5 L69.5 67 L75.5 70.5" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M54.5 74.5 Q60 73.5 65.5 74.5 Q64.5 82 60 82 Q55.5 82 54.5 74.5 Z" fill="#E06B73" stroke={INK} strokeWidth="1.1" strokeLinejoin="round" />
          <path d="M57 80 Q60 78 63 80" fill="#F59CA3" />
        </>
      ) : (
        <>
          <Eyes face={face} skin={skin} />
          <Mouth face={face} />
        </>
      )}
    </g>
  );
}

/** 앞머리 위에 그리는 표정 요소: 눈썹 · 땀방울 · 선글라스 (앞머리에 가려지지 않게) */
export function FaceOverHair({ face }: { face: Face }) {
  const brow = { fill: "none", stroke: INK, strokeWidth: 1.6, strokeLinecap: "round" as const };
  switch (face) {
    case "angry":
      return <path data-part="brows" d="M42.5 58.5 L52 62 M77.5 58.5 L68 62" {...brow} />;
    case "determined":
      return (
        <g>
          <path data-part="brows" d="M43 59.5 L52 61.5 M77 59.5 L68 61.5" {...brow} />
          <path data-part="sweat" d="M88 47 C85.5 51.5 84.5 54 84.5 55.5 A3.5 3.5 0 0 0 91.5 55.5 C91.5 54 90.5 51.5 88 47 Z" fill={TEAR} stroke={TEAR_INK} strokeWidth="0.9" />
        </g>
      );
    case "sad":
    case "sulk":
      return <path data-part="brows" d="M43 61.5 L51.5 59.5 M77 61.5 L68.5 59.5" {...brow} strokeWidth={1.3} />;
    case "cool":
      return (
        <g data-part="sunglasses">
          <path d="M33 63 L87 63" stroke="#1F1D22" strokeWidth="2.2" strokeLinecap="round" />
          <path d="M38.5 62 H56 Q57 62 56.6 63.5 L55.2 70 Q54.4 73.5 50.5 73.5 H44.5 Q40.4 73.5 39.4 70 L37.7 63.6 Q37.4 62 38.5 62 Z" fill="#26232A" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
          <path d="M81.5 62 H64 Q63 62 63.4 63.5 L64.8 70 Q65.6 73.5 69.5 73.5 H75.5 Q79.6 73.5 80.6 70 L82.3 63.6 Q82.6 62 81.5 62 Z" fill="#26232A" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
          <path d="M41 64.5 L44.5 64.5 M66.5 64.5 L70 64.5" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" opacity="0.55" />
        </g>
      );
    default:
      return null;
  }
}

// ---------- 몸통 ----------
type TorsoProps = { skin: string; shirt: string; uniform: Uniform; aL: number; aR: number; legL: number; legR: number; torso: number };

/**
 * 목 · 아래옷 · 윗옷 · 어깨(소매)를 한 덩어리로 그린다. 어깨는 팔 각도를 따라 돌아서 어깨 이음선이 없다.
 * 팔을 그린 뒤 Avatar가 <Shoulders m="fill">로 어깨를 다시 덮는다.
 */
export function Torso({ skin, shirt, uniform, aL, aR, legL, legR, torso }: TorsoProps) {
  return (
    <g data-part="torso">
      <Limb>
        {(m) => (
          <>
            <rect x="55" y="78" width="10" height="12" {...paint(m, skin)} />
            {bareBody(uniform) && <path d={BODY} {...paint(m, skin)} />}
            {(m === "ink" || uniform === "hoodie") && <Shoulders m={m} uniform={uniform} skin={skin} shirt={shirt} aL={aL} aR={aR} />}
            <g data-part={m === "fill" && uniform !== "tee" && uniform !== "gi" && uniform !== "dobok" ? `outfit-${uniform}` : undefined}>
              <Bottoms m={m} uniform={uniform} legL={legL} legR={legR} torso={torso} />
              <Top m={m} uniform={uniform} skin={skin} shirt={shirt} />
            </g>
            {m === "fill" && uniform !== "hoodie" && <Shoulders m={m} uniform={uniform} skin={skin} shirt={shirt} aL={aL} aR={aR} />}
          </>
        )}
      </Limb>
    </g>
  );
}

// ---------- 팔 ----------
type ArmProps = { side: "L" | "R"; a: number; elb: number; fore?: number; skin: string; shirt: string; uniform: Uniform; wristband?: boolean };

/** 위팔 · 아래팔 · 벙어리장갑 손을 한 덩어리로. 팔꿈치 · 손목 이음선이 없다 */
export function Arm({ side, a, elb, fore = 13, skin, shirt, uniform, wristband }: ArmProps) {
  const [x, y] = side === "L" ? PIVOT.shoulderL : PIVOT.shoulderR;
  const ey = y + ELBOW_DY;
  const hy = ey + fore;
  return (
    <Joint part={`arm${side}`} at={[x, y]} a={a}>
      <Limb>
        {(m) => (
          <>
            <UpperArm m={m} uniform={uniform} x={x} y={y} skin={skin} shirt={shirt} />
            <Joint part={`fore${side}`} at={[x, ey]} a={elb}>
              <Forearm m={m} uniform={uniform} side={side} x={x} ey={ey} hy={hy} skin={skin} shirt={shirt} wristband={wristband} />
            </Joint>
          </>
        )}
      </Limb>
    </Joint>
  );
}

// ---------- 다리 ----------
/** 통통한 다리 + 동글동글 운동화를 한 덩어리로 (도복이면 흰 바지 + 맨발). 반바지 · 긴 바지는 몸통 쪽에서 덮는다 */
export function Leg({ side, a, skin, uniform }: { side: "L" | "R"; a: number; skin: string; uniform: Uniform }) {
  return (
    <Joint part={`leg${side}`} at={side === "L" ? PIVOT.hipL : PIVOT.hipR} a={a}>
      <Limb>{(m) => <LegShape m={m} uniform={uniform} side={side} skin={skin} />}</Limb>
    </Joint>
  );
}

// ---------- 소품 ----------
/** 머리 위로 든 바벨. 손 높이(y)에 맞춰 그린다. */
export function Barbell({ y }: { y: number }) {
  const plate = (x: number) => <rect x={x} y={y - 9} width="6.5" height="18" rx="2.2" fill="#5E5859" {...line} />;
  return (
    <g data-part="barbell">
      <rect x="4" y={y - 1.4} width="112" height="2.8" rx="1.4" fill="#8E8A8B" {...line} strokeWidth={1.1} />
      {plate(9)}
      {plate(104.5)}
      <rect x="15.5" y={y - 6} width="4" height="12" rx="1.5" fill="#5E5859" {...line} strokeWidth={1.1} />
      <rect x="100.5" y={y - 6} width="4" height="12" rx="1.5" fill="#5E5859" {...line} strokeWidth={1.1} />
    </g>
  );
}

/** 그래플링 더미: 둥근 몸통 + 머리 + 짧은 팔. 허리(0,0) 기준으로 서 있는 모양. */
export function Dummy({ transform }: { transform?: string }) {
  const BODY = "#B08560";
  const DARK = "#8C6646";
  return (
    <g data-part="dummy" transform={transform}>
      <path d="M-14 -30 Q-17 -12 -12 0 L12 0 Q17 -12 14 -30 Z" fill={BODY} {...line} />
      <rect x="-21" y="-31" width="9" height="16" rx="4.5" fill={BODY} {...line} transform="rotate(14 -16 -30)" />
      <rect x="12" y="-31" width="9" height="16" rx="4.5" fill={BODY} {...line} transform="rotate(-14 16 -30)" />
      <path d="M-15 -30 Q0 -36 15 -30 Q14 -25 0 -25 Q-14 -25 -15 -30 Z" fill={DARK} {...line} strokeWidth={1.1} />
      <rect x="-4" y="-38" width="8" height="8" fill={BODY} {...line} />
      <circle cx="0" cy="-45" r="9" fill={BODY} {...line} />
      <path d="M0 -24 V-4" stroke={DARK} strokeWidth="1" strokeLinecap="round" />
    </g>
  );
}

/**
 * 팔 각도로 손(벙어리장갑) 중심의 리그 좌표를 구한다. 축하 장면에서 트로피 · 상자 같은 소품을 손에 맞춰 놓을 때 쓴다.
 * 몸통 회전(torso)은 0이라고 보고, 리그 전체 offsetY만 더한다.
 */
export function handAt(side: "L" | "R", a: number, elb: number, fore = 13, offsetY = 0): [number, number] {
  const [sx, sy] = side === "L" ? PIVOT.shoulderL : PIVOT.shoulderR;
  const rad = (d: number) => (d * Math.PI) / 180;
  // 팔꿈치 기준 손 중심 (아래팔 끝에서 바깥쪽 HAND.dx, 아래로 HAND.dy)
  const lx = (side === "L" ? -1 : 1) * HAND.dx;
  const ly = fore + HAND.dy;
  const fx = lx * Math.cos(rad(elb)) - ly * Math.sin(rad(elb));
  const fy = ELBOW_DY + lx * Math.sin(rad(elb)) + ly * Math.cos(rad(elb));
  // 어깨 기준으로 위팔 각도만큼
  const x = sx + fx * Math.cos(rad(a)) - fy * Math.sin(rad(a));
  const y = sy + fx * Math.sin(rad(a)) + fy * Math.cos(rad(a));
  return [x, y + offsetY];
}
