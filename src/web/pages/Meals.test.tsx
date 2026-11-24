// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../image/compress", () => ({
  compressImage: async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }),
  ImageDecodeError: class extends Error {},
}));
vi.mock("../image/dhash", () => ({ dhashFromBlob: async () => "0123456789abcdef" }));

import { Meals, dayLabel } from "./Meals";
import { MealNew, pointsSubtitle, uploadNote } from "./MealNew";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type V = { id: string; name: string };
let root: Root;
let host: HTMLDivElement;
let calls: { path: string; method: string; body?: Record<string, unknown> }[];

function mockApi(villas: V[], meals: unknown[] = [], pointsLeftToday = 10) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const body = init?.body instanceof FormData ? Object.fromEntries(init.body.entries()) : undefined;
      calls.push({ path, method, body });
      const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
      if (path === "/api/me/villas") return ok(villas.map((x) => ({ ownerId: "o", public: false, memberCount: 2, joinedAt: 0, certifiedToday: false, ...x })));
      if (path.startsWith("/api/meals?")) return ok({ day: "", today: "", pointsLeftToday, meals });
      if (path === "/api/meals") return ok({ mealId: "m1", points: 5, duplicate: false, villaIds: ["A"] });
      if (path.endsWith("/report")) return ok({ hidden: true });
      if (method === "DELETE") return ok({ ok: true, refunded: 0 });
      return ok({ ok: true });
    }),
  );
}
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
async function mount(el: React.ReactNode, path: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter initialEntries={[path]}>{el}</MemoryRouter>));
  await flush();
  await flush();
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("Meals", () => {
  const sections = () => Array.from(host.querySelectorAll<HTMLElement>(".meal-sec"));

  it("empty_day_shows_every_meal_section_with_placeholder_and_fab", async () => {
    mockApi([{ id: "A", name: "에이아파트" }]);
    await mount(<Meals />, "/meals");
    expect(host.querySelector(".meals-sub")!.textContent).toBe("입주민들이 오늘 먹은 식단이에요");
    expect(host.querySelector(".meals-date strong")!.textContent).toMatch(/^\d+월 \d+일 \(.\) 오늘$/);
    expect(sections().map((s) => s.querySelector("h2")!.textContent!.replace(/\s+/g, " ").trim())).toEqual([
      "🌅 아침 0", "☀️ 점심 0", "🍪 간식 0", "🌙 저녁 0", "🌃 야식 0",
    ]);
    expect(sections().every((s) => s.querySelector(".meal-sec-empty")?.textContent === "아직 없어요")).toBe(true);
    expect(host.querySelector<HTMLAnchorElement>(".meals-fab")!.textContent).toBe("＋ 식단 올리기");
    expect(host.querySelector<HTMLAnchorElement>(".meals-fab")!.getAttribute("href")).toBe("/meals/new?villa=A");
    // 아파트 1곳이면 고르기를 숨기고, 끼니 칩은 없다
    expect(host.querySelector("select")).toBeNull();
    expect(host.querySelector(".meal-chip")).toBeNull();
    // 미래로는 못 간다
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="다음 날"]')!.disabled).toBe(true);
    expect(calls.some((c) => c.path.startsWith("/api/meals?villa=A&day="))).toBe(true);
  });

  it("past_day_copy_and_seven_day_limit", async () => {
    mockApi([{ id: "A", name: "에이아파트" }, { id: "B", name: "비아파트" }]);
    await mount(<Meals />, "/meals");
    expect(host.querySelector("select")).not.toBeNull();
    const prev = () => host.querySelector<HTMLButtonElement>('button[aria-label="전날"]')!;
    await act(async () => prev().click());
    await flush();
    expect(host.querySelector(".meals-sub")!.textContent).toBe("입주민들이 이날 먹은 식단이에요");
    expect(host.querySelector(".meals-date strong")!.textContent).not.toContain("오늘");
    for (let i = 0; i < 5; i++) {
      await act(async () => prev().click());
      await flush();
    }
    expect(prev().disabled).toBe(true);
  });

  it("groups_by_meal_and_detail_sheet_has_controls_for_my_meal_only", async () => {
    const base = { photoUrl: "/p", createdAt: Date.parse("2026-11-24T12:40:00+09:00"), edited: false, cheerCount: 0, cheeredByMe: false, commentCount: 0, memo: null };
    mockApi([{ id: "A", name: "에이아파트" }], [
      { ...base, id: "m1", userId: "me", nickname: "나", mealType: "lunch", mine: true, memo: "샐러드", cheerCount: 3, commentCount: 2 },
      { ...base, id: "m2", userId: "x", nickname: "이웃", mealType: "dinner", mine: false, cheeredByMe: true, cheerCount: 1 },
    ]);
    await mount(<Meals />, "/meals");
    const lunch = sections()[1];
    expect(lunch.querySelector("small")!.textContent).toBe("1");
    expect(lunch.querySelector(".meal-mini-memo")!.textContent).toBe("샐러드");
    expect(lunch.querySelector(".meal-mini-who")!.textContent).toBe("나 12:40♡ 3 · 💬 2");
    expect(sections()[3].querySelector(".heart.on")!.textContent).toBe("♥");
    expect(sections()[0].querySelector(".meal-sec-empty")).not.toBeNull();
    // 작은 카드에는 수정 · 삭제가 없고, 눌러서 크게 보면 내 식단에만 있다
    expect(host.querySelector('[aria-label="식단 수정"]')).toBeNull();
    await act(async () => lunch.querySelector<HTMLButtonElement>(".meal-mini")!.click());
    expect(host.querySelector(".meal-sheet")).not.toBeNull();
    expect(host.querySelector('.meal-sheet [aria-label="식단 수정"]')!.getAttribute("href")).toBe("/meals/m1/edit");
    expect(host.querySelector('.meal-sheet [aria-label="식단 삭제"]')).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('.meal-sheet [aria-label="닫기"]')!.click());
    expect(host.querySelector(".meal-sheet")).toBeNull();
    await act(async () => sections()[3].querySelector<HTMLButtonElement>(".meal-mini")!.click());
    expect(host.querySelector('.meal-sheet [aria-label="식단 수정"]')).toBeNull();
    expect(host.querySelector(".meal-sheet .cheer-bar")).not.toBeNull();
  });

  it("report_from_sheet_then_hidden_card", async () => {
    const base = { photoUrl: "/p", createdAt: Date.now(), edited: false, cheerCount: 2, cheeredByMe: false, commentCount: 1, memo: "라면" };
    mockApi([{ id: "A", name: "에이아파트" }], [
      { ...base, id: "m2", userId: "x", nickname: "이웃", mealType: "late", mine: false },
      { ...base, id: "m3", userId: "me", nickname: "나", mealType: "snack", mine: true, hidden: true, photoUrl: undefined, memo: null, cheerCount: 0, commentCount: 0 },
    ]);
    await mount(<Meals />, "/meals");
    // 가려진 식단: 작은 카드에 "가려진 사진", 메모 · 수 없음. 내 것이면 크게 보기에서 삭제만
    const snack = sections()[2];
    expect(snack.querySelector(".meal-mini-hidden")!.textContent).toBe("가려진 사진");
    expect(snack.querySelector("img")).toBeNull();
    expect(snack.querySelector(".meal-mini-who")!.textContent).not.toContain("💬");
    await act(async () => snack.querySelector<HTMLButtonElement>(".meal-mini")!.click());
    expect(host.querySelector(".meal-sheet-hidden")!.textContent).toBe("가려진 사진");
    expect(host.querySelector('.meal-sheet [aria-label="식단 수정"]')).toBeNull();
    expect(host.querySelector('.meal-sheet [aria-label="식단 삭제"]')).not.toBeNull();
    expect(host.querySelector('.meal-sheet [aria-label="식단 신고"]')).toBeNull();
    expect(host.querySelector(".meal-sheet .cheer-bar")).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('.meal-sheet [aria-label="닫기"]')!.click());
    // 남의 식단: 신고하기 → 확인 → 신고했어요, 3명째라 가려진다
    await act(async () => sections()[4].querySelector<HTMLButtonElement>(".meal-mini")!.click());
    await act(async () => host.querySelector<HTMLButtonElement>('.meal-sheet [aria-label="식단 신고"]')!.click());
    expect(host.querySelector('[aria-label="신고하기"] p')!.textContent).toBe("이 사진을 신고할까요? 3명이 신고하면 사진이 가려져요.");
    const confirm = Array.from(host.querySelectorAll<HTMLButtonElement>('[aria-label="신고하기"] button')).find((b) => b.textContent === "신고하기")!;
    await act(async () => confirm.click());
    await flush();
    expect(calls.some((c) => c.path === "/api/meals/m2/report" && c.method === "POST")).toBe(true);
    expect(host.querySelector(".action-toast")!.textContent).toBe("신고했어요");
    expect(host.querySelector(".meal-sheet-hidden")).not.toBeNull();
    expect(host.querySelector('.meal-sheet [aria-label="식단 신고"]')).toBeNull();
    expect(sections()[4].querySelector(".meal-mini-hidden")).not.toBeNull();
  });

  it("villa_owner_sees_delete_on_others_meals_including_hidden", async () => {
    const base = { photoUrl: "/p", createdAt: Date.now(), edited: false, cheerCount: 0, cheeredByMe: false, commentCount: 0, memo: null, mine: false, canDelete: true };
    mockApi([{ id: "A", name: "에이아파트" }], [
      { ...base, id: "m2", userId: "x", nickname: "이웃", mealType: "lunch" },
      { ...base, id: "m3", userId: "y", nickname: "옆집", mealType: "dinner", hidden: true, photoUrl: undefined },
    ]);
    await mount(<Meals />, "/meals");
    await act(async () => sections()[3].querySelector<HTMLButtonElement>(".meal-mini")!.click());
    // 가려진 식단: 신고는 없고 삭제만
    expect(host.querySelector('.meal-sheet [aria-label="식단 신고"]')).toBeNull();
    expect(host.querySelector('.meal-sheet [aria-label="식단 수정"]')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('.meal-sheet [aria-label="식단 삭제"]')!.click());
    expect(host.querySelector('.confirm-overlay[aria-label="식단 삭제"] p')!.textContent).toBe("이 사진을 지울까요? 지운 사진은 되돌릴 수 없어요.");
    const ok = Array.from(host.querySelectorAll<HTMLButtonElement>('.confirm-overlay[aria-label="식단 삭제"] button')).find((b) => b.textContent === "삭제하기")!;
    await act(async () => ok.click());
    await flush();
    expect(calls.some((c) => c.path === "/api/meals/m3" && c.method === "DELETE")).toBe(true);
    expect(host.querySelector(".action-toast")!.textContent).toBe("지웠어요");
    expect(sections()[3].querySelector(".meal-sec-empty")).not.toBeNull();
    // 보이는 남의 식단에는 신고와 삭제가 함께
    await act(async () => sections()[1].querySelector<HTMLButtonElement>(".meal-mini")!.click());
    expect(host.querySelector('.meal-sheet [aria-label="식단 신고"]')).not.toBeNull();
    expect(host.querySelector('.meal-sheet [aria-label="식단 삭제"]')).not.toBeNull();
  });

  it("no_report_button_on_my_meal", async () => {
    mockApi([{ id: "A", name: "에이아파트" }], [
      { photoUrl: "/p", createdAt: Date.now(), edited: false, cheerCount: 0, cheeredByMe: false, commentCount: 0, memo: null, id: "m1", userId: "me", nickname: "나", mealType: "lunch", mine: true },
    ]);
    await mount(<Meals />, "/meals");
    await act(async () => sections()[1].querySelector<HTMLButtonElement>(".meal-mini")!.click());
    expect(host.querySelector('.meal-sheet [aria-label="식단 신고"]')).toBeNull();
  });

  it("day_label", () => {
    expect(dayLabel("2026-11-24")).toBe("11월 24일 (화)");
  });
});

