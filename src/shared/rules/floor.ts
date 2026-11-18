/** floor null = 빌라 없음 */
export type DayState = { streak: number; missRun: number; floor: number | null };

export function settleDay(
  s: DayState,
  certified: boolean,
): { next: DayState; floorChanged: "up" | "down" | null } {
  const streak = certified ? s.streak + 1 : 0;
  const missRun = certified ? 0 : s.missRun + 1;
  let floor = s.floor;
  let floorChanged: "up" | "down" | null = null;

  if (floor !== null) {
    if (certified && streak % 7 === 0) {
      floor += 1;
      floorChanged = "up";
    } else if (!certified && missRun % 7 === 1 && floor > 1) {
      floor -= 1;
      floorChanged = "down";
    }
  }
  return { next: { streak, missRun, floor }, floorChanged };
}
