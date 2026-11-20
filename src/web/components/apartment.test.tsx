// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Building, layoutFloors, type Member, type FloorRow } from "./Building";
import { PromoteSettings } from "./PromoteSettings";
import { CardArt } from "./celebrate/CelebrationArt";
import { CityMap } from "./city/CityMap";
import { buildingLabel } from "./city/CityBuilding";
import { APARTMENT_MIN_STORIES, buildingHeight, buildingShape, shapeOf } from "./city/layout";
import { eventCopy, isCard, planEvents } from "../events/plan";
import { APARTMENT_CAPACITY, VILLA_CAPACITY, capacityOf, kindLabel, promoteState } from "../../shared/villa";
import { DEFAULT_AVATAR } from "../../shared/avatar";
import type { CityVilla } from "../../shared/city";

// 아파트 승격 [제안 — 기획자 확인 필요, 2026-11-20]: 화면 쪽

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const m = (userId: string, floor = 1, streak = 0): Member => ({
  userId, nickname: userId, sport: "gym", avatar: DEFAULT_AVATAR, floor, streak, certifiedToday: false, placements: [],
});
const many = (k: number) => Array.from({ length: k }, (_, i) => m(`u${i}`, 1 + (i % 4), i));

describe("정원 · 종류 (shared/villa)", () => {
  it("defaults_for_old_responses_and_states", () => {
    expect(capacityOf({})).toBe(VILLA_CAPACITY);
    expect(capacityOf({ capacity: 50 })).toBe(50);
    expect(kindLabel(undefined)).toBe("빌라");
    expect(kindLabel("apartment")).toBe("아파트");
    expect(promoteState({ memberCount: 20 }, true)).toBe("eligible");
    expect(promoteState({ memberCount: 17 }, true)).toBe("waiting");
    expect(promoteState({ memberCount: 20 }, false)).toBe("member");
    expect(promoteState({ kind: "apartment", capacity: 50, memberCount: 50 }, true)).toBe("apartment");
    expect(promoteState({ kind: "apartment", capacity: 50, memberCount: 3 }, false)).toBe("apartment");
  });
});

describe("빌라 화면 (아파트 50명)", () => {
  it("vacant_rooms_fold_with_the_buildings_own_capacity", () => {
    const rows = layoutFloors(many(30), "u29", APARTMENT_CAPACITY);
    const f1 = rows.filter((r): r is FloorRow => !("gap" in r) && r.floor === 1).at(-1)!;
    // 빈방은 한 줄까지만 그리고 나머지는 "빈방 n개"
    expect((f1.emptySlots ?? 0) + (f1.vacantMore ?? 0)).toBe(20);
    expect(f1.emptySlots).toBeLessThanOrEqual(3);
    // 기본값(빌라 20명)은 그대로
    const villaRows = layoutFloors(many(5), null);
    const v1 = villaRows.filter((r): r is FloorRow => !("gap" in r) && r.floor === 1).at(-1)!;
    expect((v1.emptySlots ?? 0) + (v1.vacantMore ?? 0)).toBe(15);
  });

  it("renders_50_rooms_three_per_row_with_apartment_sign", () => {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(
      <MemoryRouter>
        <Building members={many(50)} penthouseUserId="u49" ownerId="u0" meId="u1" capacity={50} kind="apartment" />
      </MemoryRouter>,
    );
    const bldg = host.querySelector(".bldg")!;
    expect(bldg.className).toContain("apt");
    expect(bldg.getAttribute("aria-label")).toBe("아파트 단면");
    expect(host.querySelector(".roof-sign")?.textContent).toBe("아파트");
    expect(host.querySelectorAll("button.room")).toHaveLength(50);
    // 한 줄에 최대 3칸 (가로로 넘치지 않는 3칸 격자)
    for (const f of host.querySelectorAll(".floor")) expect(f.querySelectorAll(".room, .wall").length).toBeLessThanOrEqual(3);
    // 꽉 찼으니 빈방이 없다
    expect(host.querySelectorAll(".room.empty")).toHaveLength(0);
    expect(host.querySelector(".vacant-more")).toBeNull();
    // 빌라는 간판이 없다
    const villa = renderToStaticMarkup(<MemoryRouter><Building members={many(3)} penthouseUserId={null} ownerId="u0" meId="u0" /></MemoryRouter>);
    expect(villa).toContain('aria-label="빌라 단면"');
    expect(villa).not.toContain("roof-sign");
  });
});