describe("MealNew", () => {
  it("upload_disabled_until_photo_then_posts_to_picked_villas", async () => {
    mockApi([{ id: "A", name: "에이아파트" }, { id: "B", name: "비아파트" }]);
    await mount(<MealNew />, "/meals/new");
    const submit = () => host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(submit().textContent).toBe("올리기");
    expect(submit().disabled).toBe(true);
    expect(host.querySelector(".meal-submit-note")!.textContent).toBe("사진을 고르면 올릴 수 있어요");
    expect(host.querySelector(".meals-sub")!.textContent).toBe("하루 3개까지 5P씩 받아요 (오늘 남은 포인트 10P)");
    // 기본: 아파트 모두 체크, 끼니 하나 골라져 있음
    const boxes = Array.from(host.querySelectorAll<HTMLInputElement>('.meal-villas input[type="checkbox"]'));
    expect(boxes.map((b) => b.checked)).toEqual([true, true]);
    expect(host.querySelectorAll('.meal-chip[aria-checked="true"]')).toHaveLength(1);
    await act(async () => boxes[1].click());
    const input = host.querySelector<HTMLInputElement>("#meal-photo")!;
    const file = new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await flush();
    expect(submit().disabled).toBe(false);
    expect(host.querySelector(".meal-submit-note")).toBeNull();
    const lunch = Array.from(host.querySelectorAll<HTMLButtonElement>(".meal-chip")).find((b) => b.textContent === "점심")!;
    await act(async () => lunch.click());
    await act(async () => submit().click());
    await flush();
    const sent = calls.find((c) => c.path === "/api/meals" && c.method === "POST")!;
    expect(sent.body).toMatchObject({ mealType: "lunch", villaIds: JSON.stringify(["A"]), dhash: "0123456789abcdef" });
  });

  it("villa_picks_hidden_with_one_villa", async () => {
    mockApi([{ id: "A", name: "에이아파트" }]);
    await mount(<MealNew />, "/meals/new");
    expect(host.querySelector(".meal-villas")).toBeNull();
  });

  it("memo_counter_updates", async () => {
    mockApi([{ id: "A", name: "에이아파트" }]);
    await mount(<MealNew />, "/meals/new");
    const input = host.querySelector<HTMLInputElement>("#meal-memo")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, "샐러드");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host.querySelector(".meal-memo-count")!.textContent).toBe("3/40");
  });

  it("points_subtitle", () => {
    expect(pointsSubtitle(10)).toBe("하루 3개까지 5P씩 받아요 (오늘 남은 포인트 10P)");
    expect(pointsSubtitle(0)).toBe("하루 3개까지 5P씩 받아요 (오늘 포인트는 다 받았어요)");
    expect(pointsSubtitle(null)).toBe("하루 3개까지 5P씩 받아요");
  });

  it("upload_note_copy", () => {
    expect(uploadNote({ points: 5, duplicate: false })).toBe("올렸어요 +5P");
    expect(uploadNote({ points: 0, duplicate: false })).toContain("다 받았어요");
    expect(uploadNote({ points: 0, duplicate: true })).toContain("포인트는 없어요");
  });
});
