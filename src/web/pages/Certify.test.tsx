// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../image/compress", () => ({
  compressImage: async () => new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }),
  ImageDecodeError: class extends Error {},
}));
vi.mock("../image/dhash", () => ({ dhashFromBlob: async () => "0123456789abcdef" }));

import { Certify } from "./Certify";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type V = { id: string; name: string; certifiedToday: boolean };
const v = (id: string, name: string, certifiedToday = false): V => ({ id, name, certifiedToday });

let root: Root;
let host: HTMLDivElement;
let calls: { path: string; method: string; body?: unknown }[];

function mockApi(lists: V[][]) {
  calls = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      let body: unknown = undefined;
      if (init?.body instanceof FormData) body = Object.fromEntries(init.body.entries());
      else if (init?.body) body = JSON.parse(String(init.body));
      calls.push({ path, method, body });
      const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
      if (path === "/api/me") return ok({ id: "me" });
      if (path === "/api/me/villas") return ok(lists[Math.min(i++, lists.length - 1)].map((x) => ({ ownerId: "o", public: false, memberCount: 2, joinedAt: 0, ...x })));
      if (path === "/api/certs/photo") return ok({ certId: "c1", points: 20, duplicate: false, certifiedToday: true });
      if (path === "/api/certs/routine") return ok({ points: 10 });
      return ok({ ok: true });
    }),
  );
}
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
async function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<MemoryRouter initialEntries={["/certify"]}><Certify /></MemoryRouter>));
  await flush();
}
const boxes = () => Array.from(host.querySelectorAll<HTMLInputElement>('.villa-picks input[type="checkbox"]'));
const click = async (el: Element | null | undefined) => {
  await act(async () => (el as HTMLElement).click());
  await flush();
};

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("Certify — 올릴 빌라 [확정 — 기획자 결정, 2026-11-19]", () => {
  it("new_entry_all_checked_and_last_one_cannot_be_unchecked", async () => {
    mockApi([[v("A", "에이빌라"), v("B", "비빌라"), v("C", "씨빌라")]]);
    await mount();
    expect(boxes().map((b) => b.checked)).toEqual([true, true, true]);
    expect(boxes().some((b) => b.disabled)).toBe(false);
    await click(boxes()[0]);
    await click(boxes()[1]);
    expect(boxes().map((b) => b.checked)).toEqual([false, false, true]);
    // 마지막 하나는 끌 수 없다
    expect(boxes()[2].disabled).toBe(true);
    expect(host.querySelector(".villa-picks .hint")!.textContent).toContain("빌라를 하나 이상 골라야 해요");
    await click(boxes()[0]);
    expect(boxes()[2].disabled).toBe(false);
  });

  it("routine_and_photo_go_to_checked_villas_only", async () => {
    mockApi([[v("A", "에이빌라"), v("B", "비빌라")]]);
    await mount();
    await click(boxes()[1]);
    const ta = host.querySelector<HTMLTextAreaElement>("#routine")!;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
      set.call(ta, "스쿼트 5x5");
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await flush();
    expect(calls.find((c) => c.path === "/api/certs/routine")!.body).toEqual({ body: "스쿼트 5x5", villaIds: ["A"] });

    const input = host.querySelector<HTMLInputElement>("#photos")!;
    const file = new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    await flush();
    await flush();
    const photo = calls.find((c) => c.path === "/api/certs/photo")!;
    expect((photo.body as Record<string, unknown>).villaIds).toBe('["A"]');
  });

  it("single_villa_is_read_only_and_no_villa_is_a_note", async () => {
    mockApi([[v("A", "에이빌라")]]);
    await mount();
    expect(boxes()).toEqual([]);
    expect(host.querySelector(".villa-one")!.textContent).toBe("에이빌라에 올라가요");
    act(() => root.unmount());
    host.remove();
    mockApi([[]]);
    await mount();
    expect(host.querySelector(".villa-one")!.textContent).toBe("빌라 없이 내 기록으로만 남아요.");
    expect(host.querySelector(".add-more")).toBeNull();
  });

  it("posted_villas_are_marked_and_add_to_other_villa_later", async () => {
    mockApi([
      [v("A", "에이빌라", true), v("B", "비빌라")],
      [v("A", "에이빌라", true), v("B", "비빌라", true)],
    ]);
    await mount();
    expect(host.querySelector(".villa-pick .posted")!.textContent).toBe("오늘 올렸어요");
    const section = host.querySelector(".add-more")!;
    expect(section.querySelector("h2")!.textContent).toBe("다른 빌라에도 올리기");
    expect(Array.from(section.querySelectorAll(".add-more-row span")).map((s) => s.textContent)).toEqual(["비빌라"]);
    await click(section.querySelector('[aria-label="비빌라에도 올리기"]'));
    expect(calls).toContainEqual({ path: "/api/certs/today/villas", method: "POST", body: { villaIds: ["B"] } });
    expect(host.querySelector(".add-more .ok")!.textContent).toBe("비빌라에도 올렸어요. 포인트는 한 번만 받아요");
    expect(host.querySelectorAll(".add-more-row").length).toBe(0);
  });

  it("no_add_section_before_certifying_anywhere", async () => {
    mockApi([[v("A", "에이빌라"), v("B", "비빌라")]]);
    await mount();
    expect(host.querySelector(".add-more")).toBeNull();
  });
});