describe("도시 지도 아파트", () => {
  const cv = (o: Partial<CityVilla> = {}): CityVilla => ({ id: "apt-1", name: "하늘아파트", slot: 0, topFloor: 2, memberCount: 30, litCount: 12, penthouseNickname: "민지", ...o });

  it("apartment_shape_is_always_tall_and_fits_50_windows", () => {
    const s = buildingShape(2, 50, 20, 7, true);
    expect(s.tall).toBe(true);
    expect(s.apartment).toBe(true);
    expect(s.stories).toBeGreaterThanOrEqual(APARTMENT_MIN_STORIES);
    expect(s.windows.filter((w) => w !== "vacant")).toHaveLength(50);
    expect(s.windows.filter((w) => w === "lit")).toHaveLength(20);
    // 같은 사람 수 · 층이어도 빌라보다 높다
    expect(buildingHeight(shapeOf(cv({ kind: "apartment" })))).toBeGreaterThan(buildingHeight(shapeOf(cv())));
    expect(shapeOf(cv()).apartment).toBeUndefined();
  });

  it("draws_apartment_sign_and_labels", () => {
    const html = renderToStaticMarkup(
      <CityMap villas={[cv({ kind: "apartment", capacity: 50 }), cv({ id: "v-2", name: "옆빌라", slot: 1, memberCount: 3, litCount: 1 })]} cols={2} mineId="apt-1" selectedId={null} onSelect={() => {}} />,
    );
    expect(html).toContain('data-kind="apartment"');
    expect((html.match(/data-kind="apartment"/g) ?? []).length).toBe(1);
    expect(html).toContain("아파트</text>");
    expect(html).toContain("우리 아파트</text>");
    expect(html).toContain('aria-label="우리 아파트, 하늘아파트, 아파트, 오늘 불 켜진 방 12개"');
    expect(buildingLabel(cv(), false)).toBe("하늘아파트, 오늘 불 켜진 방 12개");
  });
});

describe("축하 카드", () => {
  const ev = (payload: Record<string, unknown>) => ({ id: "apartment:v:u", type: "apartment_promoted", payload, createdAt: 1_000 });

  it("is_a_card_with_friendly_copy", () => {
    expect(isCard("apartment_promoted")).toBe(true);
    expect(planEvents([ev({})], 2_000).cards).toHaveLength(1);
    expect(eventCopy(ev({ villaName: "땀빌라", capacity: 50, multi: false }))).toBe("우리 빌라가 아파트가 됐어요! 이제 50명까지 함께 살 수 있어요");
    // 빌라 여러 곳에 사는 사람에게는 이름 (받침에 맞는 조사)
    expect(eventCopy(ev({ villaName: "햇살빌라", capacity: 50, multi: true }))).toBe("햇살빌라가 아파트가 됐어요! 이제 50명까지 함께 살 수 있어요");
    expect(eventCopy(ev({ villaName: "오운완 3동", capacity: 50, multi: true }))).toBe("오운완 3동이 아파트가 됐어요! 이제 50명까지 함께 살 수 있어요");
  });

  it("draws_an_apartment_behind_the_jumping_viewer", () => {
    const h = renderToStaticMarkup(<CardArt type="apartment_promoted" spec={DEFAULT_AVATAR} />);
    expect(h).toContain('data-part="mini-apartment"');
    expect(h).toContain('data-part="confetti"');
    expect(h).toContain('class="spr p-cheer"');
  });
});

