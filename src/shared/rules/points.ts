const PHOTO_POINTS = [20, 10, 5];

/** nth: 그날 중복이 아닌 사진의 순번 (1부터) */
export function photoPoints(nth: number): number {
  return PHOTO_POINTS[nth - 1] ?? 0;
}

export function routinePoints(alreadyToday: boolean): number {
  return alreadyToday ? 0 : 10;
}

/** 식단 한 끼 포인트 · 하루(KST) 식단 포인트 상한 [확정 — 기획자 결정] */
export const MEAL_POINTS = 5;
export const MEAL_DAILY_CAP = 15;

/** 식단 포인트: 그날 식단으로 이미 받은(되돌리지 않은) 포인트가 earnedToday 일 때 이번 식단이 받는 포인트. 중복 사진은 0 */
export function mealPoints(earnedToday: number, duplicate = false): number {
  if (duplicate) return 0;
  return Math.max(0, Math.min(MEAL_POINTS, MEAL_DAILY_CAP - earnedToday));
}
