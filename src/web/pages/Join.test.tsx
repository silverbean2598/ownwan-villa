// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Join } from "./Join";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLDivElement;
function mockApi(preview: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => new Response(JSON.stringify(path === "/api/me" ? { id: "me" } : preview), { status: 200 })),
  );
}
async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/join/tok"]}>
        <Routes>
          <Route path="/join/:token" element={<Join />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
}
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("Join — 아파트 3곳까지", () => {
  it("at_limit_shows_friendly_message_without_join_button", async () => {
    mockApi({ villaName: "넷째아파트", memberCount: 3, alreadyMember: false, myVillaCount: 3, atLimit: true });
    await mount();
    expect(host.querySelector(".limit-box")!.textContent).toBe("아파트는 3곳까지 살 수 있어요. 한 곳을 나가면 들어올 수 있어요");
    expect(Array.from(host.querySelectorAll("button")).some((b) => b.textContent === "입주하기")).toBe(false);
  });

  it("living_elsewhere_can_still_join_one_more", async () => {
    mockApi({ villaName: "둘째아파트", memberCount: 3, alreadyMember: false, myVillaCount: 1, atLimit: false });
    await mount();
    expect(host.textContent).toContain("지금 사는 아파트는 그대로 두고 한 곳 더 입주해요. (2/3곳)");
    expect(Array.from(host.querySelectorAll("button")).some((b) => b.textContent === "입주하기")).toBe(true);
  });
});
