import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api";
import "./meals.css";

/** 아래 탭이 보이는 화면: 로그인한 뒤 쓰는 앱 화면만 (첫 화면 · 가입 · 로그인 · 복구 · 초대 · 시작하기 · 약관 등에는 없다) */
const APP_PREFIXES = ["/villa", "/meals", "/city", "/room", "/certify", "/shop", "/settings", "/ranking", "/battle"];

export function showTabBar(pathname: string): boolean {
  return APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export type TabKey = "villa" | "meals" | "city" | "room";

/** 지금 화면에 맞는 탭. 남의 방 · 상점 · 설정 · 인증 등 아파트에서 들어가는 화면은 [아파트] */
export function activeTab(pathname: string, meId: string | null): TabKey | null {
  if (!showTabBar(pathname)) return null;
  if (pathname === "/meals" || pathname.startsWith("/meals/")) return "meals";
  if (pathname === "/city" || pathname.startsWith("/city/")) return "city";
  if (meId && (pathname === `/room/${meId}` || pathname.startsWith(`/room/${meId}/`))) return "room";
  return "villa";
}

/**
 * 아래 탭 4개: 아파트 · 식당 · 도시 · 내 방 [확정 — 기획자 결정, 2026-11-24]
 * 보이는 동안 body 에 has-tabbar 를 붙여 화면 아래에 탭만큼 여백을 둔다 (홈 막대 영역 포함)
 */
export function TabBar() {
  const { pathname } = useLocation();
  const shown = showTabBar(pathname);
  const [meId, setMeId] = useState<string | null>(null);

  useEffect(() => {
    if (!shown) return;
    document.body.classList.add("has-tabbar");
    return () => document.body.classList.remove("has-tabbar");
  }, [shown]);

  // 탭이 보이게 될 때(로그인 뒤 등) 내 id 를 받아 [내 방] 주소를 만든다
  useEffect(() => {
    if (!shown || meId) return;
    let alive = true;
    api<{ id: string }>("/api/me")
      .then((me) => alive && setMeId(me.id))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [shown, meId]);

  if (!shown) return null;
  const on = activeTab(pathname, meId);
  const tabs: { key: TabKey; label: string; to: string | null }[] = [
    { key: "villa", label: "아파트", to: "/villa" },
    { key: "meals", label: "식당", to: "/meals" },
    { key: "city", label: "도시", to: "/city" },
    { key: "room", label: "내 방", to: meId ? `/room/${meId}` : null },
  ];
  return (
    <nav className="tabbar" aria-label="메뉴">
      {tabs.map((t) =>
        t.to ? (
          <Link key={t.key} to={t.to} className={`tabbar-tab${on === t.key ? " on" : ""}`} aria-current={on === t.key ? "page" : undefined}>
            <TabIcon k={t.key} />
            <span>{t.label}</span>
          </Link>
        ) : (
          <span key={t.key} className="tabbar-tab" aria-disabled="true">
            <TabIcon k={t.key} />
            <span>{t.label}</span>
          </span>
        ),
      )}
    </nav>
  );
}

/** 시안의 선 아이콘 (24×24, 선 2px) */
function TabIcon({ k }: { k: TabKey }) {
  const line = { fill: "none", stroke: "currentColor", strokeWidth: 2 } as const;
  return (
    <svg className="tabbar-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      {k === "villa" && (
        <>
          <path d="M4 21V8l8-5 8 5v13" {...line} strokeLinejoin="round" />
          <path d="M9 21v-5h6v5M8 11h2M14 11h2" {...line} strokeLinecap="round" />
        </>
      )}
      {k === "meals" && <path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 3c-2 1-3 4-3 7h3v11" {...line} strokeLinecap="round" strokeLinejoin="round" />}
      {k === "city" && <path d="M3 21h18M5 21V10h5v11M10 21V5h6v16M16 21v-8h3v8" {...line} strokeLinejoin="round" />}
      {k === "room" && (
        <>
          <circle cx="12" cy="8" r="4" {...line} />
          <path d="M4 21c1-4 4-6 8-6s7 2 8 6" {...line} strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
