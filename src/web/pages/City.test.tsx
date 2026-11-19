// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { City } from "./City";
import type { CityResponse } from "../../shared/city";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const V = { id: "v1", name: "햇살빌라", slot: 0, topFloor: 3, memberCount: 6, litCount: 4, penthouseNickname: "민지" };
const W = { id: "v2", name: "새벽런닝", slot: 1, topFloor: 8, memberCount: 12, litCount: 7, penthouseNickname: "달리기" };
let root: Root;
let host: HTMLDivElement;
let calls: { path: string; method: string }[];

type Old = Omit<CityResponse, "myVillas" | "mine"> & { mine: Omit<NonNullable<CityResponse["mine"]>, "name"> | null; myVillas?: CityResponse["myVillas"] };
/** 빌라 1곳 응답은 mine 하나로 쓰고 myVillas 를 채운다 */
const res = (r: Old): CityResponse => {
  const mine = r.mine ? { name: "햇살빌라", ...r.mine } : null;
  return { ...r, mine, myVillas: r.myVillas ?? (mine ? [mine] : []) };
};
function mockApi(firstIn: Old, afterIn?: Old) {
  const first = res(firstIn);
  const after = afterIn && res(afterIn);
  calls = [];
  let data = first;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ path, method });
      if (method === "PUT" && after) data = after;
      return new Response(JSON.stringify(path === "/api/city" ? data : { ok: true }), { status: 200 });
    }),
  );
}
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter><City /></MemoryRouter>));
  await flush();
}
const click = async (el: Element | null | undefined) => {
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
};

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("City", () => {
  it("tapping_building_shows_card_with_aggregates_only", async () => {
    mockApi({ mine: { villaId: "v1", public: true, isOwner: true }, villas: [V, W] });
    await mount();
    expect(host.querySelectorAll('[role="button"]').length).toBe(2);
    expect(host.querySelector("#city-mine")?.getAttribute("aria-label")).toBe("우리 빌라, 햇살빌라, 오늘 불 켜진 방 4개");
    expect(host.querySelector(".city-hint")).toBeNull();
    await click(host.querySelector('[aria-label="새벽런닝, 오늘 불 켜진 방 7개"]'));
    const card = host.querySelector(".city-card")!;
    expect(card.textContent).toContain("새벽런닝");
    expect(card.textContent).toContain("12/20명");
    expect(card.textContent).toContain("7개");
    expect(card.textContent).toContain("달리기");
    expect(card.textContent).toContain("8층");
    await click(card.querySelector('[aria-label="닫기"]'));
    expect(host.querySelector(".city-card")).toBeNull();
  });

  it("owner_of_private_villa_can_publish_from_hint", async () => {
    mockApi(
      { mine: { villaId: "v1", public: false, isOwner: true }, villas: [W] },
      { mine: { villaId: "v1", public: true, isOwner: true }, villas: [V, W] },
    );
    await mount();
    expect(host.querySelector(".city-hint")?.textContent).toContain("우리 빌라는 아직 지도에 없어요");
    expect(host.querySelector("#city-mine")).toBeNull();
    await click(Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "지도에 공개하기"));
    expect(calls).toContainEqual({ path: "/api/villas/v1/public", method: "PUT" });
    expect(host.querySelector(".city-hint")).toBeNull();
    expect(host.querySelector("#city-mine")).not.toBeNull();
  });

  it("marks_every_villa_i_live_in_and_hints_per_hidden_villa", async () => {
    const X = { id: "v3", name: "달빛클럽", slot: 2, topFloor: 1, memberCount: 2, litCount: 0, penthouseNickname: null };
    mockApi({
      mine: { villaId: "v1", public: true, isOwner: false },
      myVillas: [
        { villaId: "v1", name: "햇살빌라", public: true, isOwner: false },
        { villaId: "v3", name: "달빛클럽", public: true, isOwner: true },
        { villaId: "v9", name: "비밀집", public: false, isOwner: true },
      ],
      villas: [V, W, X],
    });
    await mount();
    expect(host.querySelectorAll(".city-bldg.mine").length).toBe(2);
    expect(host.querySelectorAll("#city-mine").length).toBe(1);
    expect(host.querySelector("#city-mine")?.getAttribute("aria-label")).toBe("우리 빌라, 햇살빌라, 오늘 불 켜진 방 4개");
    expect(host.querySelector('[aria-label="우리 빌라, 달빛클럽, 오늘 불 켜진 방 0개"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="새벽런닝, 오늘 불 켜진 방 7개"]')).not.toBeNull();
    const hints = host.querySelectorAll(".city-hint");
    expect(hints.length).toBe(1);
    expect(hints[0].textContent).toContain("비밀집은 아직 지도에 없어요.");
    await click(host.querySelector('[aria-label="비밀집 지도에 공개하기"]'));
    expect(calls).toContainEqual({ path: "/api/villas/v9/public", method: "PUT" });
    await click(host.querySelector('[aria-label="우리 빌라, 달빛클럽, 오늘 불 켜진 방 0개"]'));
    expect(host.querySelector(".city-card .mine-tag")?.textContent).toBe("우리 빌라");
  });

  it("non_owner_of_private_villa_sees_wait_message", async () => {
    mockApi({ mine: { villaId: "v1", public: false, isOwner: false }, villas: [] });
    await mount();
    expect(host.querySelector(".city-hint")?.textContent).toBe("방장이 공개하면 지도에 나와요.");
    expect(host.querySelector(".city-hint button")).toBeNull();
    // 빌라가 하나도 없어도 지도(소품)는 그린다
    expect(host.querySelector(".city-map")).not.toBeNull();
  });
});
