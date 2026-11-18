import { describe, expect, it } from "vitest";
import { displayStreak } from "./streak";

describe("displayStreak", () => {
  it("오늘 인증하면 정산된 값에 1일을 더한다", () => {
    expect(displayStreak(4, true)).toBe(5);
    expect(displayStreak(0, true)).toBe(1);
  });
  it("오늘 인증 전이면 정산된 값 그대로", () => {
    expect(displayStreak(4, false)).toBe(4);
    expect(displayStreak(0, false)).toBe(0);
  });
});
