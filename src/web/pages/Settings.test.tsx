// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Settings } from "./Settings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AV = { skin: 0, hair: "short", shirt: 0 };
const ME = { id: "me", username: "me1", nickname: "나", sport: "gym", avatar: AV };
const villa = (ownerId: string) => ({
  id: "v1",
  name: "땀아파트",
  ownerId,
  ...(ownerId === "me" ? { inviteToken: "tok" } : {}),
  members: [
    { userId: "me", nickname: "나", sport: "gym", avatar: AV },
    { userId: "b", nickname: "비비", sport: "running", avatar: AV },
  ],
});

let root: Root;
let host: HTMLDivElement;
let calls: { path: string; method: string; body?: unknown }[];

function mockApi(ownerId: string, bans: unknown[] = []) {
  calls = [];
  let owner = ownerId;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const body = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
      if (path === "/api/me") return body(ME);
      if (path === "/api/me/villas") return body([{ id: "v1", name: "땀아파트", ownerId: owner, public: false, memberCount: 2, joinedAt: 0, certifiedToday: false }]);
      if (path === "/api/villas/v1" && method === "GET") return body(villa(owner));
      if (path === "/api/villas/v1/transfer") owner = "b";
      if (path === "/api/recover/pending") return body([]);
      if (path === "/api/shop") return body({ owned: [] });
      if (path === "/api/villas/v1/bans" && method === "GET") return body(bans);
      if (path === "/api/villas/v1/recruit" && method === "GET") return body({ open: false, intro: "", sports: [], updatedAt: null, public: false, memberCount: 2 });
      if (path === "/api/villas/v1/applications" && method === "GET") return body([]);
      if (path === "/api/me/application") return body({ pending: null });
      return body({ ok: true });
    }),
  );
}

async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
const button = (text: string, scope: Element = host) =>
  Array.from(scope.querySelectorAll("button")).find((b) => b.textContent === text) as HTMLButtonElement | undefined;
