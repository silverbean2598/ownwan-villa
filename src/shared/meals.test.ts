import { describe, expect, it } from "vitest";
import { defaultMealType, isMealType, MEAL_LABEL, mealTypeForHour } from "./meals";
import { MEAL_DAILY_CAP, MEAL_POINTS, mealPoints } from "./rules/points";

describe("mealTypeForHour", () => {
  it("maps_kst_hours_to_meals", () => {
    const byHour = Array.from({ length: 24 }, (_, h) => MEAL_LABEL[mealTypeForHour(h)]);
    expect(byHour).toEqual([
      "야식", "야식", "야식", "야식", "야식", // 0~4
      "아침", "아침", "아침", "아침", "아침", // 5~9
      "점심", "점심", "점심", "점심", "점심", // 10~14
      "간식", "간식", // 15~16
      "저녁", "저녁", "저녁", "저녁", // 17~20
      "야식", "야식", "야식", // 21~23
    ]);
  });

  it("uses_kst_not_utc", () => {
    // 2026-11-24 00:30 UTC = 09:30 KST → 아침, 01:00 UTC = 10:00 KST → 점심
    expect(defaultMealType(Date.UTC(2026, 10, 24, 0, 30))).toBe("breakfast");
    expect(defaultMealType(Date.UTC(2026, 10, 24, 1, 0))).toBe("lunch");
    // 12:00 UTC = 21:00 KST → 야식
    expect(defaultMealType(Date.UTC(2026, 10, 24, 12, 0))).toBe("late");
  });

  it("validates_types", () => {
    expect(isMealType("lunch")).toBe(true);
    expect(isMealType("brunch")).toBe(false);
    expect(isMealType(3)).toBe(false);
  });
});

describe("mealPoints", () => {
  it("five_points_until_daily_cap", () => {
    expect(MEAL_POINTS).toBe(5);
    expect(MEAL_DAILY_CAP).toBe(15);
    expect([0, 5, 10, 15, 20].map((e) => mealPoints(e))).toEqual([5, 5, 5, 0, 0]);
    // 되돌려 받다 남은 포인트가 끝수일 때도 상한을 넘지 않는다
    expect(mealPoints(12)).toBe(3);
  });

  it("duplicate_photo_earns_zero", () => {
    expect(mealPoints(0, true)).toBe(0);
  });
});
