import { describe, expect, it } from "vitest";
import { furnitureSections, shopSections } from "./Shop";

describe("shopSections", () => {
  it("my_sport_and_common_first_then_other_sports", () => {
    const secs = shopSections("climbing");
    expect(secs[0].title).toBe("클라이밍 · 공용");
    expect(new Set(secs[0].items.map((i) => i.sport))).toEqual(new Set(["climbing", "common"]));
    expect(secs.slice(1).map((s) => s.title)).toEqual(["헬스", "필라테스", "요가", "홈트", "러닝", "주짓수", "태권도"]);
    expect(secs.flatMap((s) => s.items)).toHaveLength(31);
  });
  it("no_sport_shows_common_first", () => {
    const secs = shopSections(null);
    expect(secs[0].title).toBe("공용");
    expect(secs).toHaveLength(9);
  });
});

describe("furnitureSections", () => {
  it("mine_first_then_new_categories_then_other_sports_then_penthouse", () => {
    const secs = furnitureSections("gym");
    expect(secs.map((s) => s.title)).toEqual([
      "헬스 · 공용", "운동 기구", "휴식 가구", "계절·특별", "필라테스", "요가", "홈트", "러닝", "클라이밍", "주짓수", "태권도", "펜트하우스 전용",
    ]);
    expect(secs.flatMap((s) => s.items)).toHaveLength(55);
    expect(secs.at(-1)).toMatchObject({ penthouseOnly: true });
    expect(secs.at(-1)!.items.map((i) => i.id)).toEqual(["gold-statue"]);
  });
});
