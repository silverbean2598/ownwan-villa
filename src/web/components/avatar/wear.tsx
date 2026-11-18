import { INK, SHORTS, line, shade } from "./ink";

// 상점에서 사는 옷 · 소품 그림 (docs/art-reference/hair-outfits-accessories.webp 2 · 3줄).
// 모든 조각은 차렷 자세의 리그 좌표로 그리고, 붙는 관절 그룹(몸통 · 팔 · 아래팔 · 다리 · 머리) 안에 넣는다.
// 윗옷은 옷 색(shirt)으로 칠하고, 아래옷 · 소품은 정해진 색이다.

export const OUTFIT_IDS = ["tank-joggers", "hoodie", "sports-bra-leggings", "singlet", "cycling-jersey", "rashguard"] as const;
export type OutfitId = (typeof OUTFIT_IDS)[number];
export const isOutfit = (v: unknown): v is OutfitId => (OUTFIT_IDS as readonly unknown[]).includes(v);

const thin = { ...line, strokeWidth: 1.1 };
const JOGGER = "#C9CACF";
const LEGGINGS = "#363C5A";
const BIKE = "#2C2D35";
const WHITE = "#FFFFFF";
// 소품 기본색 (참고 그림의 하늘색)
export const ACC_BLUE = "#8DB8EC";
const TOWEL = "#FBFAF6";

/** 피부가 드러나는 윗옷(민소매 · 브라 · 싱글렛) 아래에 까는 맨몸 */
const BODY = "M45 88 Q60 84.5 75 88 L78 121.5 Q60 124.5 42 121.5 Z";

type Sleeve = "none" | "short" | "long";
const SLEEVE: Record<OutfitId, Sleeve> = {
  "tank-joggers": "none",
  hoodie: "long",
  "sports-bra-leggings": "none",
  singlet: "none",
  "cycling-jersey": "short",
  rashguard: "long",
};

type Bottom = "shorts" | "joggers" | "leggings" | "bike" | "run";
const BOTTOM: Record<OutfitId, Bottom> = {
  "tank-joggers": "joggers",
  hoodie: "shorts",
  "sports-bra-leggings": "leggings",
  singlet: "run",
  "cycling-jersey": "bike",
  rashguard: "shorts",
};

/** 골반 부분(반바지 · 바지 허리). 다리 그룹보다 위(몸통)에 그린다 */
function Hips({ bottom }: { bottom: Bottom }) {
  switch (bottom) {
    case "joggers":
      return (
        <g data-part="joggers">
          <path d="M42.5 117 L77.5 117 L79 129 Q60 131 41 129 Z" fill={JOGGER} {...line} />
          <path d="M42.8 120 Q60 121.4 77.2 120" fill="none" {...thin} strokeWidth={0.9} />
          <path d="M58.6 120.6 Q57.6 123.5 58.4 126 M61.4 120.6 Q62.4 123.5 61.6 126" fill="none" stroke={WHITE} strokeWidth={1} strokeLinecap="round" />
          <path d="M58.6 120.6 Q57.6 123.5 58.4 126 M61.4 120.6 Q62.4 123.5 61.6 126" fill="none" stroke={INK} strokeWidth={0.5} strokeLinecap="round" opacity="0.6" />
        </g>
      );
    case "leggings":
      return (
        <g data-part="leggings">
          <path d="M42.6 111 L77.4 111 L79 129 Q60 131 41 129 Z" fill={LEGGINGS} {...line} />
          <path d="M42.8 114.4 Q60 115.8 77.2 114.4" fill="none" stroke={shade(LEGGINGS, 0.25)} strokeWidth={1} />
          <line x1="60" y1="122" x2="60" y2="130" stroke={shade(LEGGINGS, 0.2)} strokeWidth={0.9} />
        </g>
      );
    case "bike":
      return (
        <g data-part="bike-shorts">
          <path d="M42.5 117 L77.5 117 L79 129 Q60 131 41 129 Z" fill={BIKE} {...line} />
          <line x1="60" y1="124" x2="60" y2="130" stroke={shade(BIKE, 0.3)} strokeWidth={0.9} />
        </g>
      );
    default:
      return (
        <>
          <path d="M42.5 117 L77.5 117 L79 129 Q60 131 41 129 Z" fill={SHORTS} {...line} />
          <line x1="60" y1="124" x2="60" y2="130" {...line} strokeWidth={1} />
        </>
      );
  }
}

