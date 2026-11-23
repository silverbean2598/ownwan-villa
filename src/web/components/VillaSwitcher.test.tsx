// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VillaSwitcher } from "./VillaSwitcher";
import { pickVilla, readCurrentVilla, writeCurrentVilla } from "../villa/current";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const A = { id: "A", name: "에이아파트", certifiedToday: true };
const B = { id: "B", name: "비아파트", certifiedToday: false };
const C = { id: "C", name: "씨아파트", certifiedToday: false };

let root: Root;
let host: HTMLDivElement;
function mount(el: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<MemoryRouter>{el}</MemoryRouter>));
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  if (root) act(() => root.unmount());
  host?.remove();
  vi.restoreAllMocks();
});

describe("VillaSwitcher", () => {
  it("hidden_with_one_villa", () => {
    mount(<VillaSwitcher villas={[A]} currentId="A" onPick={() => {}} showAdd />);
    expect(host.querySelector(".villa-switch")).toBeNull();
  });

  it("tabs_mark_current_and_lit_and_pick_others", () => {
    const onPick = vi.fn();
    mount(<VillaSwitcher villas={[A, B]} currentId="B" onPick={onPick} showAdd />);
    const tabs = Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    expect(tabs.map((t) => t.querySelector(".villa-tab-name")!.textContent)).toEqual(["에이아파트", "비아파트"]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    expect(tabs[0].querySelector(".lamp.lit")).not.toBeNull();
    expect(tabs[1].querySelector(".lamp.lit")).toBeNull();
    act(() => tabs[1].click());
    expect(onPick).not.toHaveBeenCalled();
    act(() => tabs[0].click());
    expect(onPick).toHaveBeenCalledWith("A");
    // 3곳보다 적으면 [+]로 아파트를 더 만든다
    expect(host.querySelector('a[href="/villa/new"]')).not.toBeNull();
  });

  it("no_add_tab_at_three", () => {
    mount(<VillaSwitcher villas={[A, B, C]} currentId="A" onPick={() => {}} showAdd />);
    expect(host.querySelectorAll('[role="tab"]').length).toBe(3);
    expect(host.querySelector('a[href="/villa/new"]')).toBeNull();
  });
});

describe("current villa (이 기기에서 마지막으로 본 아파트)", () => {
  it("prefers_wanted_then_stored_then_first", () => {
    expect(pickVilla([], "A")).toBeNull();
    expect(pickVilla([A, B])).toBe("A");
    writeCurrentVilla("B");
    expect(readCurrentVilla()).toBe("B");
    expect(pickVilla([A, B])).toBe("B");
    expect(pickVilla([A, B], "A")).toBe("A");
    // 저장된 아파트에서 나갔으면 첫 아파트
    expect(pickVilla([A, C])).toBe("A");
    // 원하는 아파트가 내 아파트가 아니면 무시
    expect(pickVilla([A, B], "Z")).toBe("B");
  });

  it("survives_blocked_storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => writeCurrentVilla("B")).not.toThrow();
    expect(readCurrentVilla()).toBeNull();
    expect(pickVilla([A, B])).toBe("A");
  });
});
