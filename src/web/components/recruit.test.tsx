// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecruitSettings } from "./RecruitSettings";
import { RecruitCard } from "./city/RecruitCard";
import { MemberManage } from "./MemberManage";
import { CityMap } from "./city/CityMap";
import { eventCopy, isCard, isToast, cardButton } from "../events/plan";
import type { CityVilla } from "../../shared/city";
import type { MyApplication } from "../../shared/recruit";

// 빈방 모집 · 입주 신청 화면 [확정 — 기획자 결정, 2026-11-19]

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AV = { skin: 0, hair: "short", shirt: 0 };
let root: Root;
let host: HTMLDivElement;
let calls: { path: string; method: string; body?: any }[];

/** routes: "METHOD path" → 응답 (함수면 호출). 없으면 { ok: true } */
function mockApi(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const r = routes[`${method} ${path}`];
      const data = typeof r === "function" ? r() : r ?? { ok: true };
      if (data instanceof Response) return data;
      return new Response(JSON.stringify(data), { status: 200 });
    }),
  );
}
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
async function mount(el: JSX.Element) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter>{el}</MemoryRouter>));
  await flush();
}
const button = (text: string, scope: Element = host) =>
  Array.from(scope.querySelectorAll("button")).find((b) => b.textContent === text) as HTMLButtonElement | undefined;
const click = async (el: Element | undefined | null) => {
  await act(async () => (el as HTMLElement).click());
  await flush();
};
const type = async (el: HTMLInputElement | HTMLTextAreaElement, v: string) =>
  act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const villa = { id: "v1", public: true, members: [{}, {}] };
const post = (p: Record<string, unknown> = {}) => ({ open: false, intro: "", sports: [], updatedAt: null, public: true, memberCount: 2, pendingCount: 0, ...p });
const settings = (isOwner: boolean, v = villa, onPublished = () => {}) => (
  <RecruitSettings villa={v} isOwner={isOwner} title="빈방 모집" onPublished={onPublished} onAuthLost={() => {}} />
);

describe("설정 → 빈방 모집", () => {
  it("private_villa_owner_sees_hint_and_can_publish", async () => {
    const onPublished = vi.fn();
    mockApi({ "GET /api/villas/v1/recruit": post({ public: false }) });
    await mount(settings(true, { ...villa, public: false }, onPublished));
    expect(host.textContent).toContain("지도에 공개하면 모집할 수 있어요");
    expect(host.querySelector('[role="switch"]')).toBeNull();
    await click(button("지도에 공개하기"));
    expect(calls).toContainEqual({ path: "/api/villas/v1/public", method: "PUT", body: { public: true } });
    expect(onPublished).toHaveBeenCalled();
  });

  it("new_entry_opens_form_then_starts_recruiting", async () => {
    mockApi({
      "GET /api/villas/v1/recruit": post(),
      "PUT /api/villas/v1/recruit": { open: true, intro: "아침 러닝 같이 해요", sports: ["gym", "running"], updatedAt: 5 },
    });
    await mount(settings(true));
    const sw = host.querySelector('[role="switch"]') as HTMLButtonElement;
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(host.querySelector("#recruit-intro")).toBeNull();
    await click(sw);
    // 아직 저장 전: 칸만 열린다
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    await type(host.querySelector("#recruit-intro") as HTMLTextAreaElement, "아침 러닝 같이 해요");
    expect(host.textContent).toContain("고르지 않으면 종목 상관없음");
    await click(button("러닝"));
    await click(button("헬스"));
    expect(button("러닝")!.getAttribute("aria-pressed")).toBe("true");
    await click(button("모집 시작하기"));
    expect(calls).toContainEqual({ path: "/api/villas/v1/recruit", method: "PUT", body: { open: true, intro: "아침 러닝 같이 해요", sports: ["gym", "running"] } });
    expect(host.textContent).toContain("모집 중이에요");
    expect(button("저장")).toBeDefined();
  });

  it("intro_over_60_disables_save", async () => {
    mockApi({ "GET /api/villas/v1/recruit": post({ open: true, intro: "기존 글" }) });
    await mount(settings(true));
    expect((host.querySelector("#recruit-intro") as HTMLTextAreaElement).value).toBe("기존 글");
    await type(host.querySelector("#recruit-intro") as HTMLTextAreaElement, "가".repeat(61));
    expect(host.querySelector(".counter.over")?.textContent).toBe("61/60");
    expect(button("저장")!.disabled).toBe(true);
  });

  it("turning_off_with_pending_asks_first", async () => {
    mockApi({
      "GET /api/villas/v1/recruit": post({ open: true, intro: "글", pendingCount: 2 }),
      "PUT /api/villas/v1/recruit": { open: false, intro: "글", sports: [], updatedAt: 6 },
    });
    await mount(settings(true));
    await click(host.querySelector('[role="switch"]'));
    expect(host.querySelector('[role="alertdialog"]')?.textContent).toContain("받은 신청 2개가 취소돼요");
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    await click(button("모집 끄기"));
    expect(calls).toContainEqual({ path: "/api/villas/v1/recruit", method: "PUT", body: { open: false, intro: "글", sports: [] } });
    expect(host.textContent).toContain("모집을 끝냈어요");
  });

  it("member_sees_read_only_post", async () => {
    mockApi({ "GET /api/villas/v1/recruit": post({ open: true, intro: "주말 등산", sports: ["climbing"], pendingCount: undefined }) });
    await mount(settings(false));
    expect(host.querySelector('[role="switch"]')).toBeNull();
    expect(host.querySelector("input")).toBeNull();
    expect(host.textContent).toContain("주말 등산");
    expect(host.textContent).toContain("클라이밍");
    expect(host.textContent).toContain("빈방 18개");
    expect(host.textContent).toContain("모집 글은 방장이 써요");
  });

  it("full_villa_cannot_recruit", async () => {
    mockApi({ "GET /api/villas/v1/recruit": post({ memberCount: 20 }) });
    await mount(settings(true));
    expect(host.textContent).toContain("아파트가 꽉 차서 지금은 모집할 수 없어요");
    expect(host.querySelector('[role="switch"]')).toBeNull();
  });
});

