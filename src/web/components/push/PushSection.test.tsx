// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectPushEnv, pushState, type PushEnv } from "../../push/client";
import { DEFAULT_PREFS, PushSection, PushSectionView } from "./PushSection";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPAD_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

function win(o: { ua: string; touch?: number; standalone?: boolean; sw?: boolean; push?: boolean; perm?: NotificationPermission | null }) {
  const nav: Record<string, unknown> = { userAgent: o.ua, maxTouchPoints: o.touch ?? 0, standalone: o.standalone };
  if (o.sw) nav.serviceWorker = {};
  return {
    navigator: nav as unknown as Navigator,
    matchMedia: () => ({ matches: false }),
    PushManager: o.push ? {} : undefined,
    Notification: o.perm === null || o.perm === undefined ? undefined : { permission: o.perm },
  };
}
const ENV = (p: Partial<PushEnv>): PushEnv => ({ supported: true, ios: false, standalone: false, permission: "default", ...p });

describe("detectPushEnv", () => {
  it("android_chrome_supported", () => {
    expect(detectPushEnv(win({ ua: ANDROID_UA, sw: true, push: true, perm: "default" }))).toEqual({ supported: true, ios: false, standalone: false, permission: "default" });
  });
  it("iphone_safari_tab_is_ios_not_standalone_unsupported", () => {
    expect(detectPushEnv(win({ ua: IPHONE_UA, sw: true, push: false, perm: null }))).toEqual({ supported: false, ios: true, standalone: false, permission: "unsupported" });
  });
  it("iphone_home_screen_app_is_supported", () => {
    expect(detectPushEnv(win({ ua: IPHONE_UA, sw: true, push: true, perm: "default", standalone: true }))).toMatchObject({ supported: true, ios: true, standalone: true });
  });
  it("ipad_looks_like_mac_with_touch", () => {
    expect(detectPushEnv(win({ ua: IPAD_UA, touch: 5 })).ios).toBe(true);
    expect(detectPushEnv(win({ ua: IPAD_UA, touch: 0 })).ios).toBe(false);
  });
});

describe("pushState", () => {
  it("missing_server_key_is_preparing_first", () => {
    expect(pushState(ENV({ supported: false, ios: true }), null, false)).toBe("preparing");
    expect(pushState(ENV({}), null, true)).toBe("preparing");
  });
  it("iphone_safari_tab_gets_home_screen_guide", () => {
    expect(pushState(ENV({ supported: false, ios: true, standalone: false }), "k", false)).toBe("ios-guide");
  });
  it("old_ios_home_screen_or_other_browser_is_unsupported", () => {
    expect(pushState(ENV({ supported: false, ios: true, standalone: true }), "k", false)).toBe("unsupported");
    expect(pushState(ENV({ supported: false }), "k", false)).toBe("unsupported");
  });
  it("denied_off_on", () => {
    expect(pushState(ENV({ permission: "denied" }), "k", true)).toBe("denied");
    expect(pushState(ENV({ permission: "default" }), "k", false)).toBe("off");
    expect(pushState(ENV({ permission: "granted" }), "k", false)).toBe("off");
    expect(pushState(ENV({ permission: "default" }), "k", true)).toBe("off");
    expect(pushState(ENV({ permission: "granted" }), "k", true)).toBe("on");
  });
});

const view = (state: Parameters<typeof PushSectionView>[0]["state"], prefs = DEFAULT_PREFS) =>
  renderToStaticMarkup(<PushSectionView state={state} prefs={prefs} />);

describe("설정 → 휴대폰 알림 화면", () => {
  it("off_shows_enable_button_and_quiet_hours", () => {
    const h = view("off");
    expect(h).toContain('data-push-state="off"');
    expect(h).toContain("휴대폰 알림");
    expect(h).toContain("이 기기에서 알림 켜기");
    expect(h).toContain("밤 11시부터 아침 8시까지는 보내지 않아요");
    expect(h).not.toContain('role="switch"');
  });

  it("on_shows_disable_and_four_category_switches", () => {
    const h = view("on", { ...DEFAULT_PREFS, villa: false });
    expect(h).toContain("이 기기에서 알림을 받고 있어요");
    expect(h).toContain(">끄기<");
    for (const l of ["응원 · 댓글", "빌라 소식", "입주 신청 · 대결", "운동 알림"]) expect(h).toContain(`aria-label="${l}"`);
    expect(h.match(/aria-checked="true"/g)).toHaveLength(3);
    expect(h).toMatch(/aria-checked="false" aria-label="빌라 소식"/);
    expect(h).toContain("시험 알림 보내기");
    expect(h).not.toContain("이 기기에서 알림 켜기");
  });

  it("ios_guide_explains_home_screen_steps", () => {
    const h = view("ios-guide");
    expect(h).toContain("홈 화면에 추가한 뒤 켤 수 있어요");
    expect(h).toContain("공유 버튼");
    expect(h).toContain("홈 화면에 추가</b>를 골라요");
    expect(h).toContain("iOS 16.4 이상");
    expect(h).not.toContain("<button");
  });

  it("denied_unsupported_preparing_have_no_buttons", () => {
    expect(view("denied")).toContain("알림을 허용한 뒤 다시 와 주세요");
    expect(view("unsupported")).toContain("이 브라우저에서는 휴대폰 알림을 받을 수 없어요");
    expect(view("preparing")).toContain("알림 준비 중이에요");
    for (const s of ["denied", "unsupported", "preparing"] as const) expect(view(s)).not.toContain("<button");
  });
});

describe("PushSection (불러오기)", () => {
  let root: Root;
  let host: HTMLDivElement;
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  async function mount(key: string | null) {
    vi.stubGlobal("fetch", vi.fn(async (path: string) => new Response(JSON.stringify(path === "/api/push/key" ? { publicKey: key } : { ok: true }), { status: 200 })));
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => root.render(<PushSection />));
    await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
  }

  it("missing_server_key_shows_preparing_without_crashing", async () => {
    await mount(null);
    expect(host.querySelector("[data-push-state]")?.getAttribute("data-push-state")).toBe("preparing");
    expect(host.textContent).toContain("알림 준비 중이에요");
  });

  it("jsdom_without_push_support_is_unsupported", async () => {
    await mount("BKEY");
    // jsdom 에는 서비스 워커 · PushManager 가 없다
    expect(host.querySelector("[data-push-state]")?.getAttribute("data-push-state")).toBe("unsupported");
  });
});
