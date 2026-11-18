// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventCenter, TOAST_MS } from "./EventCenter";
import { renderToStaticMarkup } from "react-dom/server";
import { CardArt, ToastArt } from "./celebrate/CelebrationArt";
import { CARD_TYPES, TOAST_TYPES } from "../events/plan";
import { AVATAR_OPTIONS } from "../../shared/avatar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Ev = { id: string; type: string; payload: Record<string, unknown>; createdAt: number };
const ev = (id: string, type: string, payload: Record<string, unknown> = {}): Ev => ({ id, type, payload, createdAt: 0 });
const SPEC = { skin: 2, hair: "bun", shirt: 0 };

let root: Root;
let host: HTMLDivElement;
let seen: string[][];

function mockApi(events: Ev[], me: Record<string, unknown> = { avatar: SPEC, certifiedToday: true }) {
  seen = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const body = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
      if (path === "/api/me") return body(me);
      if (path === "/api/events") return body(events.filter((e) => !seen.flat().includes(e.id)));
      if (path === "/api/events/seen") {
        seen.push(JSON.parse(String(init!.body)).ids);
        return body({ ok: true });
      }
      return new Response("{}", { status: 404 });
    }),
  );
}

async function mount(now = () => Date.parse("2026-11-18T12:00:00+09:00")) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <EventCenter now={now} />
      </MemoryRouter>,
    );
  });
  // fetch 체인이 끝날 때까지
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
const dialog = () => host.querySelector('[role="dialog"]');
const toasts = () => Array.from(host.querySelectorAll('[role="status"]')).map((t) => t.textContent);
const click = async (el: Element | null) => {
  await act(async () => {
    (el as HTMLElement).click();
    await new Promise((r) => setTimeout(r, 0));
  });
};

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {}
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("EventCenter", () => {
  it("shows_cards_one_at_a_time_then_toasts", async () => {
    mockApi([
      ev("w", "welcome", { villaName: "땀빌라" }),
      ev("c", "certified", { points: 20 }),
      ev("f", "floor_up", { floor: 2, streak: 7 }),
      ev("b", "bought", { itemName: "러그" }),
    ]);
    await mount();
    expect(dialog()?.textContent).toContain("땀빌라에 입주했어요");
    expect(dialog()?.getAttribute("aria-modal")).toBe("true");
    // 버튼에 포커스
    expect(document.activeElement?.textContent).toBe("좋아요");
    // 카드가 떠 있는 동안 토스트는 기다린다
    expect(toasts()).toEqual([]);
    expect(seen).toEqual([]);

    await click(host.querySelector(".cel-card button"));
    expect(seen).toEqual([["w"]]);
    expect(dialog()?.textContent).toContain("7일 연속! 2층으로 올라왔어요");

    await click(host.querySelector(".cel-card button"));
    expect(dialog()).toBeNull();
    expect(toasts()).toEqual(["불이 켜졌어요 +20P", "러그를 샀어요"]);
    // 토스트는 보여 줄 때 본 것으로
    expect(seen.flat().sort()).toEqual(["b", "c", "f", "w"]);
  });

  it("toasts_hide_after_3s_or_on_tap", async () => {
    mockApi([ev("c", "certified", { points: 20 }), ev("s", "streak6", { streak: 6 })]);
    await mount();
    expect(toasts()).toHaveLength(2);
    await click(host.querySelectorAll('[role="status"]')[1]);
    expect(toasts()).toEqual(["불이 켜졌어요 +20P"]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, TOAST_MS + 50));
    });
    expect(toasts()).toEqual([]);
  });

  it("does_not_show_the_same_event_twice_on_refocus", async () => {
    mockApi([ev("w", "welcome", { villaName: "빌라" })]);
    await mount();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      await new Promise((r) => setTimeout(r, 0));
    });
    await click(host.querySelector(".cel-card button"));
    expect(dialog()).toBeNull();
  });

  it("nothing_when_logged_out", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "로그인이 필요해요" }), { status: 401 })));
    await mount();
    expect(dialog()).toBeNull();
    expect(toasts()).toEqual([]);
  });

  it("night_reminder_once_per_day_after_21_kst", async () => {
    const night = () => Date.parse("2026-11-18T21:30:00+09:00");
    mockApi([], { avatar: SPEC, certifiedToday: false });
    await mount(night);
    expect(toasts()).toEqual(["오늘 아직 불이 꺼져 있어요"]);
    // 서버로 보내지 않는다
    expect(seen).toEqual([]);
    act(() => root.unmount());
    host.remove();
    await mount(night);
    expect(toasts()).toEqual([]);
  });
});

describe("celebration art", () => {
  it("every_card_and_toast_draws_the_viewers_own_avatar", () => {
    const shirt = AVATAR_OPTIONS.shirt[SPEC.shirt];
    const skin = AVATAR_OPTIONS.skin[SPEC.skin];
    for (const type of CARD_TYPES) {
      const h = renderToStaticMarkup(<CardArt type={type} spec={SPEC} />);
      expect(h, type).toContain('data-hair="bun"');
      expect(h, type).toContain(shirt);
      expect(h, type).toContain(skin);
      expect(h, type).not.toContain("<image");
    }
    for (const type of TOAST_TYPES) {
      const h = renderToStaticMarkup(<ToastArt type={type} spec={SPEC} />);
      expect(h, type).toContain('data-hair="bun"');
    }
  });

  it("uses_new_faces_and_props", () => {
    const has = (type: (typeof CARD_TYPES)[number], ...parts: string[]) => {
      const h = renderToStaticMarkup(<CardArt type={type} spec={SPEC} />);
      for (const p of parts) expect(h, `${type} ${p}`).toContain(p);
    };
    has("streak7", 'data-face="tears"', 'data-part="trophy"', 'data-part="confetti"');
    has("floor_up", 'data-part="plus-one"', 'data-part="arrow"');
    has("penthouse_in", 'data-face="cool"', 'data-part="sunglasses"', 'data-part="box"', 'data-part="plant"');
    has("penthouse_out", 'data-face="shocked"', 'data-part="crown"');
    has("floor_down", 'data-face="sad"', 'data-part="stairs"', 'data-part="box"');
    has("welcome", 'data-face="shy"');
  });

  it("friend_joined_shows_the_friends_avatar", () => {
    const friend = { skin: 3, hair: "long", shirt: 6 };
    const h = renderToStaticMarkup(<ToastArt type="friend_joined" spec={SPEC} friend={friend} />);
    expect(h).toContain('data-hair="long"');
    expect(h).toContain(AVATAR_OPTIONS.shirt[6]);
  });
});
