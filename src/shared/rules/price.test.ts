import { describe, expect, it } from "vitest";
import {
  battleDays, battleWinner, formatChange, formatDelta, formatPrice, isSunday, leaguePoints, rankLeague, villaPrice, weekOf, windowStart,
} from "./price";

const m = (certDays: number, floor = 1) => ({ certDays, floor });

describe("villaPrice", () => {
  it("no_members_no_price", () => {
    expect(villaPrice([])).toBeNull();
  });

  it("base_plus_member_plus_days_plus_floors", () => {
    // 1억 + 0.1억 × 1명 + 0.1억 × 3일 + 0.1억 × (3층 - 1)
    expect(villaPrice([m(3, 3)])).toBe(10 + 1 + 3 + 2);
  });

  it("nine_person_villa_lands_between_2_and_6", () => {
    const quiet = villaPrice(Array.from({ length: 9 }, () => m(1)))!;
    const busy = villaPrice(Array.from({ length: 9 }, (_, i) => m(4, i < 3 ? 2 : 1)))!;
    expect(quiet).toBeGreaterThanOrEqual(20);
    expect(busy).toBeLessThanOrEqual(60);
    expect(formatPrice(busy)).toBe("5.8억");
  });

  it("full_active_villa_lands_between_15_and_25", () => {
    const solid = villaPrice(Array.from({ length: 20 }, () => m(5, 2)))!;
    const top = villaPrice(Array.from({ length: 20 }, () => m(7, 4)))!;
    expect(solid).toBeGreaterThanOrEqual(150);
    expect(top).toBeLessThanOrEqual(250);
  });

  it("clamps_bad_inputs", () => {
    expect(villaPrice([m(12, 0)])).toBe(10 + 1 + 7);
    expect(villaPrice([m(-3, 1)])).toBe(11);
  });

  it("more_activity_never_lowers_price", () => {
    expect(villaPrice([m(2), m(3)])!).toBeLessThan(villaPrice([m(3), m(3)])!);
    expect(villaPrice([m(2, 1)])!).toBeLessThan(villaPrice([m(2, 2)])!);
  });
});

describe("format", () => {
  it("price_one_decimal", () => {
    expect(formatPrice(32)).toBe("3.2억");
    expect(formatPrice(30)).toBe("3.0억");
    expect(formatPrice(230)).toBe("23.0억");
  });
  it("change", () => {
    expect(formatChange(3)).toBe("▲0.3억");
    expect(formatChange(-12)).toBe("▼1.2억");
    expect(formatChange(0)).toBe("변동 없음");
    expect(formatChange(null)).toBeNull();
  });
  it("delta", () => {
    expect(formatDelta(4)).toBe("+0.4억");
    expect(formatDelta(-1)).toBe("−0.1억");
    expect(formatDelta(0)).toBe("0.0억");
  });
});

describe("days", () => {
  it("window_is_seven_days_including_today", () => {
    expect(windowStart("2026-11-22")).toBe("2026-11-16");
    expect(windowStart("2026-03-02")).toBe("2026-02-24");
  });
  it("week_starts_monday", () => {
    expect(isSunday("2026-11-22")).toBe(true);
    expect(isSunday("2026-11-23")).toBe(false);
    expect(weekOf("2026-11-22")).toBe("2026-11-16");
    expect(weekOf("2026-11-16")).toBe("2026-11-16");
    expect(weekOf("2026-11-20")).toBe("2026-11-16");
  });
  it("battle_runs_seven_full_days_from_tomorrow", () => {
    expect(battleDays("2026-11-20")).toEqual({ start: "2026-11-21", end: "2026-11-27" });
    expect(battleDays("2026-12-28")).toEqual({ start: "2026-12-29", end: "2027-01-04" });
  });
});

describe("league", () => {
  const e = (villaId: string, price: number, certDays = 1, memberCount = 3, createdAt = 0) => ({ villaId, price, certDays, memberCount, createdAt });
  it("ranks_by_price_then_tiebreaks", () => {
    const r = rankLeague([e("a", 30), e("b", 50), e("c", 30, 5), e("d", 30, 5, 4), e("x", 99, 0), e("y", 99, 7, 2)]);
    expect(r.map((x) => [x.villaId, x.rank])).toEqual([["b", 1], ["d", 2], ["c", 3], ["a", 4]]);
  });
  it("points_top3", () => {
    expect([1, 2, 3, 4].map(leaguePoints)).toEqual([100, 60, 30, 0]);
  });
});

describe("battleWinner", () => {
  it("bigger_increase_wins_or_draw", () => {
    expect(battleWinner({ base: 30, end: 36 }, { base: 100, end: 104 })).toBe("a");
    expect(battleWinner({ base: 30, end: 29 }, { base: 100, end: 100 })).toBe("b");
    expect(battleWinner({ base: 30, end: 33 }, { base: 10, end: 13 })).toBe("draw");
  });
});