const V: CityVilla = {
  id: "v9", name: "햇살아파트", slot: 0, topFloor: 3, memberCount: 6, litCount: 2, penthouseNickname: "민지",
  recruit: { intro: "아침 7시 러닝 크루", sports: ["running"], vacancies: 14 },
};
const APP: MyApplication = { id: "a1", villaId: "v9", villaName: "햇살아파트", message: "", createdAt: 0, expiresAt: Date.now() + 3 * 86_400_000 };
const card = (p: Partial<Parameters<typeof RecruitCard>[0]> = {}, onChanged = async () => {}) => (
  <RecruitCard v={V} mine={false} myApp={null} villaCount={1} onChanged={onChanged} {...p} />
);

describe("도시 카드 → 입주 신청", () => {
  it("shows_post_and_sends_application_with_message", async () => {
    const onChanged = vi.fn(async () => {});
    mockApi({});
    await mount(card({}, onChanged));
    expect(host.textContent).toContain("입주자 모집 중");
    expect(host.textContent).toContain("아침 7시 러닝 크루");
    expect(host.textContent).toContain("러닝");
    expect(host.textContent).toContain("빈방 14개");
    await click(button("입주 신청"));
    const ta = host.querySelector("textarea")!;
    await type(ta, "가".repeat(101));
    expect(button("신청 보내기")!.disabled).toBe(true);
    await type(ta, "저도 아침형이에요");
    await click(button("신청 보내기"));
    expect(calls).toContainEqual({ path: "/api/villas/v9/apply", method: "POST", body: { message: "저도 아침형이에요" } });
    expect(onChanged).toHaveBeenCalled();
    expect(host.querySelector("textarea")).toBeNull();
  });

  it("pending_here_shows_waiting_and_cancel", async () => {
    mockApi({});
    await mount(card({ myApp: APP }));
    expect(button("입주 신청")).toBeUndefined();
    expect(host.textContent).toContain("방장이 승인하면 바로 입주해요 · 3일 뒤 만료");
    await click(button("신청 취소"));
    expect(calls).toContainEqual({ path: "/api/applications/a1/cancel", method: "POST", body: undefined });
  });

  it("refusal_states_hide_the_button", async () => {
    mockApi({});
    await mount(card({ villaCount: 3 }));
    expect(button("입주 신청")).toBeUndefined();
    expect(host.textContent).toContain("아파트는 3곳까지 살 수 있어요");
    act(() => root.unmount());
    host.remove();

    await mount(card({ v: { ...V, recruit: { ...V.recruit!, blocked: true } } }));
    expect(button("입주 신청")).toBeUndefined();
    expect(host.textContent).toContain("이 아파트에는 신청할 수 없어요");
    act(() => root.unmount());
    host.remove();

    await mount(card({ myApp: { ...APP, villaId: "other", villaName: "새벽아파트" } }));
    expect(button("입주 신청")).toBeUndefined();
    expect(host.textContent).toContain("새벽아파트에 보낸 신청을 기다리는 중이에요");
    expect(button("그 신청 취소")).toBeDefined();
    act(() => root.unmount());
    host.remove();

    await mount(card({ mine: true }));
    expect(button("입주 신청")).toBeUndefined();
    expect(host.textContent).toContain("우리 아파트 모집 글이에요");
  });

  it("map_flags_only_recruiting_buildings", async () => {
    mockApi({});
    const plain: CityVilla = { ...V, id: "v8", slot: 1, recruit: undefined };
    await mount(<CityMap villas={[V, plain]} cols={2} selectedId={null} onSelect={() => {}} />);
    const flagged = host.querySelector('[data-recruit="1"]')!;
    expect(flagged.getAttribute("aria-label")).toContain("입주자 모집 중");
    expect(flagged.querySelector(".cb-flag")?.textContent).toBe("모집 중");
    expect(host.querySelectorAll(".cb-flag")).toHaveLength(1);
  });
});

