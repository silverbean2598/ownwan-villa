// 캐릭터 그림 공통 색 · 선 · 관절 좌표 (parts · hair · wear 가 함께 쓴다)

// 기준 그림의 말랑한 갈색 외곽선과 파스텔 채색
export const INK = "#5B4640";
export const SW = 1.5;
export const HAIR = "#56423D";
export const HAIR_HI = "#7E6760";
export const SHORTS = "#3D5089";
export const SKIN_DEFAULT = "#FDE7DA";

export const line = { stroke: INK, strokeWidth: SW, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

// 관절 위치(회전 축). 모든 부위는 차렷 자세의 절대 좌표로 그리고, 축을 기준으로 돌린다.
export const PIVOT = {
  neck: [60, 84],
  hip: [60, 127],
  shoulderL: [45, 89],
  shoulderR: [75, 89],
  hipL: [53, 126],
  hipR: [67, 126],
} as const;
export const ELBOW_DY = 10;

/** 색을 섞는다. k > 0 이면 흰색 쪽으로, k < 0 이면 어두운 쪽으로 (0~1) */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const to = k > 0 ? 255 : 30;
  const t = Math.abs(k);
  const ch = (v: number) => Math.round(v + (to - v) * t).toString(16).padStart(2, "0");
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

// ---------- 한 덩어리 외곽선 ----------
// 부위를 먼저 진한 색 + 굵은 선(ink)으로 깔고, 그 위에 같은 모양을 채색(fill)만 다시 그린다.
// 같은 덩어리 안의 이음새(어깨 · 팔꿈치 · 손목 · 발목)는 채색끼리 겹쳐 선이 사라지고 바깥 윤곽만 남는다.
export type Mode = "ink" | "fill";
/** ink 단계 선 굵기 (바깥으로 1.6 보인다) */
export const OUT = 3.2;
export const paint = (m: Mode, fill: string) =>
  m === "ink" ? { fill: INK, stroke: INK, strokeWidth: OUT, strokeLinejoin: "round" as const } : { fill };
/** 덩어리 안쪽의 가는 선 (목선 · 소매 끝 · 밑창 · 옷 경계). fill 단계에서만 그린다 */
export const detail = { fill: "none", stroke: INK, strokeWidth: 1.1, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** 손(벙어리장갑) 중심: 아래팔 끝에서 바깥쪽 dx, 아래로 dy */
export const HAND = { dx: 0.6, dy: 1, rx: 5.6, ry: 6 } as const;
