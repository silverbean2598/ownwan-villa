// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomBoard } from "./RoomBoard";
import { timeAgo } from "../components/Cheer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const AV = { skin: 0, hair: "short", shirt: 0 };
const NOW = Date.now();
const villa = {
  id: "v1",
  name: "땀빌라",
  ownerId: "me",
  members: [
    { userId: "me", nickname: "나", sport: "gym", avatar: AV, placements: [] },
    { userId: "b", nickname: "비비", sport: "running", avatar: AV, placements: [] },
  ],
};
const item = (id: string, extra: Record<string, unknown> = {}) => ({
  id, kind: "routine", day: "2026-11-18", hidden: false, createdAt: NOW - 1000, body: "스쿼트", cheerCount: 1, cheeredByMe: false, commentCount: 2, ...extra,
});

let root: Root;
let host: HTMLDivElement;
let calls: { path: string; method: string; body?: unknown }[];
type Handler = (path: string, method: string) => Response | undefined;

function mockApi(boardOf: string, items: unknown[], extra?: Handler) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ path, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const body = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
      const r = extra?.(path, method);
      if (r) return r;
      if (path === "/api/me") return body({ id: "me" });
      if (path === "/api/villas/mine") return body(villa);
      if (path.startsWith(`/api/users/${boardOf}/board`)) return body(items);
      if (path === "/api/certs/c1/comments" && method === "GET")
        return body([
          { id: "m1", userId: "me", nickname: "나", avatar: AV, body: "멋져요", createdAt: NOW - 3 * 60_000, canDelete: true },
          { id: "m2", userId: "b", nickname: "비비", avatar: AV, body: "고마워요", createdAt: NOW - 30_000, canDelete: false },
        ]);
      if (path === "/api/certs/c1/comments" && method === "POST")
        return body({ id: "m3", userId: "me", nickname: "나", avatar: AV, body: "또 와요", createdAt: NOW, canDelete: true });
      if (path === "/api/certs/c1/cheer") return body({ cheered: true, count: 2 });
      return body({ ok: true });
    }),
  );
}

const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
async function mount(userId: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[`/room/${userId}/board`]}>
        <Routes>
          <Route path="/room/:userId/board" element={<RoomBoard />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await flush();
  await flush();
}
const byLabel = (label: string) => host.querySelector(`[aria-label="${label}"]`) as HTMLButtonElement | null;
const click = async (el: Element | null) => {
  await act(async () => (el as HTMLElement).click());
  await flush();
};

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("RoomBoard 응원 · 댓글", () => {
  it("heart_toggles_optimistically", async () => {
    let resolve!: (r: Response) => void;
    mockApi("b", [item("c1")]);
    // 응원 응답을 붙잡아 두고 낙관적 갱신을 먼저 확인한다
    const orig = fetch as unknown as (p: string, i?: RequestInit) => Promise<Response>;
    vi.stubGlobal("fetch", vi.fn((p: string, i?: RequestInit) => (p === "/api/certs/c1/cheer" ? new Promise<Response>((r) => (resolve = r)) : orig(p, i))));
    await mount("b");
    const heart = byLabel("응원하기")!;
    expect(heart.getAttribute("aria-pressed")).toBe("false");
    expect(heart.textContent).toContain("1");
    await click(heart);
    const on = byLabel("응원 취소")!;
    expect(on.getAttribute("aria-pressed")).toBe("true");
    expect(on.textContent).toContain("2");
    await act(async () => resolve(new Response(JSON.stringify({ cheered: true, count: 5 }), { status: 200 })));
    await flush();
    expect(byLabel("응원 취소")!.textContent).toContain("5");
  });

  it("heart_rolls_back_on_error", async () => {
    mockApi("b", [item("c1")], (path) =>
      path === "/api/certs/c1/cheer" ? new Response(JSON.stringify({ error: "같은 빌라 입주민만 응원할 수 있어요" }), { status: 403 }) : undefined,
    );
    await mount("b");
    await click(byLabel("응원하기"));
    const heart = byLabel("응원하기")!;
    expect(heart.getAttribute("aria-pressed")).toBe("false");
    expect(heart.textContent).toContain("1");
    expect(host.textContent).toContain("같은 빌라 입주민만 응원할 수 있어요");
  });

  it("heart_disabled_on_my_items", async () => {
    mockApi("me", [item("c1")]);
    await mount("me");
    const heart = host.querySelector(".cheer-heart") as HTMLButtonElement;
    expect(heart.disabled).toBe(true);
  });

  it("thread_lists_comments_and_posts", async () => {
    mockApi("b", [item("c1")]);
    await mount("b");
    await click(byLabel("댓글 2개 보기"));
    const thread = host.querySelector(".cheer-thread")!;
    expect(thread.textContent).toContain("멋져요");
    expect(thread.textContent).toContain("3분 전");
    expect(thread.textContent).toContain("비비");
    expect(thread.querySelectorAll(".comment-del").length).toBe(1);
    const input = thread.querySelector("input")!;
    expect(input.maxLength).toBe(100);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "또 와요");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(thread.textContent).toContain("4/100");
    await click(Array.from(thread.querySelectorAll("button")).find((b) => b.textContent === "보내기")!);
    expect(calls.find((c) => c.method === "POST" && c.path === "/api/certs/c1/comments")?.body).toEqual({ body: "또 와요" });
    expect(host.querySelector(".cheer-thread")!.textContent).toContain("또 와요");
    expect(byLabel("댓글 3개 보기")).not.toBeNull();
  });

  it("delete_comment", async () => {
    mockApi("b", [item("c1")]);
    await mount("b");
    await click(byLabel("댓글 2개 보기"));
    await click(host.querySelector(".comment-del"));
    expect(calls.some((c) => c.method === "DELETE" && c.path === "/api/comments/m1")).toBe(true);
    expect(host.querySelector(".cheer-thread")!.textContent).not.toContain("멋져요");
    expect(byLabel("댓글 1개 보기")).not.toBeNull();
  });

  it("empty_thread", async () => {
    mockApi("b", [item("c2", { commentCount: 0 })], (path, method) =>
      path === "/api/certs/c2/comments" && method === "GET" ? new Response("[]", { status: 200 }) : undefined,
    );
    await mount("b");
    await click(byLabel("댓글 0개 보기"));
    expect(host.querySelector(".cheer-thread")!.textContent).toContain("첫 응원 댓글을 남겨 보세요");
  });

  it("hidden_items_have_no_cheer_row", async () => {
    mockApi("b", [item("c1", { hidden: true, body: undefined, cheerCount: 0, commentCount: 0 })]);
    await mount("b");
    expect(host.querySelector(".cheer-bar")).toBeNull();
  });
});

describe("timeAgo", () => {
  it("korean_relative", () => {
    const t = Date.parse("2026-11-18T12:00:00+09:00");
    expect(timeAgo(t - 10_000, t)).toBe("방금");
    expect(timeAgo(t - 3 * 60_000, t)).toBe("3분 전");
    expect(timeAgo(t - 5 * 3600_000, t)).toBe("5시간 전");
    expect(timeAgo(t - 2 * 86400_000, t)).toBe("2일 전");
    expect(timeAgo(Date.parse("2026-10-01T12:00:00+09:00"), t)).toBe("10월 1일");
  });
});
