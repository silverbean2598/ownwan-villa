import { describe, expect, it } from "vitest";
import { eventCopy, objParticle, planEvents, shouldNightRemind, type AppEvent } from "./plan";

const ev = (id: string, type: string, payload: Record<string, unknown> = {}): AppEvent => ({ id, type, payload, createdAt: 0 });

describe("objParticle (을/를)", () => {
  it("picks_by_final_consonant", () => {
    expect(objParticle("화분")).toBe("을");
    expect(objParticle("러그")).toBe("를");
    expect(objParticle("벤치")).toBe("를");
    expect(objParticle("덤벨 랙")).toBe("을");
    expect(objParticle("스탠드 조명")).toBe("을");
    expect(objParticle("격파 송판 액자")).toBe("를");
  });
  it("skips_trailing_quotes_and_brackets", () => {
    expect(objParticle('"오운완" 문구 액자')).toBe("를");
    expect(objParticle('문구 "오운완"')).toBe("을");
    expect(objParticle("짐볼(대)")).toBe("을");
    expect(objParticle("러그(소)")).toBe("를");
  });
  it("reads_digits_and_falls_back_for_latin", () => {
    expect(objParticle("덤벨 3")).toBe("을");
    expect(objParticle("덤벨 2")).toBe("를");
    expect(objParticle("TRX")).toBe("을(를)");
    expect(objParticle("")).toBe("을(를)");
  });
});

describe("eventCopy", () => {
  it("cards", () => {
    expect(eventCopy(ev("1", "streak7", { streak: 14 }))).toBe("14일 연속 오운완! 대단해요");
    expect(eventCopy(ev("1", "floor_up", { floor: 3, streak: 7 }))).toBe("7일 연속! 3층으로 올라왔어요");
    expect(eventCopy(ev("1", "floor_up", { floor: 3 }))).toBe("3층으로 올라왔어요");
    expect(eventCopy(ev("1", "penthouse_in"))).toBe("펜트하우스에 입주했어요");
    expect(eventCopy(ev("1", "penthouse_out", { nickname: "비비" }))).toBe("비비 님이 펜트하우스를 차지했어요");
    expect(eventCopy(ev("1", "floor_down", { floor: 2 }))).toBe("어제 쉬어서 2층으로 내려왔어요");
    expect(eventCopy(ev("1", "welcome", { villaName: "땀빌라" }))).toBe("땀빌라에 입주했어요");
  });
  it("toasts", () => {
    expect(eventCopy(ev("1", "certified", { points: 20 }))).toBe("불이 켜졌어요 +20P");
    expect(eventCopy(ev("1", "streak6", { streak: 6 }))).toBe("내일 인증하면 한 층 올라가요");
    expect(eventCopy(ev("1", "bought", { itemName: "화분" }))).toBe("화분을 샀어요");
    expect(eventCopy(ev("1", "bought", { itemName: "러그" }))).toBe("러그를 샀어요");
    expect(eventCopy(ev("1", "friend_joined", { nickname: "씨씨" }))).toBe("씨씨 님이 입주했어요");
    expect(eventCopy(ev("1", "night_reminder"))).toBe("오늘 아직 불이 꺼져 있어요");
  });
});

describe("planEvents", () => {
  it("splits_cards_and_toasts_in_order", () => {
    const p = planEvents([ev("a", "welcome"), ev("b", "certified"), ev("c", "floor_up"), ev("d", "bought")]);
    expect(p.cards.map((e) => e.id)).toEqual(["a", "c"]);
    expect(p.toasts.map((e) => e.id)).toEqual(["b", "d"]);
    expect(p.drop).toEqual([]);
  });
  it("keeps_only_the_latest_penthouse_change", () => {
    const p = planEvents([ev("a", "penthouse_in"), ev("b", "penthouse_out"), ev("c", "penthouse_in")]);
    expect(p.cards.map((e) => e.id)).toEqual(["c"]);
    expect(p.drop.sort()).toEqual(["a", "b"]);
  });
  it("drops_unknown_types", () => {
    const p = planEvents([ev("a", "mystery")]);
    expect(p.cards).toEqual([]);
    expect(p.toasts).toEqual([]);
    expect(p.drop).toEqual(["a"]);
  });
});

describe("shouldNightRemind", () => {
  const at = (iso: string) => Date.parse(iso);
  it("after_21_kst_when_not_certified_once_per_day", () => {
    expect(shouldNightRemind(at("2026-11-18T21:00:00+09:00"), false, null)).toBe(true);
    expect(shouldNightRemind(at("2026-11-18T20:59:59+09:00"), false, null)).toBe(false);
    expect(shouldNightRemind(at("2026-11-18T23:30:00+09:00"), true, null)).toBe(false);
    expect(shouldNightRemind(at("2026-11-18T22:00:00+09:00"), false, "2026-11-18")).toBe(false);
    // 어제 보여 줬어도 오늘은 다시
    expect(shouldNightRemind(at("2026-11-18T22:00:00+09:00"), false, "2026-11-17")).toBe(true);
  });
  it("uses_kst_not_utc", () => {
    // 12:30 UTC = 21:30 KST
    expect(shouldNightRemind(Date.UTC(2026, 10, 18, 12, 30), false, null)).toBe(true);
    // 00:30 KST 다음 날 (15:30 UTC) 은 21시 전
    expect(shouldNightRemind(Date.UTC(2026, 10, 18, 15, 30), false, null)).toBe(false);
  });
});
