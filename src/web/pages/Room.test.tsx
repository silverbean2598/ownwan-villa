// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Room } from "./Room";
import { SLOTS } from "../../shared/catalog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AV = { skin: 0, hair: "short", shirt: 0 };
const member = (userId: string, nickname: string, placements: { slot: string; itemId: string }[] = []) => ({
  userId, nickname, sport: "gym", avatar: AV, floor: 1, streak: 2, certifiedToday: true, placements,
});
const villa = {
  id: "v1",
  name: "땀빌라",
  ownerId: "me",
  penthouseUserId: null,
  members: [member("me", "나", [{ slot: "wall2", itemId: "landscape-frame" }]), member("b", "비비", [{ slot: "floor1", itemId: "plant" }])],
};

let root: Root;
let host: HTMLDivElement;

function mockApi() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      const body = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
      if (path === "/api/me") return body({ id: "me" });
      if (path === "/api/me/villas") return body([{ id: "v1", name: "땀빌라", ownerId: "me", public: false, memberCount: 2, joinedAt: 0, certifiedToday: true }]);
      if (path === "/api/villas/v1") return body(villa);
      if (path === "/api/shop") return body({ points: 100, owned: ["landscape-frame", "plant", "bench"] });
      if (path.includes("/board")) return body([]);
      return body({ ok: true });
    }),
  );
}

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
async function mount(userId: string) {
  mockApi();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/room/${userId}?villa=v1`]}>
        <Routes>
          <Route path="/room/:userId" element={<Room />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await flush();
  await flush();
  await flush();
}
const button = (name: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === name) ?? null;
const slots = () => host.querySelectorAll(".slots .slot");
const click = async (el: Element | null) => {
  await act(async () => (el as HTMLElement).click());
  await flush();
};

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("Room 방 꾸미기", () => {
  it("view_mode_hides_dashed_slots_from_screen_and_a11y_tree", async () => {
    await mount("me");
    expect(host.querySelector("h1")?.textContent).toBe("나");
    expect(button("방 꾸미기")).not.toBeNull();
    expect(host.querySelector(".slots")).toBeNull();
    expect(slots().length).toBe(0);
    expect(host.querySelector('[aria-label*="가구 놓기"]')).toBeNull();
    expect(host.querySelector(".room-stage.editing")).toBeNull();
    // 예전 "가구 놓기" 버튼은 없다. 가구 상점은 그대로
    expect(button("가구 놓기")).toBeNull();
    expect([...host.querySelectorAll("a")].some((a) => a.textContent === "가구 상점")).toBe(true);
  });

  it("edit_mode_shows_slot_buttons_then_done_hides_them", async () => {
    await mount("me");
    await click(button("방 꾸미기"));
    expect(host.querySelector(".room-stage.editing")).not.toBeNull();
    const ss = [...slots()] as HTMLButtonElement[];
    expect(ss.map((s) => s.dataset.slot)).toEqual([...SLOTS]);
    for (const s of ss) expect(s.tagName).toBe("BUTTON");
    // 빈 자리는 "+", 놓인 자리는 바꾸기
    expect(host.querySelector('[data-slot="wall2"].slot')?.getAttribute("aria-label")).toBe("뒷벽: 풍경 액자 바꾸기");
    expect(host.querySelector('[data-slot="floor1"].slot')?.getAttribute("aria-label")).toBe("바닥 1: 가구 놓기");
    // 키보드 초점이 첫 자리로 옮겨 간다
    expect(document.activeElement).toBe(ss[0]);
    expect(host.querySelector('[role="status"]')?.textContent).toContain("점선 자리");
    expect(button("방 꾸미기")).toBeNull();

    await click(button("완료"));
    expect(slots().length).toBe(0);
    expect(host.querySelector(".room-stage.editing")).toBeNull();
    expect(document.activeElement).toBe(button("방 꾸미기"));
  });

  it("tapping_a_slot_in_edit_mode_opens_picker_and_closing_stays_editing", async () => {
    await mount("me");
    await click(button("방 꾸미기"));
    await click(host.querySelector('[data-slot="floor1"].slot'));
    const dialog = host.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute("aria-label")).toBe("가구 놓기");
    expect(dialog.querySelector('[aria-checked="true"]')?.textContent).toBe("바닥 1");
    expect(dialog.textContent).toContain("화분");
    expect(host.querySelector(".slot.picking")?.getAttribute("data-slot")).toBe("floor1");
    // 고르는 동안에는 아래 버튼을 숨긴다
    expect(button("완료")).toBeNull();
    await click(button("닫기"));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(slots().length).toBe(5);
    expect(button("완료")).not.toBeNull();
  });

  it("other_users_room_is_read_only", async () => {
    await mount("b");
    expect(host.querySelector("h1")?.textContent).toBe("비비");
    expect(button("방 꾸미기")).toBeNull();
    expect(button("완료")).toBeNull();
    expect(host.querySelector(".slots")).toBeNull();
    expect(host.querySelector(".room-actions")).toBeNull();
    // 가구는 보인다
    expect(host.querySelector('[data-item="plant"]')).not.toBeNull();
  });
});
