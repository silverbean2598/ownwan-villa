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

function mockApi(first: CityResponse, after?: CityResponse) {
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

  it("non_owner_of_private_villa_sees_wait_message", async () => {
    mockApi({ mine: { villaId: "v1", public: false, isOwner: false }, villas: [] });
    await mount();
    expect(host.querySelector(".city-hint")?.textContent).toBe("방장이 공개하면 지도에 나와요.");
    expect(host.querySelector(".city-hint button")).toBeNull();
    // 빌라가 하나도 없어도 지도(소품)는 그린다
    expect(host.querySelector(".city-map")).not.toBeNull();
  });
});
