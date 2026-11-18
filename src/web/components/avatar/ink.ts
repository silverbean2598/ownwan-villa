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