describe("입주민 관리 → 받은 입주 신청", () => {
  const apps = [{ id: "a1", userId: "u9", nickname: "새식구", avatar: AV, sport: "gym", streak: 12, message: "잘 부탁해요", createdAt: Date.parse("2026-11-19T09:00:00+09:00") }];
  const manage = (onChanged = vi.fn(async () => {})) => (
    <MemberManage
      villa={{ id: "v1", name: "땀아파트", ownerId: "me", members: [{ userId: "me", nickname: "나", sport: "gym", avatar: AV as any }] }}
      meId="me"
      onChanged={onChanged}
      onTransferred={async () => {}}
      onDissolved={() => {}}
      onAuthLost={() => {}}
    />
  );

  it("lists_applicant_and_approves", async () => {
    let list: unknown[] = apps;
    mockApi({ "GET /api/villas/v1/applications": () => list, "GET /api/villas/v1/bans": [], "POST /api/villas/v1/applications/a1/approve": () => ((list = []), { ok: true }) });
    const onChanged = vi.fn(async () => {});
    await mount(manage(onChanged));
    const row = host.querySelector(".apply-row")!;
    expect(row.textContent).toContain("새식구");
    expect(row.textContent).toContain("연속 12일");
    expect(row.textContent).toContain("헬스");
    expect(row.textContent).toContain("11월 19일 신청");
    expect(row.textContent).toContain("잘 부탁해요");
    await click(button("승인", row));
    expect(calls).toContainEqual({ path: "/api/villas/v1/applications/a1/approve", method: "POST", body: undefined });
    expect(onChanged).toHaveBeenCalled();
    expect(host.querySelector(".apply-row")).toBeNull();
    expect(host.textContent).toContain("새식구 님이 입주했어요");
  });

  it("rejects_and_shows_server_refusal", async () => {
    mockApi({
      "GET /api/villas/v1/applications": apps,
      "GET /api/villas/v1/bans": [],
      "POST /api/villas/v1/applications/a1/approve": () => new Response(JSON.stringify({ error: "아파트가 꽉 차서 승인할 수 없어요" }), { status: 409 }),
    });
    await mount(manage());
    await click(button("승인", host.querySelector(".apply-row")!));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("아파트가 꽉 차서 승인할 수 없어요");
    await click(button("거절", host.querySelector(".apply-row")!));
    expect(calls).toContainEqual({ path: "/api/villas/v1/applications/a1/reject", method: "POST", body: undefined });
  });

  it("empty_state", async () => {
    mockApi({ "GET /api/villas/v1/applications": [], "GET /api/villas/v1/bans": [] });
    await mount(manage());
    expect(host.textContent).toContain("기다리는 입주 신청이 없어요");
  });
});

describe("알림 문구", () => {
  const e = (type: string, payload: Record<string, unknown>) => ({ id: "x", type, payload, createdAt: 0 });
  it("recruit_events_have_copy_and_kind", () => {
    expect(isToast("application_received")).toBe(true);
    expect(isToast("application_closed")).toBe(true);
    expect(isCard("application_rejected")).toBe(true);
    expect(cardButton("application_rejected")).toBe("알겠어요");
    expect(eventCopy(e("application_received", { nickname: "민수" }))).toBe("민수 님의 입주 신청이 왔어요");
    expect(eventCopy(e("application_received", { nickname: "민수", villaName: "햇살아파트", multi: true }))).toBe("햇살아파트에 민수 님의 입주 신청이 왔어요");
    expect(eventCopy(e("application_rejected", { villaName: "햇살아파트" }))).toBe("이번에는 햇살아파트에 함께하지 못하게 됐어요. 다른 아파트도 둘러봐요");
    expect(eventCopy(e("welcome", { villaName: "햇살아파트", via: "recruit" }))).toBe("입주 신청이 승인됐어요! 햇살아파트에 입주했어요");
    expect(eventCopy(e("welcome", { villaName: "햇살아파트" }))).toBe("햇살아파트에 입주했어요");
    expect(eventCopy(e("application_closed", { villaName: "햇살아파트", reason: "full" }))).toBe("햇살아파트가 꽉 차서 입주 신청이 취소됐어요");
    expect(eventCopy(e("application_closed", { villaName: "새벽아파트", reason: "expired" }))).toBe("새벽아파트 입주 신청이 7일이 지나 만료됐어요");
    expect(eventCopy(e("application_closed", { villaName: "새벽아파트", reason: "recruit_off" }))).toBe("새벽아파트 빈방 모집이 끝나서 입주 신청이 취소됐어요");
  });
});
