const KST_OFFSET_MS = 9 * 3600_000;
const DAY_MS = 24 * 3600_000;

function fmt(utcMs: number): string {
  return new Date(utcMs).toISOString().slice(0, 10);
}

/** 한국 시간(KST) 기준 날짜 "YYYY-MM-DD" */
export function kstDay(ms: number): string {
  return fmt(ms + KST_OFFSET_MS);
}

export function prevDay(day: string): string {
  return fmt(Date.parse(`${day}T00:00:00Z`) - DAY_MS);
}
