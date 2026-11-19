// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Settings } from "./Settings";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ME = { id: "me", username: "kakao_0123456789abcdef0123", nickname: "카카오러", sport: "gym", avatar: { skin: 0, hair: "short", shirt: 0 } };
let root: Root;
let host: HTMLDivElement;
let calls: { path: string; method: string }[];

function mockApi(status: { configured: boolean; linked: boolean; hasPassword: boolean }) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, method: init?.method ?? "GET" });
      const body = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
      if (path === "/api/me") return body(ME);
      if (path === "/api/villas/mine") return body(null);
      if (path === "/api/me/villas") return body([]);
      if (path === "/api/shop") return body({ owned: [] });
      if (path === "/api/auth/kakao/status") return body(status);
      return body({ ok: true });
    }),
  );
}

async function mount(url = "/settings") {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[url]}><Settings /></MemoryRouter>);
  });
  await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
}
const headings = () => Array.from(host.querySelectorAll("h2")).map((h) => h.textContent);
const button = (text: string) => Array.from(host.querySelectorAll("button")).find((b) => b.textContent === text);

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("Settings 카카오 연결", () => {
  it("kakao_only_hides_password_and_recovery_and_hidden_username", async () => {
    mockApi({ configured: true, linked: true, hasPassword: false });
    await mount();
    expect(headings()).toContain("카카오 연결");
    expect(headings()).not.toContain("비밀번호 변경");
    expect(headings()).not.toContain("복구 코드 다시 받기");
    expect(host.textContent).not.toContain(ME.username);
    expect(host.textContent).toContain("카카오로 로그인해요");
    expect(host.querySelector('[data-kakao-state="kakao-only"]')).not.toBeNull();
    // 탈퇴 확인은 숨긴 아이디 대신 닉네임으로
    await act(async () => button("탈퇴")!.click());
    expect(host.querySelector('[role="alertdialog"]')!.textContent).toContain("닉네임 카카오러");
  });

  it("password_account_keeps_password_sections_and_can_unlink", async () => {
    mockApi({ configured: true, linked: true, hasPassword: true });
    await mount("/settings?kakao=linked");
    expect(headings()).toContain("비밀번호 변경");
    expect(headings()).toContain("복구 코드 다시 받기");
    expect(host.textContent).toContain("카카오를 연결했어요");
    await act(async () => button("연결 해제")!.click());
    await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
    expect(calls).toContainEqual({ path: "/api/auth/kakao/link", method: "DELETE" });
    expect(host.querySelector('[data-kakao-state="unlinked"]')).not.toBeNull();
  });

  it("status_failure_keeps_settings_usable", async () => {
    mockApi({ configured: true, linked: false, hasPassword: true });
    vi.stubGlobal("fetch", vi.fn(async (path: string) =>
      path === "/api/auth/kakao/status" ? new Response("{}", { status: 500 })
        : new Response(JSON.stringify(path === "/api/me" ? ME : path === "/api/shop" ? { owned: [] } : path === "/api/me/villas" ? [] : null), { status: 200 })));
    await mount();
    expect(headings()).not.toContain("카카오 연결");
    expect(headings()).toContain("비밀번호 변경");
  });
});