describe("설정 → 아파트 승격", () => {
  let root: Root;
  let host: HTMLDivElement;
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
  const villa = (k: number, o: Record<string, unknown> = {}) => ({ id: "v1", name: "땀빌라", members: Array.from({ length: k }, () => ({})), ...o });
  async function mount(v: ReturnType<typeof villa>, isOwner: boolean, onPromoted = vi.fn()) {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<PromoteSettings villa={v} isOwner={isOwner} title="아파트 승격" onPromoted={onPromoted} onAuthLost={() => {}} />));
    return onPromoted;
  }
  const btn = (t: string) => Array.from(host.querySelectorAll("button")).find((b) => b.textContent === t);
  const click = async (b: Element | undefined) => {
    await act(async () => (b as HTMLElement).click());
    await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
  };

  it("eligible_owner_confirms_then_promotes", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? "GET"} ${path}`);
      return new Response(JSON.stringify({ ok: true, kind: "apartment", capacity: 50 }), { status: 200 });
    }));
    const onPromoted = await mount(villa(20), true);
    expect(host.textContent).toContain("입주민 20/20명이 다 모였어요!");
    await click(btn("아파트로 승격"));
    const dlg = host.querySelector('[role="alertdialog"]')!;
    expect(dlg.textContent).toContain("아파트로 바꾸면 다시 빌라로 돌아갈 수 없어요.");
    expect(calls).toEqual([]);
    // 취소하면 아무것도 보내지 않는다
    await click(btn("취소"));
    expect(host.querySelector('[role="alertdialog"]')).toBeNull();
    await click(btn("아파트로 승격"));
    await click(btn("아파트로 바꾸기"));
    expect(calls).toEqual(["POST /api/villas/v1/promote"]);
    expect(onPromoted).toHaveBeenCalledWith(50);
    expect(host.querySelector('[role="status"]')?.textContent).toContain("아파트가 됐어요! 이제 50명까지 함께 살 수 있어요");
  });

  it("shows_server_refusal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "입주민이 20명 모여야 아파트로 바꿀 수 있어요 (지금 19명)", reason: "not_full" }), { status: 409 })));
    const onPromoted = await mount(villa(20), true);
    await click(btn("아파트로 승격"));
    await click(btn("아파트로 바꾸기"));
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("입주민이 20명 모여야 아파트로 바꿀 수 있어요 (지금 19명)");
    expect(onPromoted).not.toHaveBeenCalled();
  });

  it("not_yet_owner_and_member_are_read_only", async () => {
    await mount(villa(17), true);
    expect(host.textContent).toContain("입주민 17/20명 — 20명이 모이면 아파트로 바꿀 수 있어요.");
    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(host.querySelector(".promote-progress span")?.getAttribute("style")).toContain("85%");
    act(() => root.unmount());
    host.remove();

    await mount(villa(12), false);
    expect(host.textContent).toContain("입주민 12/20명 — 20명이 모이면 방장이 아파트로 바꿀 수 있어요. 아파트가 되면 정원이 50명으로 늘어요.");
    expect(host.querySelectorAll("button")).toHaveLength(0);
    act(() => root.unmount());
    host.remove();

    await mount(villa(20), false);
    expect(host.textContent).toContain("입주민 20/20명이 다 모였어요! 방장이 아파트로 바꾸면 정원이 50명으로 늘어요.");
    expect(host.querySelectorAll("button")).toHaveLength(0);
  });

  it("apartment_is_read_only_for_everyone", async () => {
    await mount(villa(31, { kind: "apartment", capacity: 50 }), true);
    expect(host.textContent).toContain("우리 아파트예요 · 정원 50명 (지금 31명)");
    expect(host.querySelectorAll("button")).toHaveLength(0);
  });
});
