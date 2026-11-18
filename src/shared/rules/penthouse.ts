export type Contender = { userId: string; floor: number; streak: number; floorReachedAt: number };

/** 층 내림차순 → 연속 기록 내림차순 → 층 도달 시각 오름차순 */
export function pickPenthouse(cs: Contender[]): string | null {
  if (cs.length === 0) return null;
  const sorted = [...cs].sort(
    (a, b) => b.floor - a.floor || b.streak - a.streak || a.floorReachedAt - b.floorReachedAt,
  );
  return sorted[0].userId;
}
