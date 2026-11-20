// 집 · 도시 · 소품 그림 공통 갈색 외곽선 색 (기준 그림의 말랑한 갈색 외곽선)
export const INK = "#5B4640";

/** 색을 섞는다. k > 0 이면 흰색 쪽으로, k < 0 이면 어두운 쪽으로 (0~1) */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const to = k > 0 ? 255 : 30;
  const t = Math.abs(k);
  const ch = (v: number) => Math.round(v + (to - v) * t).toString(16).padStart(2, "0");
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}
