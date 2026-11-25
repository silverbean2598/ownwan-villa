// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activeTab, showTabBar, TabBar } from "./TabBar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement;
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
async function mount(path: string) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "me1" }), { status: 200 })));
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(<MemoryRouter initialEntries={[path]}><TabBar /></MemoryRouter>));
  await flush();
}
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
  vi.unstubAllGlobals();
});

describe("showTabBar", () => {
  it("hidden_on_pre_login_pages", () => {
    for (const p of ["/", "/signup", "/signup/code", "/login", "/recover", "/kakao/nickname", "/join/abc", "/onboard", "/terms", "/privacy", "/account-delete"]) {
      expect(showTabBar(p)).toBe(false);
    }
  });
  it("shown_on_app_pages", () => {
    for (const p of ["/villa", "/villa/v1", "/meals", "/meals/new", "/meals/m1/edit", "/city", "/room/u1", "/room/u1/board", "/certify", "/shop", "/settings", "/ranking", "/battle/v1"]) {
      expect(showTabBar(p)).toBe(true);
    }
    // 비슷한 이름은 아니다
    expect(showTabBar("/villainy")).toBe(false);
  });
  it("active_tab", () => {
    expect(activeTab("/villa/v1", "me")).toBe("villa");
    expect(activeTab("/meals/new", "me")).toBe("meals");
    expect(activeTab("/city", "me")).toBe("city");
    expect(activeTab("/room/me", "me")).toBe("room");
    expect(activeTab("/room/me/board", "me")).toBe("room");
    expect(activeTab("/room/other", "me")).toBe("villa");
    expect(activeTab("/login", "me")).toBeNull();
  });
});

describe("TabBar", () => {
  it("renders_four_tabs_with_my_room_and_active_highlight", async () => {
    await mount("/meals");
    const tabs = Array.from(host.querySelectorAll<HTMLAnchorElement>(".tabbar a"));
    expect(tabs.map((a) => a.textContent)).toEqual(["아파트", "식당", "도시", "내 방"]);
    expect(tabs.map((a) => a.getAttribute("href"))).toEqual(["/villa", "/meals", "/city", "/room/me1"]);
    expect(host.querySelector(".tabbar .on")!.textContent).toBe("식당");
    expect(document.body.classList.contains("has-tabbar")).toBe(true);
  });

  it("not_rendered_on_landing", async () => {
    await mount("/");
    expect(host.querySelector(".tabbar")).toBeNull();
    expect(document.body.classList.contains("has-tabbar")).toBe(false);
  });
});
