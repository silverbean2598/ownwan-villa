import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { CheerBar, CommentThread } from "../components/Cheer";
import { loadMyVillas, pickVilla, writeCurrentVilla } from "../villa/current";
import type { MyVilla } from "../../shared/villa";
import { kstDay, nextDay, prevDay } from "../../shared/rules/day";
import { MEAL_DAYS, MEAL_LABEL, MEAL_TYPES, type MealType } from "../../shared/meals";
import "../components/villa.css";
import "../components/meals.css";

export type MealItem = {
  id: string;
  userId: string;
  nickname: string;
  mealType: MealType;
  memo: string | null;
  /** 가려진 식단(신고 3건)은 사진 주소가 없다 */
  photoUrl?: string;
  hidden?: boolean;
  createdAt: number;
  edited: boolean;
  mine: boolean;
  cheerCount: number;
  cheeredByMe: boolean;
  commentCount: number;
};

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** 끼니 묶음 머리말 그림 */
export const MEAL_EMOJI: Record<MealType, string> = { breakfast: "🌅", lunch: "☀️", snack: "🍪", dinner: "🌙", late: "🌃" };

/** "11월 24일 (화)" */
export function dayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${m}월 ${d}일 (${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
}

/** 오늘(KST)부터 6일 전까지 (7일) */
function oldestDay(today: string): string {
  let d = today;
  for (let i = 1; i < MEAL_DAYS; i++) d = prevDay(d);
  return d;
}

/** "08:15" (KST, 24시간) */
export function clock(ms: number): string {
  const d = new Date(ms + 9 * 3600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * 식당: 내가 사는 아파트의 하루 식단 — B안 · 끼니별 묶음 [확정 — 기획자 결정, 2026-11-24]
 * 아파트(여러 곳이면 고르기, 처음은 마지막으로 본 아파트) · 날짜(오늘부터 6일 전까지)를 고르면
 * 아침 → 야식 순서로 묶어 2칸 작은 카드로 보여 준다. 카드를 누르면 크게 보기(응원 · 댓글, 내 식단은 [수정] [삭제]).
 */
export function Meals() {
  const nav = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const today = kstDay(Date.now());
  const oldest = oldestDay(today);
  const wantDay = params.get("day");
  const day = wantDay && /^\d{4}-\d{2}-\d{2}$/.test(wantDay) && wantDay <= today && wantDay >= oldest ? wantDay : today;
  const [villas, setVillas] = useState<MyVilla[] | null>(null);
  const [villaId, setVillaId] = useState<string | null>(null);
  const [items, setItems] = useState<MealItem[] | null>(null);
  const [err, setErr] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [thread, setThread] = useState(false);
  const [confirmDel, setConfirmDel] = useState<MealItem | null>(null);
  const [confirmReport, setConfirmReport] = useState<MealItem | null>(null);
  const [reportErr, setReportErr] = useState("");
  const [toast, setToast] = useState("");
  const [note, setNote] = useState<string>((location.state as { note?: string } | null)?.note ?? "");
  const cheering = useRef(new Set<string>());

  const toLogin = () => nav(`/login?next=${encodeURIComponent("/meals")}`, { replace: true });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await loadMyVillas();
        if (!alive) return;
        setVillas(list);
        const pick = pickVilla(list, params.get("villa"));
        setVillaId(pick);
        if (pick) writeCurrentVilla(pick);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return toLogin();
        if (alive) setErr(e instanceof ApiError ? e.message : "아파트를 불러오지 못했어요");
      }
    })();
    return () => {
      alive = false;
    };
    // 처음 한 번
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!villaId) return;
    let alive = true;
    setItems(null);
    setErr("");
    setOpenId(null);
    api<{ meals: MealItem[] }>(`/api/meals?villa=${encodeURIComponent(villaId)}&day=${day}`)
      .then((r) => alive && setItems(r.meals))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) return toLogin();
        if (alive) setErr(e instanceof ApiError ? e.message : "식단을 불러오지 못했어요");
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [villaId, day]);

  // 크게 보기는 Esc 로 닫는다
  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const patch = (id: string, p: Partial<MealItem>) => setItems((xs) => xs && xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  function goDay(d: string) {
    const next = new URLSearchParams(params);
    if (d === today) next.delete("day");
    else next.set("day", d);
    setParams(next, { replace: true });
  }

  function pickVillaId(id: string) {
    writeCurrentVilla(id);
    setVillaId(id);
    const next = new URLSearchParams(params);
    next.set("villa", id);
    setParams(next, { replace: true });
  }

  function open(id: string) {
    setThread(false);
    setOpenId(id);
  }

  /** 하트: 먼저 화면을 바꾸고, 실패하면 되돌린다 */
  async function cheer(it: MealItem) {
    if (cheering.current.has(it.id)) return;
    cheering.current.add(it.id);
    const before = { cheeredByMe: it.cheeredByMe, cheerCount: it.cheerCount };
    patch(it.id, { cheeredByMe: !before.cheeredByMe, cheerCount: Math.max(0, before.cheerCount + (before.cheeredByMe ? -1 : 1)) });
    setErr("");
    try {
      const r = await api<{ cheered: boolean; count: number }>(`/api/meals/${it.id}/cheer`, { method: "POST" });
      patch(it.id, { cheeredByMe: r.cheered, cheerCount: r.count });
    } catch (e) {
      patch(it.id, before);
      setErr(e instanceof ApiError ? e.message : "응원하지 못했어요. 다시 해 주세요");
    } finally {
      cheering.current.delete(it.id);
    }
  }

  async function remove(it: MealItem) {
    setConfirmDel(null);
    setErr("");
    try {
      const r = await api<{ refunded: number }>(`/api/meals/${it.id}`, { method: "DELETE" });
      setOpenId(null);
      setItems((xs) => xs && xs.filter((x) => x.id !== it.id));
      setNote(r.refunded > 0 ? `식단을 지웠어요. ${r.refunded}P를 돌려놨어요` : "식단을 지웠어요");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "지우지 못했어요. 다시 해 주세요");
    }
  }

  /** 신고 (인증 사진 신고와 같은 문구 · 흐름). 3명이 신고해 가려지면 그 자리에서 가린다 */
  async function sendReport(it: MealItem) {
    setReportErr("");
    try {
      const r = await api<{ hidden: boolean }>(`/api/meals/${it.id}/report`, { method: "POST" });
      setConfirmReport(null);
      setToast("신고했어요");
      if (r.hidden) {
        setThread(false);
        patch(it.id, { hidden: true, photoUrl: undefined, memo: null, cheerCount: 0, cheeredByMe: false, commentCount: 0, edited: false });
      }
    } catch (e) {
      setReportErr(e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");
    }
  }

  const newPath = `/meals/new${villaId ? `?villa=${encodeURIComponent(villaId)}` : ""}`;

  if (villas && villas.length === 0) {
    return (
      <main className="meals-page">
        <h1>식당</h1>
        <p className="meals-sub">아파트에 입주하면 이웃과 식단을 나눌 수 있어요.</p>
        <Link className="btn" to="/villa">아파트로 가기</Link>
      </main>
    );
  }

  const opened = openId ? items?.find((m) => m.id === openId) ?? null : null;

  return (
    <main className="meals-page">
      <div className="meals-top">
        <h1>식당</h1>
        {villas && villas.length > 1 && villaId && (
          <select className="meals-villa" aria-label="아파트 선택" value={villaId} onChange={(e) => pickVillaId(e.target.value)}>
            {villas.map((v) => (
              <option key={v.id} value={v.id}>{v.name}</option>
            ))}
          </select>
        )}
      </div>
      <p className="meals-sub">{day === today ? "입주민들이 오늘 먹은 식단이에요" : "입주민들이 이날 먹은 식단이에요"}</p>
      <div className="meals-date">
        <button type="button" aria-label="전날" disabled={day <= oldest} onClick={() => goDay(prevDay(day))}>◀</button>
        <strong>{day === today ? `${dayLabel(day)} 오늘` : dayLabel(day)}</strong>
        <button type="button" aria-label="다음 날" disabled={day >= today} onClick={() => goDay(nextDay(day))}>▶</button>
      </div>
      {note && <p className="ok meals-note" role="status">{note}</p>}
      {err && <p className="error" role="alert">{err}</p>}
      {!items && !err && <p className="muted">불러오는 중이에요</p>}
      {items &&
        MEAL_TYPES.map((t) => {
          const list = items.filter((m) => m.mealType === t);
          return (
            <section key={t} className="meal-sec" aria-label={MEAL_LABEL[t]}>
              <h2>
                <span aria-hidden="true">{MEAL_EMOJI[t]}</span> {MEAL_LABEL[t]} <small>{list.length}</small>
              </h2>
              {list.length === 0 ? (
                <div className="meal-sec-empty">아직 없어요</div>
              ) : (
                <div className="meal-grid">
                  {list.map((m) => (
                    <button key={m.id} type="button" className="meal-mini" onClick={() => open(m.id)} aria-label={`${m.nickname} 님의 ${MEAL_LABEL[m.mealType]} 크게 보기`}>
                      {m.hidden || !m.photoUrl ? <span className="meal-mini-hidden">가려진 사진</span> : <img src={m.photoUrl} alt="" loading="lazy" />}
                      <span className="meal-mini-body">
                        {m.memo && !m.hidden && <span className="meal-mini-memo">{m.memo}</span>}
                        <span className="meal-mini-who">
                          <span><b>{m.nickname}</b> {clock(m.createdAt)}</span>
                          {!m.hidden && (
                            <span>
                              <span className={m.cheeredByMe ? "heart on" : "heart"}>{m.cheeredByMe ? "♥" : "♡"}</span> {m.cheerCount} · 💬 {m.commentCount}
                            </span>
                          )}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      {villaId && <Link className="meals-fab" to={newPath}>＋ 식단 올리기</Link>}
      {opened && (
        <div className="meal-sheet-backdrop" onClick={(e) => e.target === e.currentTarget && setOpenId(null)}>
          <div className="meal-sheet" role="dialog" aria-modal="true" aria-label={`${opened.nickname} 님의 ${MEAL_LABEL[opened.mealType]}`}>
            <button type="button" className="meal-sheet-close" aria-label="닫기" onClick={() => setOpenId(null)}>✕</button>
            {opened.hidden || !opened.photoUrl ? (
              <div className="meal-sheet-photo meal-sheet-hidden">가려진 사진</div>
            ) : (
              <img className="meal-sheet-photo" src={opened.photoUrl} alt={`${opened.nickname} 님의 ${MEAL_LABEL[opened.mealType]}`} />
            )}
            <div className="meal-sheet-body">
              <div className="meal-sheet-head">
                <span className="meal-label">{MEAL_LABEL[opened.mealType]}</span>
                <span><b>{opened.nickname}</b> · {clock(opened.createdAt)}{opened.edited ? " · 수정됨" : ""}</span>
                {opened.mine ? (
                  <span className="meal-actions">
                    {/* 가려진 식단은 지우기만 (인증 기록처럼 가려진 글에는 수정 버튼이 없다) */}
                    {!opened.hidden && <Link to={`/meals/${opened.id}/edit`} aria-label="식단 수정">수정</Link>}
                    <button type="button" aria-label="식단 삭제" onClick={() => setConfirmDel(opened)}>삭제</button>
                  </span>
                ) : (
                  // 남의 식단: 가려지지 않았을 때만 신고
                  !opened.hidden && (
                    <span className="meal-actions">
                      <button
                        type="button"
                        aria-label="식단 신고"
                        onClick={() => {
                          setReportErr("");
                          setConfirmReport(opened);
                        }}
                      >
                        신고하기
                      </button>
                    </span>
                  )
                )}
              </div>
              {opened.memo && !opened.hidden && <p className="meal-memo">{opened.memo}</p>}
              {!opened.hidden && (
                <CheerBar item={opened} mine={opened.mine} open={thread} onCheer={() => void cheer(opened)} onToggleThread={() => setThread(!thread)} />
              )}
              {thread && !opened.hidden && (
                <CommentThread
                  certId={opened.id}
                  base={`/api/meals/${opened.id}`}
                  deleteBase="/api/meal-comments"
                  onCount={(n) => patch(opened.id, { commentCount: n })}
                />
              )}
            </div>
          </div>
        </div>
      )}
      {confirmReport && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label="신고하기">
          <div className="confirm-box">
            <p>이 사진을 신고할까요? 3명이 신고하면 사진이 가려져요.</p>
            {reportErr && <p className="error" role="alert">{reportErr}</p>}
            <div className="row">
              <button type="button" className="btn ghost" onClick={() => setConfirmReport(null)}>취소</button>
              <button type="button" className="btn" onClick={() => void sendReport(confirmReport)}>신고하기</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="action-toast" role="status">{toast}</div>}
      {confirmDel && (
        <div className="confirm-overlay" role="dialog" aria-modal="true" aria-label="식단 삭제">
          <div className="confirm-box">
            <p>이 식단을 지울까요? 받은 포인트도 돌려놔요.</p>
            <div className="row">
              <button type="button" className="btn ghost" onClick={() => setConfirmDel(null)}>취소</button>
              <button type="button" className="btn" onClick={() => void remove(confirmDel)}>지우기</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
