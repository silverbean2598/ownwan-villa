import { api } from "../api";

/**
 * 휴대폰 푸시 알림 (브라우저 쪽). 안드로이드 크롬은 바로, 아이폰은 사파리에서 "홈 화면에 추가"한 앱(iOS 16.4+)에서만 된다
 */

export type PushPrefs = { cheer: boolean; villa: boolean; apply: boolean; reminder: boolean };
export type PushCategory = keyof PushPrefs;

/** 이 기기 · 브라우저에서 알 수 있는 것 */
export type PushEnv = {
  /** 서비스 워커 · PushManager · Notification 이 모두 있다 */
  supported: boolean;
  /** 아이폰 · 아이패드 */
  ios: boolean;
  /** 홈 화면에 추가한 앱으로 열었다 */
  standalone: boolean;
  permission: NotificationPermission | "unsupported";
};

/**
 * 설정 → 휴대폰 알림 칸의 상태
 * - preparing: 서버에 키가 없다 ("알림 준비 중이에요")
 * - ios-guide: 아이폰 사파리(홈 화면 앱 아님) → 홈 화면에 추가하는 방법 안내
 * - unsupported: 이 브라우저는 안 된다 / denied: 알림을 차단했다
 * - off: 켤 수 있다 / on: 이 기기에서 받고 있다
 */
export type PushState = "loading" | "preparing" | "ios-guide" | "unsupported" | "denied" | "off" | "on";

type WinLike = {
  navigator: Navigator & { standalone?: boolean };
  matchMedia?: (q: string) => { matches: boolean };
  Notification?: { permission: NotificationPermission };
  PushManager?: unknown;
};

export function detectPushEnv(w: WinLike = window as unknown as WinLike): PushEnv {
  const nav = w.navigator;
  const ua = nav.userAgent || "";
  // 아이패드 사파리는 맥처럼 보인다: 터치가 되는 맥 = 아이패드
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1);
  const standalone = nav.standalone === true || !!w.matchMedia?.("(display-mode: standalone)").matches;
  const supported = "serviceWorker" in nav && !!w.PushManager && !!w.Notification;
  return { supported, ios, standalone, permission: w.Notification ? w.Notification.permission : "unsupported" };
}

export function pushState(env: PushEnv, publicKey: string | null, subscribed: boolean): PushState {
  if (!publicKey) return "preparing";
  if (!env.supported) return env.ios && !env.standalone ? "ios-guide" : "unsupported";
  if (env.permission === "denied") return "denied";
  return subscribed && env.permission === "granted" ? "on" : "off";
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const s = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
}

/** 이 기기의 지금 구독 (서비스 워커를 등록한 적이 없으면 null) */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return reg ? reg.pushManager.getSubscription() : null;
}

/**
 * 알림 켜기. 꼭 버튼 누른 처리 안에서 바로 불러야 한다 (아이폰은 사용자 동작 직후에만 권한을 물을 수 있다)
 * 결과: on(켜짐) · denied(차단) · dismissed(물음을 닫음)
 */
export async function enablePush(publicKey: string): Promise<"on" | "denied" | "dismissed"> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "dismissed";
  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const key = keyBytes(publicKey);
  let sub = await reg.pushManager.getSubscription();
  // 서버 키가 바뀌었으면 새로 구독한다
  if (sub && !sameKey(sub.options.applicationServerKey, key)) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub.toJSON()) });
  return "on";
}

/** 이미 켜진 기기: 서버에도 이 계정으로 저장돼 있게 한 번 더 알린다 (다른 계정으로 로그인했던 기기 등) */
export async function syncSubscription(sub: PushSubscription): Promise<void> {
  await api("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub.toJSON()) });
}

/** 이 기기 알림 끄기: 서버에서 지우고 브라우저 구독도 푼다 */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await api("/api/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {});
  await sub.unsubscribe().catch(() => false);
}

/** 로그아웃할 때 서버에 함께 보낼 이 기기 구독 주소 (없거나 알 수 없으면 undefined) */
export async function endpointForLogout(): Promise<string | undefined> {
  try {
    return (await currentSubscription())?.endpoint;
  } catch {
    return undefined;
  }
}

/** 로그아웃한 뒤 브라우저 구독도 푼다 (다음에 이 기기를 쓰는 사람이 내 알림을 받지 않게) */
export async function dropSubscription(): Promise<void> {
  try {
    await (await currentSubscription())?.unsubscribe();
  } catch {
    // 못 풀어도 서버에서는 이미 지웠다
  }
}
