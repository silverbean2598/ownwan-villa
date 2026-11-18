import { describe, expect, it } from "vitest";
import { displayFloor, displayStreak } from "./streak";

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

describe("displayFloor", () => {
  it("7일째 인증이면 바로 한 층 위", () => {
    expect(displayFloor(2, 6, true)).toBe(3);
    expect(displayFloor(2, 13, true)).toBe(3);
  });
  it("인증 전이거나 7일째가 아니면 그대로", () => {
    expect(displayFloor(2, 6, false)).toBe(2);
    expect(displayFloor(2, 0, true)).toBe(2);
    expect(displayFloor(2, 4, true)).toBe(2);
  });
});
