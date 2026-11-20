import { useEffect, useState } from "react";

/**
 * 앱처럼 쓰기 (홈 화면에 추가). 오프라인 캐시는 하지 않고, 설치 안내만 한다
 * - 안드로이드 크롬 · 엣지: beforeinstallprompt 를 받아 두었다가 [홈 화면에 추가] 버튼에서 prompt()
 * - 아이폰 사파리: 직접 띄울 수 없다 → "공유 버튼 → 홈 화면에 추가" 안내
 * - 카카오톡 · 인스타그램 같은 앱 안 브라우저: 설치가 안 된다 → 다른 브라우저로 열도록 안내
 * - 이미 홈 화면 앱으로 열었으면 아무것도 보여 주지 않는다
 */

/** 크롬이 주는 설치 이벤트 (표준 DOM 타입에는 아직 없다) */
export type InstallPromptEvent = Event & {
  prompt: () => Promise<unknown>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>;
};

export type InstallEnv = {
  /** 홈 화면에 추가한 앱으로 열었다 */
  standalone: boolean;
  /** 아이폰 · 아이패드 */
  ios: boolean;
  /** 설치할 수 없는 앱 안 브라우저 */
  inApp: "kakao" | "other" | null;
};

/**
 * 앱처럼 쓰기 칸의 상태
 * - installed: 이미 홈 화면 앱으로 열었거나 방금 설치했다
 * - prompt: 버튼 한 번으로 설치 창을 띄울 수 있다 (안드로이드 크롬 등)
 * - ios-guide: 아이폰 → 공유 버튼 → 홈 화면에 추가 안내
 * - kakao: 카카오톡 안 브라우저 → Safari / 다른 브라우저로 열기
 * - inapp: 그 밖의 앱 안 브라우저 → 다른 브라우저로 열기 안내
 * - manual: 브라우저 메뉴에서 직접 추가하도록 안내만 (삼성 인터넷 · 데스크톱 등)
 */
export type InstallState = "installed" | "prompt" | "ios-guide" | "kakao" | "inapp" | "manual";

type WinLike = {
  navigator: { userAgent?: string; maxTouchPoints?: number; standalone?: boolean };
  matchMedia?: (q: string) => { matches: boolean };
};

// 설치가 안 되는 앱 안 브라우저 (카카오톡은 따로 다룬다)
const IN_APP = /Instagram|FBAN|FBAV|FB_IAB|Line\/|NAVER\(inapp|DaumApps|everytimeApp|; wv\)/i;

export function detectInstallEnv(w: WinLike = window as unknown as WinLike): InstallEnv {
  const nav = w.navigator;
  const ua = nav.userAgent || "";
  // 아이패드 사파리는 맥처럼 보인다: 터치가 되는 맥 = 아이패드
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1);
  const standalone =
    nav.standalone === true ||
    !!w.matchMedia?.("(display-mode: standalone)").matches ||
    !!w.matchMedia?.("(display-mode: fullscreen)").matches;
  const inApp = /KAKAOTALK/i.test(ua) ? "kakao" : IN_APP.test(ua) ? "other" : null;
  return { standalone, ios, inApp };
}

export function installState(env: InstallEnv, canPrompt: boolean, installed: boolean): InstallState {
  if (env.standalone || installed) return "installed";
  if (env.inApp === "kakao") return "kakao";
  if (env.inApp) return "inapp";
  if (canPrompt) return "prompt";
  if (env.ios) return "ios-guide";
  return "manual";
}

/** 빌라 화면 카드는 버튼이나 꼭 필요한 안내가 있을 때만 (manual 은 설정에서만 보여 준다) */
export const CARD_STATES: InstallState[] = ["prompt", "ios-guide", "kakao", "inapp"];

/** 카카오톡 안 브라우저에서 바깥 브라우저(아이폰은 Safari)로 같은 주소를 여는 카카오톡 주소 */
export function kakaoExternalHref(url: string) {
  return `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
}

/* ── 카드 닫기 기억 (14일). 저장소가 막힌 브라우저에서도 화면은 그대로 동작해야 한다 ── */

export const DISMISS_KEY = "ownwan.install.dismissedAt";
export const DISMISS_DAYS = 14;
const DAY = 24 * 60 * 60 * 1000;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isDismissed(now = Date.now(), storage: StorageLike | null = defaultStorage()): boolean {
  try {
    const at = Number(storage?.getItem(DISMISS_KEY));
    return Number.isFinite(at) && at > 0 && now - at < DISMISS_DAYS * DAY;
  } catch {
    return false;
  }
}

export function rememberDismiss(now = Date.now(), storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(DISMISS_KEY, String(now));
  } catch {
    // 저장이 안 되면 이번 화면에서만 숨긴다
  }
}

/* ── 설치 이벤트 저장소: 이벤트는 화면이 뜨기 전에 올 수 있어서 앱 시작할 때 듣기 시작한다 ── */

export type InstallSnapshot = { canPrompt: boolean; installed: boolean };

export type InstallStore = {
  get: () => InstallSnapshot;
  subscribe: (fn: () => void) => () => void;
  /** 설치 창 띄우기. 결과: accepted(설치) · dismissed(닫음) · unavailable(띄울 수 없음) */
  prompt: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

export function createInstallStore(w: Pick<Window, "addEventListener"> = window): InstallStore {
  let deferred: InstallPromptEvent | null = null;
  let snap: InstallSnapshot = { canPrompt: false, installed: false };
  const subs = new Set<() => void>();
  const set = (next: Partial<InstallSnapshot>) => {
    snap = { ...snap, ...next };
    subs.forEach((fn) => fn());
  };

  w.addEventListener("beforeinstallprompt", (e) => {
    // 크롬 기본 안내줄 대신 우리 카드에서 띄운다
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    set({ canPrompt: true });
  });
  w.addEventListener("appinstalled", () => {
    deferred = null;
    set({ canPrompt: false, installed: true });
  });

  return {
    get: () => snap,
    subscribe: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    async prompt() {
      const ev = deferred;
      if (!ev) return "unavailable";
      // 한 이벤트로는 한 번만 띄울 수 있다
      deferred = null;
      try {
        await ev.prompt();
        const { outcome } = await ev.userChoice;
        set(outcome === "accepted" ? { canPrompt: false, installed: true } : { canPrompt: false });
        return outcome;
      } catch {
        set({ canPrompt: false });
        return "unavailable";
      }
    },
  };
}

let shared: InstallStore | null = null;

/** 앱 전체에서 하나만 (main.tsx 에서 가장 먼저 부른다) */
export function installStore(): InstallStore {
  shared ??= createInstallStore();
  return shared;
}

/** 지금 설치 상태 (설치 이벤트가 오거나 설치가 끝나면 다시 그린다) */
export function useInstall(store: InstallStore = installStore(), env?: InstallEnv) {
  const [snap, setSnap] = useState(store.get);
  const [e] = useState(() => env ?? detectInstallEnv());
  useEffect(() => {
    setSnap(store.get());
    return store.subscribe(() => setSnap(store.get()));
  }, [store]);
  return { state: installState(e, snap.canPrompt, snap.installed), env: e, prompt: store.prompt };
}
