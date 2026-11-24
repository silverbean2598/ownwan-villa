/** 식당(식단 공유) 공용 값 */

export const MEAL_TYPES = ["breakfast", "lunch", "snack", "dinner", "late"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: "아침",
  lunch: "점심",
  snack: "간식",
  dinner: "저녁",
  late: "야식",
};

export const isMealType = (v: unknown): v is MealType => typeof v === "string" && (MEAL_TYPES as readonly string[]).includes(v);

/** 메모 최대 글자 수 */
export const MEAL_MEMO_MAX = 40;

/** 식당에서 볼 수 있는 날 수 (오늘 포함) */
export const MEAL_DAYS = 7;

/** KST 시(0~23)로 고른 기본 끼니: 05–10 아침, 10–15 점심, 15–17 간식, 17–21 저녁, 21–05 야식 */
export function mealTypeForHour(hour: number): MealType {
  if (hour >= 5 && hour < 10) return "breakfast";
  if (hour >= 10 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 17) return "snack";
  if (hour >= 17 && hour < 21) return "dinner";
  return "late";
}

/** 지금(ms) 한국 시간으로 고른 기본 끼니 */
export const defaultMealType = (ms: number): MealType => mealTypeForHour(new Date(ms + 9 * 3600_000).getUTCHours());
