import { describe, expect, it } from "vitest";
import { shopSections } from "./Shop";

describe("shopSections", () => {
  it("my_sport_and_common_first_then_other_sports", () => {
    const secs = shopSections("climbing");
    expect(secs[0].title).toBe("클라이밍 · 공용");
    expect(new Set(secs[0].items.map((i) => i.sport))).toEqual(new Set(["climbing", "common"]));
    expect(secs.slice(1).map((s) => s.title)).toEqual(["헬스", "필라테스", "러닝", "주짓수", "태권도"]);
    expect(secs.flatMap((s) => s.items)).toHaveLength(25);
  });
  it("no_sport_shows_common_first", () => {
    const secs = shopSections(null);
    expect(secs[0].title).toBe("공용");
    expect(secs).toHaveLength(7);
  });
});