/** 몸통에 입는 옷 (목 아래). shirt = 윗옷 색 */
export function OutfitTorso({ id, skin, shirt }: { id: OutfitId; skin: string; shirt: string }) {
  const dark = shade(shirt, -0.16);
  const light = shade(shirt, 0.55);
  const top = (() => {
    switch (id) {
      case "tank-joggers":
        return (
          <>
            <path d={BODY} fill={skin} {...line} />
            <path data-part="top" d="M48.2 86.4 L52.4 86 Q60 93 67.6 86 L71.8 86.4 Q71.6 93.5 76.4 97.5 L78 121.5 Q60 124.5 42 121.5 L43.6 97.5 Q48.4 93.5 48.2 86.4 Z" fill={shirt} {...line} />
            <path d="M48 104 L47.6 117 M72 104 L72.4 117" stroke={WHITE} strokeWidth="1" opacity="0.35" strokeLinecap="round" />
          </>
        );
      case "hoodie":
        return (
          <>
            <path data-part="top" d="M44.6 88 Q60 84 75.4 88 L78.6 124.5 Q60 128 41.4 124.5 Z" fill={shirt} {...line} />
            <path d="M41.8 120.4 Q60 123.8 78.2 120.4 L78.6 124.5 Q60 128 41.4 124.5 Z" fill={dark} {...thin} />
            {/* 캥거루 주머니 */}
            <path d="M49 107.5 H71 L73.6 119 Q60 121.2 46.4 119 Z" fill={shirt} {...thin} />
            <path d="M49 107.5 L46.4 119 M71 107.5 L73.6 119" fill="none" {...thin} strokeWidth={1.3} />
            {/* 목 뒤로 넘긴 후드 */}
            <path data-part="hood" d="M45.6 89.5 C45 82 52 78.5 60 80.5 C68 78.5 75 82 74.4 89.5 Q60 95.5 45.6 89.5 Z" fill={dark} {...line} />
            <path d="M51 88.6 Q60 92.4 69 88.6" fill="none" {...thin} />
            {/* 끈 */}
            <path d="M56.4 91 Q55.8 96 56.2 101.5 M63.6 91 Q64.2 96 63.8 101.5" fill="none" stroke={WHITE} strokeWidth={1.4} strokeLinecap="round" />
            <path d="M56.4 91 Q55.8 96 56.2 101.5 M63.6 91 Q64.2 96 63.8 101.5" fill="none" stroke={INK} strokeWidth={0.5} strokeLinecap="round" opacity="0.7" />
            <circle cx="56.2" cy="102.4" r="1.1" fill={WHITE} {...thin} strokeWidth={0.7} />
            <circle cx="63.8" cy="102.4" r="1.1" fill={WHITE} {...thin} strokeWidth={0.7} />
          </>
        );
      case "sports-bra-leggings":
        return (
          <>
            <path d={BODY} fill={skin} {...line} />
            <path d="M58.6 107.2 Q60 108.4 61.4 107.2" fill="none" stroke={INK} strokeWidth={0.9} strokeLinecap="round" opacity="0.6" />
            <path data-part="top" d="M48 86.4 L52 86 Q60 93.6 68 86 L72 86.4 Q72.2 93 76.2 96.4 L76.9 104 Q60 106.6 43.1 104 L43.8 96.4 Q47.8 93 48 86.4 Z" fill={shirt} {...line} />
            <path d="M43.4 100.6 Q60 103.2 76.6 100.6" fill="none" stroke={light} strokeWidth={1.1} opacity="0.8" />
          </>
        );
      case "singlet":
        return (
          <>
            <path d={BODY} fill={skin} {...line} />
            <path data-part="top" d="M49.6 86.3 L53.6 86 Q60 91.6 66.4 86 L70.4 86.3 Q69.8 95 76.4 100.2 L78 121.5 Q60 124.5 42 121.5 L43.6 100.2 Q50.2 95 49.6 86.3 Z" fill={shirt} {...line} />
            <path d="M53.8 87.2 Q60 92.4 66.2 87.2 M50.6 87.2 Q51 95 44.6 100.4 M69.4 87.2 Q69 95 75.4 100.4" fill="none" stroke={light} strokeWidth={1.1} strokeLinecap="round" />
            {/* 레이스 번호표 (글자 없이) */}
            <g data-part="bib">
              <rect x="50.6" y="101" width="18.8" height="12" rx="1.4" fill={WHITE} {...thin} />
              <path d="M54 105.6 H66 M54 108.6 H62" stroke="#D9D3D0" strokeWidth={1.4} strokeLinecap="round" />
              {[[52.4, 102.8], [67.6, 102.8], [52.4, 111.2], [67.6, 111.2]].map(([cx, cy]) => (
                <circle key={`${cx},${cy}`} cx={cx} cy={cy} r="0.7" fill="#B9B1AF" />
              ))}
            </g>
          </>
        );
      case "cycling-jersey":
        return (
          <>
            <path data-part="top" d="M45 88 Q60 84.5 75 88 L77.6 121.5 Q60 124.5 42.4 121.5 Z" fill={shirt} {...line} />
            <path d="M45.4 91 L43 121.2 Q45 121.7 47.4 122 L48.8 92.2 Z M74.6 91 L77 121.2 Q75 121.7 72.6 122 L71.2 92.2 Z" fill={dark} />
            <path d="M42.6 118.6 Q60 121.6 77.4 118.6" fill="none" stroke={dark} strokeWidth={1.6} />
            {/* 지퍼 · 칼라 */}
            <path d="M60 88.4 V121.8" stroke={WHITE} strokeWidth={1.6} strokeLinecap="round" />
            <path d="M60 88.4 V121.8" stroke={INK} strokeWidth={0.45} opacity="0.55" />
            <circle cx="60" cy="90.6" r="1" fill={WHITE} {...thin} strokeWidth={0.7} />
            <path d="M54.2 87.2 L54.4 84.4 Q60 86.2 65.6 84.4 L65.8 87.2 Q60 89.2 54.2 87.2 Z" fill={shirt} {...thin} />
            <path d="M45 88 Q60 84.5 75 88 L77.6 121.5 Q60 124.5 42.4 121.5 Z" fill="none" {...line} />
          </>
        );
      case "rashguard":
        return (
          <>
            <path data-part="top" d="M45 88 Q60 84.5 75 88 L77.8 122 Q60 125 42.2 122 Z" fill={shirt} {...line} />
            <path d="M46.2 91.5 L43.6 120.4 M73.8 91.5 L76.4 120.4" stroke={light} strokeWidth={2.2} strokeLinecap="round" />
            <path d="M54.2 87.6 L54.4 84 Q60 85.8 65.6 84 L65.8 87.6 Q60 89.6 54.2 87.6 Z" fill={dark} {...thin} />
          </>
        );
    }
  })();
  return (
    <g data-part={`outfit-${id}`}>
      <Hips bottom={BOTTOM[id]} />
      {top}
    </g>
  );
}