const click = async (el: Element | undefined | null) => {
  await act(async () => (el as HTMLElement).click());
  await flush();
};
const headings = () => Array.from(host.querySelectorAll("h2")).map((h) => h.textContent);
const dialog = () => host.querySelector('[role="alertdialog"]');

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("Settings 입주민 관리", () => {
  it("shows_member_management_only_for_owner", async () => {
    mockApi("b");
    await mount();
    expect(headings()).not.toContain("입주민 관리");
    expect(button("아파트 해체하기")).toBeUndefined();
    expect(button("내보내기")).toBeUndefined();
  });

  it("owner_sees_members_with_actions_except_self", async () => {
    mockApi("me", [{ userId: "x", nickname: "엑스", createdAt: 1 }]);
    await mount();
    expect(headings()).toContain("입주민 관리");
    const rows = Array.from(host.querySelectorAll(".member-row:not(.ban-row)"));
    expect(rows.map((r) => r.querySelector(".member-name")?.textContent)).toEqual(["나", "비비"]);
    expect(rows[0].textContent).toContain("방장");
    expect(button("내보내기", rows[0])).toBeUndefined();
    expect(button("내보내기", rows[1])).toBeDefined();
    expect(button("방장 넘기기", rows[1])).toBeDefined();
    expect(host.textContent).toContain("엑스");
    expect(button("다시 받기")).toBeDefined();
  });

  it("kick_asks_in_page_then_posts", async () => {
    mockApi("me");
    await mount();
    await click(button("내보내기", host.querySelectorAll(".member-row:not(.ban-row)")[1]));
    expect(dialog()?.textContent).toContain("비비 님을 아파트에서 내보낼까요? 내보낸 사람은 방장이 풀어 줄 때까지 다시 입주할 수 없어요.");
    await click(button("취소", dialog()!));
    expect(dialog()).toBeNull();
    expect(calls.some((c) => c.path.includes("/kick"))).toBe(false);
    await click(button("내보내기", host.querySelectorAll(".member-row:not(.ban-row)")[1]));
    await click(button("내보내기", dialog()!));
    expect(calls).toContainEqual({ path: "/api/villas/v1/members/b/kick", method: "POST", body: undefined });
  });

  it("transfer_asks_then_posts_and_reloads", async () => {
    mockApi("me");
    await mount();
    await click(button("방장 넘기기", host.querySelectorAll(".member-row:not(.ban-row)")[1]));
    expect(dialog()?.textContent).toContain("비비 님에게 방장을 넘길까요? 넘기면 나는 일반 입주민이 돼요.");
    const before = calls.filter((c) => c.path === "/api/villas/v1" && c.method === "GET").length;
    await click(button("넘기기", dialog()!));
    expect(calls).toContainEqual({ path: "/api/villas/v1/transfer", method: "POST", body: { userId: "b" } });
    expect(calls.filter((c) => c.path === "/api/villas/v1" && c.method === "GET").length).toBeGreaterThan(before);
    // 이제 방장이 아니라 입주민 관리는 사라지고, 넘겼다는 안내는 남는다
    expect(headings()).not.toContain("입주민 관리");
    expect(host.querySelector('[role="status"]')?.textContent).toBe("비비 님에게 방장을 넘겼어요");
  });

  it("dissolve_needs_exact_name", async () => {
    mockApi("me");
    await mount();
    await click(button("아파트 해체하기"));
    const input = dialog()!.querySelector("input") as HTMLInputElement;
    const go = button("해체하기", dialog()!)!;
    expect(go.disabled).toBe(true);
    const type = async (v: string) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, v);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    await type("땀빌");
    expect(button("해체하기", dialog()!)!.disabled).toBe(true);
    await type("땀아파트");
    expect(button("해체하기", dialog()!)!.disabled).toBe(false);
    await click(button("해체하기", dialog()!));
    expect(calls).toContainEqual({ path: "/api/villas/v1/dissolve", method: "POST", body: { confirmName: "땀아파트" } });
  });
});

describe("Settings 도시 지도 공개", () => {
  const sw = () => host.querySelector('[role="switch"]') as HTMLButtonElement | null;

  it("owner_toggles_on_then_off", async () => {
    mockApi("me");
    await mount();
    expect(headings()).toContain("도시 지도에 공개");
    expect(sw()?.getAttribute("aria-checked")).toBe("false");
    expect(host.textContent).toContain("지도에 나오지 않아요");
    await click(sw());
    expect(calls).toContainEqual({ path: "/api/villas/v1/public", method: "PUT", body: { public: true } });
    expect(sw()?.getAttribute("aria-checked")).toBe("true");
    expect(host.textContent).toContain("지도에 공개했어요");
    await click(sw());
    expect(calls).toContainEqual({ path: "/api/villas/v1/public", method: "PUT", body: { public: false } });
    expect(sw()?.getAttribute("aria-checked")).toBe("false");
  });

  it("non_owner_sees_read_only_state", async () => {
    mockApi("b");
    await mount();
    expect(headings()).toContain("도시 지도에 공개");
    expect(sw()).toBeNull();
    expect(host.textContent).toContain("공개 설정은 방장이 해요");
  });
});

describe("Settings 휴대폰 알림", () => {
  it("shows_push_section_and_logout_still_works_without_service_worker", async () => {
    mockApi("b");
    await mount();
    expect(headings()).toContain("휴대폰 알림");
    // 이 목업은 키를 주지 않는다 → 준비 중
    expect(host.querySelector('[data-push-state="preparing"]')).not.toBeNull();
    await click(button("로그아웃"));
    const out = calls.find((c) => c.path === "/api/logout");
    expect(out?.method).toBe("POST");
    // 이 기기에 구독이 없으면 본문 없이 (예전과 같다)
    expect(out?.body).toBeUndefined();
  });
});
