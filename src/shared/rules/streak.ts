/** 화면에 보이는 연속 기록: 정산된 값 + 오늘 인증했다면 1일 */
export function displayStreak(streak: number, certifiedToday: boolean): number {
  return streak + (certifiedToday ? 1 : 0);
}
