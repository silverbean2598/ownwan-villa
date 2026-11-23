// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DISMISS_DAYS, DISMISS_KEY, createInstallStore, detectInstallEnv, installState, isDismissed, kakaoExternalHref, rememberDismiss,
  type InstallEnv,
} from "../../install/install";
import { InstallCard, InstallSection, InstallSectionView, installKind } from "./InstallCard";
import { IosGuide } from "../push/PushSection";
import { api, ApiError, OFFLINE_MESSAGE } from "../../api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const UA = {
  android: "Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  ipad: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  kakaoIos: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.9.5",
  kakaoAndroid: "Mozilla/5.0 (Linux; Android 14; SM-S921N Build/UP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0 Mobile Safari/537.36 KAKAOTALK/10.9.5 (INAPP)",
  instagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0",
};
const win = (ua: string, opts: { standalone?: boolean; displayStandalone?: boolean; touch?: number } = {}) => ({
  navigator: { userAgent: ua, maxTouchPoints: opts.touch ?? 0, standalone: opts.standalone },
  matchMedia: (q: string) => ({ matches: !!opts.displayStandalone && q === "(display-mode: standalone)" }),
});
const ENV = (e: Partial<InstallEnv> = {}): InstallEnv => ({ standalone: false, ios: false, inApp: null, ...e });

/** 크롬이 보내는 beforeinstallprompt 흉내 */
function fakePrompt(outcome: "accepted" | "dismissed") {
  const ev = new Event("beforeinstallprompt", { cancelable: true }) as Event & Record<string, unknown>;
  ev.prompt = vi.fn(async () => {});
  ev.userChoice = Promise.resolve({ outcome, platform: "web" });
  return ev as unknown as Event & { prompt: ReturnType<typeof vi.fn> };
}

/** 메모리 저장소 (throws 면 읽기 · 쓰기 모두 실패) */
function memStorage(throws = false) {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => {
      if (throws) throw new Error("SecurityError");
      return m.get(k) ?? null;
    },
    setItem: (k: string, v: string) => {
      if (throws) throw new Error("QuotaExceededError");
      m.set(k, v);
    },
    map: m,
  };
}

describe("detectInstallEnv · installState", () => {
  it("detects_platforms_and_in_app_browsers", () => {
    expect(detectInstallEnv(win(UA.android))).toEqual({ standalone: false, ios: false, inApp: null });
    expect(detectInstallEnv(win(UA.iphone))).toEqual({ standalone: false, ios: true, inApp: null });
    expect(detectInstallEnv(win(UA.ipad, { touch: 5 })).ios).toBe(true);
    expect(detectInstallEnv(win(UA.kakaoIos))).toEqual({ standalone: false, ios: true, inApp: "kakao" });
    expect(detectInstallEnv(win(UA.kakaoAndroid)).inApp).toBe("kakao");
    expect(detectInstallEnv(win(UA.instagram)).inApp).toBe("other");
  });

  it("standalone_from_display_mode_or_navigator_standalone", () => {
    expect(detectInstallEnv(win(UA.android, { displayStandalone: true })).standalone).toBe(true);
    expect(detectInstallEnv(win(UA.iphone, { standalone: true })).standalone).toBe(true);
  });

  it("state_priority", () => {
    expect(installState(ENV({ standalone: true }), true, false)).toBe("installed");
    expect(installState(ENV(), false, true)).toBe("installed");
    expect(installState(ENV({ inApp: "kakao", ios: true }), true, false)).toBe("kakao");
    expect(installState(ENV({ inApp: "other" }), false, false)).toBe("inapp");
    expect(installState(ENV(), true, false)).toBe("prompt");
    expect(installState(ENV({ ios: true }), false, false)).toBe("ios-guide");
    expect(installState(ENV(), false, false)).toBe("manual");
  });

  it("kakao_external_link_keeps_full_url", () => {
    expect(kakaoExternalHref("https://ownwan.example/villa?x=1")).toBe("kakaotalk://web/openExternal?url=https%3A%2F%2Fownwan.example%2Fvilla%3Fx%3D1");
  });
});

describe("닫기 기억 (14일)", () => {
  const now = Date.parse("2026-11-20T12:00:00+09:00");
  it("remembers_for_14_days", () => {
    const s = memStorage();
    expect(isDismissed(now, s)).toBe(false);
    rememberDismiss(now, s);
    expect(s.map.get(DISMISS_KEY)).toBe(String(now));
    expect(isDismissed(now + (DISMISS_DAYS - 1) * 86400000, s)).toBe(true);
    expect(isDismissed(now + DISMISS_DAYS * 86400000, s)).toBe(false);
  });
  it("storage_throwing_is_ignored", () => {
    const s = memStorage(true);
    expect(() => rememberDismiss(now, s)).not.toThrow();
    expect(isDismissed(now, s)).toBe(false);
    expect(isDismissed(now, null)).toBe(false);
  });
  it("garbage_value_is_not_dismissed", () => {
    const s = memStorage();
    s.setItem(DISMISS_KEY, "abc");
    expect(isDismissed(now, s)).toBe(false);
  });
});

