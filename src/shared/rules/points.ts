const PHOTO_POINTS = [20, 10, 5];

/** nth: 그날 중복이 아닌 사진의 순번 (1부터) */
export function photoPoints(nth: number): number {
  return PHOTO_POINTS[nth - 1] ?? 0;
}

export function routinePoints(alreadyToday: boolean): number {
  return alreadyToday ? 0 : 10;
}
