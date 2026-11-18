/** 화면에 보이는 연속 기록: 정산된 값 + 오늘 인증했다면 1일 */
export function displayStreak(streak: number, certifiedToday: boolean): number {
  return streak + (certifiedToday ? 1 : 0);
}

/** 화면·순위에 쓰는 층: 오늘 인증으로 7일째가 채워지면 바로 한 층 위. 저장된 층은 자정 정산 때만 바뀐다 (streak은 정산된 값) */
export function displayFloor(floor: number, streak: number, certifiedToday: boolean): number {
  return certifiedToday && (streak + 1) % 7 === 0 ? floor + 1 : floor;
}