let root: Root | null = null;
let host: HTMLDivElement;

async function mount(el: JSX.Element) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(el));
}
const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const card = () => host.querySelector(".install-card");

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
});

describe("아파트 화면 → 앱처럼 쓰기 카드", () => {
  const now = () => Date.parse("2026-11-20T12:00:00+09:00");

  it("android_shows_after_beforeinstallprompt_and_prompts", async () => {
    const target = new EventTarget();
    const store = createInstallStore(target as unknown as Window);
    const storage = memStorage();
    await mount(<InstallCard store={store} env={ENV()} now={now} storage={storage} />);
    // 이벤트 전: 설치 버튼이 없으니 카드도 없다 (manual 은 설정에서만)
    expect(card()).toBeNull();

    const ev = fakePrompt("accepted");
    await act(async () => target.dispatchEvent(ev));
    expect(ev.defaultPrevented).toBe(true);
    expect(card()?.getAttribute("data-install-state")).toBe("prompt");
    const btn = Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "홈 화면에 추가")!;
    expect(btn).toBeTruthy();

    await act(async () => btn.click());
    await tick();
    expect(ev.prompt).toHaveBeenCalledTimes(1);
    // 설치했으면 카드가 사라지고, 닫기 기록은 남기지 않는다
    expect(card()).toBeNull();
    expect(storage.map.has(DISMISS_KEY)).toBe(false);
    expect(store.get()).toEqual({ canPrompt: false, installed: true });
  });

  it("android_prompt_dismissed_hides_and_remembers", async () => {
    const target = new EventTarget();
    const store = createInstallStore(target as unknown as Window);
    const storage = memStorage();
    await mount(<InstallCard store={store} env={ENV()} now={now} storage={storage} />);
    await act(async () => target.dispatchEvent(fakePrompt("dismissed")));
    await act(async () => (host.querySelector(".install-btn") as HTMLButtonElement).click());
    await tick();
    expect(card()).toBeNull();
    expect(storage.map.get(DISMISS_KEY)).toBe(String(now()));
  });

  it("appinstalled_hides_card", async () => {
    const target = new EventTarget();
    const store = createInstallStore(target as unknown as Window);
    await mount(<InstallCard store={store} env={ENV()} now={now} storage={memStorage()} />);
    await act(async () => target.dispatchEvent(fakePrompt("accepted")));
    expect(card()).not.toBeNull();
    await act(async () => target.dispatchEvent(new Event("appinstalled")));
    expect(card()).toBeNull();
  });

  it("close_button_remembers_dismissal_and_next_mount_stays_hidden", async () => {
    const store = createInstallStore(new EventTarget() as unknown as Window);
    const storage = memStorage();
    await mount(<InstallCard store={store} env={ENV({ ios: true })} now={now} storage={storage} />);
    expect(card()?.getAttribute("data-install-state")).toBe("ios-guide");
    await act(async () => (host.querySelector(".install-close") as HTMLButtonElement).click());
    expect(card()).toBeNull();
    expect(storage.map.get(DISMISS_KEY)).toBe(String(now()));

    act(() => root?.unmount());
    host.remove();
    await mount(<InstallCard store={store} env={ENV({ ios: true })} now={now} storage={storage} />);
    expect(card()).toBeNull();
  });

  it("close_works_even_when_storage_throws", async () => {
    const store = createInstallStore(new EventTarget() as unknown as Window);
    await mount(<InstallCard store={store} env={ENV({ ios: true })} now={now} storage={memStorage(true)} />);
    expect(card()).not.toBeNull();
    await act(async () => (host.querySelector(".install-close") as HTMLButtonElement).click());
    expect(card()).toBeNull();
  });

  it("iphone_safari_shows_share_guide_with_icon", async () => {
    const store = createInstallStore(new EventTarget() as unknown as Window);
    await mount(<InstallCard store={store} env={ENV({ ios: true })} now={now} storage={memStorage()} />);
    expect(card()?.textContent).toContain("공유 버튼");
    expect(card()?.textContent).toContain("홈 화면에 추가");
    expect(card()?.querySelector("svg.share-icon")).not.toBeNull();
    expect(card()?.querySelector(".install-btn")).toBeNull();
  });

  it("kakao_in_app_suggests_safari_on_iphone_and_other_browser_on_android", async () => {
    const store = createInstallStore(new EventTarget() as unknown as Window);
    await mount(<InstallCard store={store} env={detectInstallEnv(win(UA.kakaoIos))} now={now} storage={memStorage()} />);
    expect(card()?.getAttribute("data-install-state")).toBe("kakao");
    const a = card()?.querySelector("a.install-btn") as HTMLAnchorElement;
    expect(a.textContent).toBe("Safari로 열기");
    expect(a.getAttribute("href")).toMatch(/^kakaotalk:\/\/web\/openExternal\?url=/);
    expect(card()?.textContent).not.toContain("공유 버튼");

    act(() => root?.unmount());
    host.remove();
    await mount(<InstallCard store={store} env={detectInstallEnv(win(UA.kakaoAndroid))} now={now} storage={memStorage()} />);
    expect((card()?.querySelector("a.install-btn") as HTMLAnchorElement).textContent).toBe("다른 브라우저로 열기");
  });

  it("standalone_never_shows_even_with_prompt", async () => {
    const target = new EventTarget();
    const store = createInstallStore(target as unknown as Window);
    await mount(<InstallCard store={store} env={detectInstallEnv(win(UA.android, { displayStandalone: true }))} now={now} storage={memStorage()} />);
    await act(async () => target.dispatchEvent(fakePrompt("accepted")));
    expect(card()).toBeNull();

    act(() => root?.unmount());
    host.remove();
    await mount(<InstallCard store={store} env={detectInstallEnv(win(UA.iphone, { standalone: true }))} now={now} storage={memStorage()} />);
    expect(card()).toBeNull();
  });

  it("event_before_mount_is_kept", async () => {
    const target = new EventTarget();
    const store = createInstallStore(target as unknown as Window);
    target.dispatchEvent(fakePrompt("accepted"));
    await mount(<InstallCard store={store} env={ENV()} now={now} storage={memStorage()} />);
    expect(card()?.getAttribute("data-install-state")).toBe("prompt");
  });
});

