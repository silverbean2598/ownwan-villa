import { describe, expect, it } from "vitest";
import { kstDay, nextDay, prevDay } from "./day";
import { photoPoints, routinePoints } from "./points";
import { settleDay } from "./floor";
import { pickPenthouse } from "./penthouse";

describe("day", () => {
  it("KST 하루 기준", () => {
    expect(kstDay(Date.UTC(2026, 10, 18, 14, 59, 50))).toBe("2026-11-18");
    expect(kstDay(Date.UTC(2026, 10, 18, 15, 0, 5))).toBe("2026-11-19");
    expect(prevDay("2026-03-01")).toBe("2026-02-28");
    expect(nextDay("2026-02-28")).toBe("2026-03-01");
    expect(nextDay("2026-12-31")).toBe("2027-01-01");
  });
});

describe("points", () => {
  it("사진/루틴 포인트", () => {
    expect([1, 2, 3, 4, 9].map(photoPoints)).toEqual([20, 10, 5, 0, 0]);
    expect(routinePoints(false)).toBe(10);
    expect(routinePoints(true)).toBe(0);
  });
});

describe("settleDay", () => {
  it("7일째 인증 → +1층", () => {
    expect(settleDay({ streak: 6, missRun: 0, floor: 1 }, true)).toEqual({
      next: { streak: 7, missRun: 0, floor: 2 },
      floorChanged: "up",
    });
  });
  it("연속 끊김 → 즉시 -1층", () => {
    expect(settleDay({ streak: 10, missRun: 0, floor: 3 }, false)).toEqual({
      next: { streak: 0, missRun: 1, floor: 2 },
      floorChanged: "down",
    });
  });
  it("계속 쉼: missRun 2~7은 유지, 8에서 -1", () => {
    expect(settleDay({ streak: 0, missRun: 6, floor: 2 }, false).next.floor).toBe(2);
    expect(settleDay({ streak: 0, missRun: 7, floor: 2 }, false)).toEqual({
      next: { streak: 0, missRun: 8, floor: 1 },
      floorChanged: "down",
    });
  });
  it("최저 1층", () => {
    const r = settleDay({ streak: 3, missRun: 0, floor: 1 }, false);
    expect(r.next.floor).toBe(1);
    expect(r.floorChanged).toBeNull();
  });
  it("아파트 없음: 층 없이 연속 기록만", () => {
    expect(settleDay({ streak: 6, missRun: 0, floor: null }, true)).toEqual({
      next: { streak: 7, missRun: 0, floor: null },
      floorChanged: null,
    });
    expect(settleDay({ streak: 6, missRun: 0, floor: null }, false).floorChanged).toBeNull();
  });
  it("이사 후 연속 기록 20 → 21일째(7의 배수) 도달 시 +1", () => {
    expect(settleDay({ streak: 20, missRun: 0, floor: 1 }, true).next.floor).toBe(2);
  });
});

describe("pickPenthouse", () => {
  it("빈 목록", () => expect(pickPenthouse([])).toBeNull());
  it("같은 층·연속이면 먼저 도달한 사람", () => {
    expect(
      pickPenthouse([
        { userId: "a", floor: 5, streak: 30, floorReachedAt: 2 },
        { userId: "b", floor: 5, streak: 30, floorReachedAt: 1 },
      ]),
    ).toBe("b");
  });
  it("같은 층이면 연속 기록이 긴 사람", () => {
    expect(
      pickPenthouse([
        { userId: "a", floor: 5, streak: 9, floorReachedAt: 1 },
        { userId: "b", floor: 5, streak: 30, floorReachedAt: 9 },
      ]),
    ).toBe("b");
  });
  it("층이 높은 사람 우선", () => {
    expect(
      pickPenthouse([
        { userId: "a", floor: 6, streak: 1, floorReachedAt: 9 },
        { userId: "b", floor: 5, streak: 99, floorReachedAt: 1 },
      ]),
    ).toBe("a");
  });
});