/**
 * 위팔(팔 그룹 안, 아래팔 그룹 다음에 그린다). 어깨 (x, y), 팔꿈치 높이 ey.
 * 민소매는 맨팔, 반팔은 소매, 긴팔은 팔꿈치를 덮는 소매.
 */
export function OutfitUpperArm({ id, x, y, ey, side, skin, shirt }: { id: OutfitId; x: number; y: number; ey: number; side: "L" | "R"; skin: string; shirt: string }) {
  const out = side === "L" ? -1 : 1;
  switch (SLEEVE[id]) {
    case "none":
      return <rect x={x - 3.9} y={y - 4.5} width="7.8" height={ey - y + 7} rx="3.9" fill={skin} {...line} />;
    case "short": {
      const end = y + 10.5;
      return (
        <>
          <path d={`M${x - 6} ${y - 2} Q${x} ${y - 6} ${x + 6} ${y - 2} L${x + 6.8} ${end} Q${x} ${end + 2.2} ${x - 6.8} ${end} Z`} fill={shirt} {...line} />
          <path d={`M${x - 6.6} ${end - 1.6} Q${x} ${end + 0.6} ${x + 6.6} ${end - 1.6}`} fill="none" stroke={shade(shirt, -0.16)} strokeWidth={1.8} />
        </>
      );
    }
    case "long": {
      const end = ey + 3;
      return (
        <>
          <path d={`M${x - 6} ${y - 2} Q${x} ${y - 6} ${x + 6} ${y - 2} L${x + 5.4} ${end} Q${x} ${end + 1.8} ${x - 5.4} ${end} Z`} fill={shirt} {...line} />
          {id === "rashguard" && <path d={`M${x + out * 4.6} ${y + 1} L${x + out * 4.2} ${end - 0.6}`} stroke={shade(shirt, 0.55)} strokeWidth={1.8} strokeLinecap="round" />}
        </>
      );
    }
  }
}