describe("설정 → 앱처럼 쓰기 (3가지 상태)", () => {
  const view = (state: Parameters<typeof InstallSectionView>[0]["state"], env = ENV()) =>
    renderToStaticMarkup(<InstallSectionView state={state} env={env} href="https://x.test/settings" />);

  it("kinds", () => {
    expect(installKind("prompt")).toBe("ready");
    expect(installKind("installed")).toBe("done");
    for (const s of ["ios-guide", "kakao", "inapp", "manual"] as const) expect(installKind(s)).toBe("guide");
  });

  it("ready_done_guide_labels", () => {
    const ready = view("prompt");
    expect(ready).toContain('id="install"');
    expect(ready).toContain("설치 가능");
    expect(ready).toContain("홈 화면에 추가</button>");

    const done = view("installed", ENV({ standalone: true }));
    expect(done).toContain("이미 설치됨");
    expect(done).toContain("홈 화면 앱으로 쓰고 있어요");
    expect(done).not.toContain("<button");

    const guide = view("ios-guide", ENV({ ios: true }));
    expect(guide).toContain("이 브라우저는 안내만");
    expect(guide).toContain("공유 버튼");

    expect(view("manual")).toContain("브라우저 메뉴");
    expect(view("kakao", ENV({ inApp: "kakao", ios: true }))).toContain("Safari로 열기");
    expect(view("inapp", ENV({ inApp: "other" }))).toContain("다른 브라우저로 열기");
  });

  it("section_is_always_shown_and_installs_from_button", async () => {
    const target = new EventTarget();
    const store = createInstallStore(target as unknown as Window);
    await mount(<InstallSection store={store} env={ENV()} />);
    expect(host.querySelector("#install")?.getAttribute("data-install-kind")).toBe("guide");
    const ev = fakePrompt("accepted");
    await act(async () => target.dispatchEvent(ev));
    expect(host.querySelector("#install")?.getAttribute("data-install-kind")).toBe("ready");
    await act(async () => (host.querySelector(".install-btn") as HTMLButtonElement).click());
    await tick();
    expect(ev.prompt).toHaveBeenCalled();
    expect(host.querySelector("#install")?.getAttribute("data-install-kind")).toBe("done");
    expect(host.textContent).toContain("홈 화면에 추가했어요");
  });
});

describe("함께 바뀐 것", () => {
  it("push_ios_guide_links_to_install_section", () => {
    expect(renderToStaticMarkup(<IosGuide />)).toContain('href="#install"');
  });

  it("api_network_failure_becomes_friendly_offline_error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const err = (await api("/api/me").catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(0);
    expect(err.message).toBe(OFFLINE_MESSAGE);

    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("aborted", "AbortError"); }));
    expect(((await api("/api/me").catch((e: unknown) => e)) as Error).name).toBe("AbortError");
    vi.unstubAllGlobals();
  });
});
