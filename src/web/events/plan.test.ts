import { describe, expect, it } from "vitest";
import { eventCopy, objParticle, planEvents, subjParticle, shouldNightRemind, type AppEvent } from "./plan";

const NOW = Date.parse("2026-11-18T12:00:00+09:00");
const ev = (id: string, type: string, payload: Record<string, unknown> = {}, createdAt = NOW - 60_000): AppEvent => ({ id, type, payload, createdAt });

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

describe("subjParticle (이/가)", () => {
  it("picks_by_final_consonant", () => {
    expect(subjParticle("땀빌라")).toBe("가");
    expect(subjParticle("운동집")).toBe("이");
    expect(subjParticle("빌라 3")).toBe("이");
    expect(subjParticle("빌라 2")).toBe("가");
    expect(subjParticle("Gym")).toBe("이(가)");
  });
});

describe("방장 관리 알림", () => {
  it("copy", () => {
    expect(eventCopy(ev("1", "kicked", { villaName: "땀빌라" }))).toBe("땀빌라에서 나가게 됐어요");
    expect(eventCopy(ev("1", "owner_in"))).toBe("방장이 됐어요");
    expect(eventCopy(ev("1", "owner_changed", { nickname: "비비" }))).toBe("비비 님이 새 방장이 됐어요");
    expect(eventCopy(ev("1", "dissolved", { villaName: "땀빌라" }))).toBe("땀빌라가 해체됐어요");
    expect(eventCopy(ev("1", "dissolved", { villaName: "운동집" }))).toBe("운동집이 해체됐어요");
    expect(eventCopy(ev("1", "dissolved", { villaName: "Gym" }))).toBe("Gym이(가) 해체됐어요");
  });
  it("cards_and_toasts", () => {
    const p = planEvents([ev("a", "kicked"), ev("b", "owner_in"), ev("c", "owner_changed"), ev("d", "dissolved")], NOW);
    expect(p.cards.map((e) => e.id)).toEqual(["a", "b", "d"]);
    expect(p.toasts.map((e) => e.id)).toEqual(["c"]);
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
    // 옷 · 소품도 같은 문구
    expect(eventCopy(ev("1", "bought", { itemName: "후드티" }))).toBe("후드티를 샀어요");
    expect(eventCopy(ev("1", "bought", { itemName: "목 이어폰" }))).toBe("목 이어폰을 샀어요");
    expect(eventCopy(ev("1", "bought", { itemName: "민소매 · 조거" }))).toBe("민소매 · 조거를 샀어요");
    expect(eventCopy(ev("1", "bought", { itemName: "모자" }))).toBe("모자를 샀어요");
    expect(eventCopy(ev("1", "friend_joined", { nickname: "씨씨" }))).toBe("씨씨 님이 입주했어요");
    expect(eventCopy(ev("1", "night_reminder"))).toBe("오늘 아직 불이 꺼져 있어요");
  });
});

describe("planEvents", () => {
  it("drops_events_older_than_48_hours_without_showing_them", () => {
    const H = 3600_000;
    const p = planEvents(
      [ev("old", "floor_down", { floor: 2 }, NOW - 49 * H), ev("oldToast", "certified", {}, NOW - 7 * 24 * H), ev("edge", "welcome", {}, NOW - 48 * H), ev("new", "bought")],
      NOW,
    );
    expect(p.cards.map((e) => e.id)).toEqual(["edge"]);
    expect(p.toasts.map((e) => e.id)).toEqual(["new"]);
    expect(p.drop.sort()).toEqual(["old", "oldToast"]);
  });

  it("splits_cards_and_toasts_in_order", () => {
    const p = planEvents([ev("a", "welcome"), ev("b", "certified"), ev("c", "floor_up"), ev("d", "bought")], NOW);
    expect(p.cards.map((e) => e.id)).toEqual(["a", "c"]);
    expect(p.toasts.map((e) => e.id)).toEqual(["b", "d"]);
    expect(p.drop).toEqual([]);
  });
  it("keeps_only_the_latest_penthouse_change", () => {
    const p = planEvents([ev("a", "penthouse_in"), ev("b", "penthouse_out"), ev("c", "penthouse_in")], NOW);
    expect(p.cards.map((e) => e.id)).toEqual(["c"]);
    expect(p.drop.sort()).toEqual(["a", "b"]);
  });
  it("drops_unknown_types", () => {
    const p = planEvents([ev("a", "mystery")], NOW);
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

describe("응원 · 댓글 알림", () => {
  it("cheered_copy", () => {
    expect(eventCopy(ev("1", "cheered", { nickname: "비비" }))).toBe("비비 님이 응원했어요");
    expect(eventCopy(ev("1", "cheered"))).toBe("이웃 님이 응원했어요");
  });
  it("commented_copy_truncates_after_20_chars", () => {
    expect(eventCopy(ev("1", "commented", { nickname: "비비", body: "멋져요!" }))).toBe("비비 님: 멋져요!");
    expect(eventCopy(ev("1", "commented", { nickname: "비비", body: "가".repeat(20) }))).toBe(`비비 님: ${"가".repeat(20)}`);
    expect(eventCopy(ev("1", "commented", { nickname: "비비", body: "오늘도 멋진 오운완이에요 최고 최고 최고" }))).toBe(
      "비비 님: 오늘도 멋진 오운완이에요 최고 최고…",
    );
    // 이모지를 반으로 자르지 않는다
    expect(eventCopy(ev("1", "commented", { nickname: "비비", body: "💪".repeat(25) }))).toBe(`비비 님: ${"💪".repeat(20)}…`);
  });
  it("are_toasts", () => {
    const p = planEvents([ev("a", "cheered"), ev("b", "commented")], NOW);
    expect(p.toasts.map((e) => e.id)).toEqual(["a", "b"]);
  });
});
