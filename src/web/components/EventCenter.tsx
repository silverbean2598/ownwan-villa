import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api";
import { DEFAULT_AVATAR, parseAvatar, type AvatarSpec } from "../../shared/avatar";
import { kstDay } from "../../shared/rules/day";
import { cardButton, eventCopy, isCard, planEvents, shouldNightRemind, type AppEvent, type CardType, type ToastType } from "../events/plan";
import { EVENTS_POKE } from "../events/poke";
import { CardArt, ToastArt } from "./celebrate/CelebrationArt";
import "./celebrate/celebrate.css";

type Me = { avatar: AvatarSpec; certifiedToday?: boolean };

const NIGHT_KEY = "ownwan:night-reminder-day";
export const TOAST_MS = 3000;
const MAX_TOASTS = 3;

function readNightDay(): string | null {
  try {
    return localStorage.getItem(NIGHT_KEY);
  } catch {
    return null;
  }
}
function writeNightDay(day: string) {
  try {
    localStorage.setItem(NIGHT_KEY, day);
  } catch {}
}

function markSeen(ids: string[]) {
  const server = ids.filter((id) => !id.startsWith("night:"));
  if (server.length) api("/api/events/seen", { method: "POST", body: JSON.stringify({ ids: server }) }).catch(() => {});
}

const onVillaScreens = (path: string) =>
  path === "/villa" || (path.startsWith("/villa/") && path !== "/villa/new") || path.startsWith("/room/");

/**
 * 축하 카드 · 알림 토스트. App 에 한 번만 둔다.
 * 앱을 열 때, /villa · /room 으로 갈 때, 창에 다시 돌아올 때, 동작 뒤 pokeEvents() 때 안 본 이벤트를 받아 온다.
 * 카드는 한 장씩(순서대로), 카드가 다 닫히면 토스트를 위에 쌓아 보여 준다.
 */
export function EventCenter({ now = Date.now }: { now?: () => number }) {
  const { pathname } = useLocation();
  const [spec, setSpec] = useState<AvatarSpec>(DEFAULT_AVATAR);
  const [cards, setCards] = useState<AppEvent[]>([]);
  const [toasts, setToasts] = useState<AppEvent[]>([]);
  const known = useRef(new Set<string>());
  const loading = useRef(false);
  const again = useRef<null | boolean>(null);

  const load = useCallback(
    async (checkNight: boolean) => {
      // 받아 오는 중에 또 부르면 끝난 뒤 한 번 더 (동작 직후 이벤트를 놓치지 않게)
      if (loading.current) {
        again.current = (again.current ?? false) || checkNight;
        return;
      }
      loading.current = true;
      try {
        const me = await api<Me>("/api/me").catch(() => null);
        if (!me) return; // 로그인 전
        setSpec(parseAvatar(me.avatar) ?? DEFAULT_AVATAR);
        const list = await api<AppEvent[]>("/api/events").catch(() => [] as AppEvent[]);
        const fresh = list.filter((e) => !known.current.has(e.id));
        if (checkNight && shouldNightRemind(now(), !!me.certifiedToday, readNightDay())) {
          fresh.push({ id: `night:${kstDay(now())}`, type: "night_reminder", payload: {}, createdAt: now() });
        }
        const plan = planEvents(fresh.filter((e) => !known.current.has(e.id)), now());
        fresh.forEach((e) => known.current.add(e.id));
        if (plan.drop.length) markSeen(plan.drop);
        if (plan.cards.length) setCards((c) => [...c, ...plan.cards]);
        if (plan.toasts.length) setToasts((t) => [...t, ...plan.toasts]);
      } finally {
        loading.current = false;
        const next = again.current;
        again.current = null;
        if (next !== null) void load(next);
      }
    },
    [now],
  );

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      void load(true);
    } else if (onVillaScreens(pathname)) void load(false);
  }, [pathname, load]);

  useEffect(() => {
    const onFocus = () => void load(true);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const onPoke = () => void load(false);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener(EVENTS_POKE, onPoke);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener(EVENTS_POKE, onPoke);
    };
  }, [load]);

  const card = cards[0];
  const closeCard = useCallback(() => {
    if (!card) return;
    markSeen([card.id]);
    setCards((c) => c.slice(1));
  }, [card]);

  const onToastShown = useCallback((e: AppEvent) => {
    if (e.type === "night_reminder") writeNightDay(e.id.slice("night:".length));
    else markSeen([e.id]);
  }, []);
  const dropToast = useCallback((id: string) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  return (
    <>
      {card && isCard(card.type) && <Card key={card.id} event={card} type={card.type} spec={spec} onClose={closeCard} />}
      {!card && toasts.length > 0 && (
        <div className="toasts">
          {toasts.slice(0, MAX_TOASTS).map((t) => (
            <Toast key={t.id} event={t} spec={spec} onShown={onToastShown} onDone={dropToast} />
          ))}
        </div>
      )}
    </>
  );
}

function Card({ event, type, spec, onClose }: { event: AppEvent; type: CardType; spec: AvatarSpec; onClose: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    btn.current?.focus();
  }, []);
  const text = eventCopy(event);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    // 버튼 하나뿐이라 Tab 은 버튼에 머문다
    if (e.key === "Tab") {
      e.preventDefault();
      btn.current?.focus();
    }
  };
  return (
    <div className="cel-overlay" onKeyDown={onKey}>
      <div className="cel-card" role="dialog" aria-modal="true" aria-labelledby={`cel-${event.id}`}>
        <CardArt type={type} spec={spec} />
        <p id={`cel-${event.id}`}>{text}</p>
        <button ref={btn} type="button" className="btn" onClick={onClose}>
          {cardButton(type)}
        </button>
      </div>
    </div>
  );
}

function Toast({ event, spec, onShown, onDone }: { event: AppEvent; spec: AvatarSpec; onShown: (e: AppEvent) => void; onDone: (id: string) => void }) {
  useEffect(() => {
    onShown(event);
    const t = setTimeout(() => onDone(event.id), TOAST_MS);
    return () => clearTimeout(t);
    // 보여 줄 때 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const friend =
    event.type === "friend_joined" || event.type === "owner_changed" || event.type === "application_received" ? parseAvatar(event.payload.avatar) : null;
  return (
    <div className="toast" role="status" onClick={() => onDone(event.id)}>
      <ToastArt type={event.type as ToastType} spec={spec} friend={friend} />
      <span>{eventCopy(event)}</span>
    </div>
  );
}