/** 아래팔 소매 (아래팔 그룹 안, 손 앞에). 긴팔만 */
export function OutfitForearm({ id, x, ey, hy, side, shirt }: { id: OutfitId; x: number; ey: number; hy: number; side: "L" | "R"; shirt: string }) {
  if (SLEEVE[id] !== "long" || hy - ey < 6) return null;
  const out = side === "L" ? -1 : 1;
  const cuff = id === "hoodie";
  return (
    <>
      <rect x={x - 4.5} y={ey - 3} width="9" height={hy - ey - 0.6} rx="2.6" fill={shirt} {...line} />
      {cuff && <rect x={x - 4.3} y={hy - 6.4} width="8.6" height="3.6" rx="1.4" fill={shade(shirt, -0.16)} {...thin} />}
      {id === "rashguard" && <path d={`M${x + out * 3.2} ${ey} L${x + out * 3.2} ${hy - 5}`} stroke={shade(shirt, 0.55)} strokeWidth={1.6} strokeLinecap="round" />}
    </>
  );
}

/** 발목까지 덮는 긴 바지인지 (맨다리를 그리지 않는다) */
export const longPants = (id: OutfitId) => BOTTOM[id] === "joggers" || BOTTOM[id] === "leggings";

/** 다리에 입는 옷. 맨다리 · 신발 다음(위)에 그린다. x = 다리 가운데, out = 바깥쪽 방향 */
export function OutfitLeg({ id, x, out }: { id: OutfitId; x: number; out: number }) {
  switch (BOTTOM[id]) {
    case "joggers":
      return (
        <>
          <path d={`M${x - 7.5} 120 L${x + 7.5} 120 L${x + 6.6} 141 L${x + 5.4} 146.8 Q${x} 148 ${x - 5.4} 146.8 L${x - 6.6} 141 Z`} fill={JOGGER} {...line} />
          <path d={`M${x - 6.4} 142.6 Q${x} 144 ${x + 6.4} 142.6`} fill="none" {...thin} strokeWidth={0.9} />
          <path d={`M${x + out * 2} 124 L${x + out * 1.6} 139`} stroke={WHITE} strokeWidth={1} opacity="0.6" strokeLinecap="round" />
        </>
      );
    case "leggings":
      return (
        <>
          <path d={`M${x - 7.5} 120 L${x + 7.5} 120 L${x + 4.9} 146.6 Q${x} 147.6 ${x - 4.9} 146.6 Z`} fill={LEGGINGS} {...line} />
          <path d={`M${x + out * 1.8} 126 L${x + out * 1.2} 143`} stroke={shade(LEGGINGS, 0.25)} strokeWidth={1} strokeLinecap="round" />
        </>
      );
    case "bike":
      return (
        <>
          <path d={`M${x - 7.5} 120 L${x + 7.5} 120 L${x + 6.2} 140.4 Q${x} 141.6 ${x - 6.2} 140.4 Z`} fill={BIKE} {...line} />
          <path d={`M${x - 6.1} 138 Q${x} 139.2 ${x + 6.1} 138`} fill="none" stroke={shade(BIKE, 0.35)} strokeWidth={1.2} />
        </>
      );
    case "run":
      return (
        <>
          <path d={`M${x - 7.5} 120 L${x + 7.5} 120 L${x + 8} 132.5 Q${x} 134 ${x - 8} 132.5 Z`} fill={SHORTS} {...line} />
          <path d={`M${x + out * 6.9} 121 L${x + out * 7.5} 132.6`} stroke={WHITE} strokeWidth={1.5} strokeLinecap="round" />
        </>
      );
    default:
      return (
        <>
          <path d={`M${x - 7.5} 120 L${x + 7.5} 120 L${x + 8} 134 Q${x} 135.5 ${x - 8} 134 Z`} fill={SHORTS} {...line} />
        </>
      );
  }
}

// ---------- 소품 ----------

/** 손목 밴드 (아래팔 그룹 안, 손 바로 위) */
export function Wristband({ x, hy }: { x: number; hy: number }) {
  return (
    <g data-part="wristband">
      <rect x={x - 4.9} y={hy - 7.4} width="9.8" height="4.6" rx="1.8" fill={ACC_BLUE} {...thin} />
      <path d={`M${x - 4.2} ${hy - 5.1} H${x + 4.2}`} stroke={WHITE} strokeWidth={0.9} opacity="0.7" />
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
  const cord = "M52.6 86.8 C51 92 51.6 97.5 54 101.6 M67.4 86.8 C69 92 68.4 97.5 66 101.6";
  return (
    <g data-part="earphones">
      <path d={cord} fill="none" stroke={INK} strokeWidth={2.3} strokeLinecap="round" />
      <path d={cord} fill="none" stroke={WHITE} strokeWidth={1.1} strokeLinecap="round" />
      <ellipse cx="54.4" cy="103.4" rx="2.2" ry="2.6" fill={WHITE} {...thin} strokeWidth={0.9} />
      <ellipse cx="65.6" cy="103.4" rx="2.2" ry="2.6" fill={WHITE} {...thin} strokeWidth={0.9} />
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
