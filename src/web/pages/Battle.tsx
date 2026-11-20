import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { BATTLE_REASON_COPY, type BattleView, type VillaBattles, type VillaPrice } from "../../shared/price";
import { BATTLE_DAYS, BATTLE_POINTS, formatDelta, formatPrice } from "../../shared/rules/price";
import { PriceTag } from "../components/price/PriceTag";
import { pokeEvents } from "../events/poke";
import { withParticle } from "../events/plan";
import { md } from "./Ranking";
import "../components/price/price.css";

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");
const hoursLeft = (at: number) => Math.max(1, Math.ceil((at - Date.now()) / 3600_000));

/** 최근 14일 집값 (작은 선 그래프) */
function Spark({ history }: { history: VillaPrice["history"] }) {
  if (history.length < 2) return null;
  const W = 300, H = 54, P = 6;
  const ps = history.map((h) => h.price);
  const lo = Math.min(...ps), hi = Math.max(...ps);
  const x = (i: number) => P + (i * (W - P * 2)) / (history.length - 1);
  const y = (p: number) => (hi === lo ? H / 2 : H - P - ((p - lo) * (H - P * 2)) / (hi - lo));
  const d = history.map((h, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(h.price).toFixed(1)}`).join(" ");
  const last = history[history.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`최근 ${history.length}일 집값: ${formatPrice(history[0].price)}에서 ${formatPrice(last.price)}`}>
      <path d={`${d} L${x(history.length - 1)} ${H} L${x(0)} ${H} Z`} fill="#EAF0FF" />
      <path d={d} fill="none" stroke="#2F5BEA" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(history.length - 1)} cy={y(last.price)} r="3.5" fill="#2F5BEA" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}

/** 진행 중 대결: 두 빌라가 첫날 전날보다 얼마나 올랐는지 나란히 */
function Versus({ b }: { b: BattleView }) {
  const md_ = b.me.delta ?? 0;
  const td = b.them.delta ?? 0;
  const lead = !b.started ? "내일부터 집값 변화를 겨뤄요" : md_ > td ? `우리가 ${formatPrice(md_ - td)} 앞서요` : md_ < td ? `${formatPrice(td - md_)} 뒤지고 있어요. 오늘 인증해서 따라잡아요` : "지금은 똑같아요";
  return (
    <div className="versus">
      <div className="vs-cols">
        {[b.me, b.them].map((s, i) => (
          <div key={s.villaId} className={`vs-side${i === 0 ? " me" : ""}${b.started && (i === 0 ? md_ > td : td > md_) ? " ahead" : ""}`}>
            <span className="vs-name">{i === 0 ? "우리 " : ""}{s.name}</span>
            <b className="vs-delta">{s.delta === null ? "–" : formatDelta(s.delta)}</b>
            <span className="vs-now">{s.base === null ? "기준 집계 전" : `${formatPrice(s.base)} → ${s.now === null ? "–" : formatPrice(s.now)}`}</span>
          </div>
        ))}
        <span className="vs-mark" aria-hidden="true">VS</span>
      </div>
      <p className="vs-lead">{lead}</p>
      <div className="vs-days" aria-label={`${BATTLE_DAYS}일 중 ${BATTLE_DAYS - (b.daysLeft ?? BATTLE_DAYS)}일 지남`}>
        {Array.from({ length: BATTLE_DAYS }, (_, i) => (
          <span key={i} className={i < BATTLE_DAYS - (b.daysLeft ?? BATTLE_DAYS) ? "done" : ""} />
        ))}
      </div>
      <p className="vs-when">
        {b.startDay && b.endDay && `${md(b.startDay)} ~ ${md(b.endDay)} · `}
        {b.started ? `오늘 포함 ${b.daysLeft}일 남았어요` : `${BATTLE_DAYS}일 동안 겨뤄요`}
      </p>
    </div>
  );
}

const RESULT_LABEL: Record<string, string> = { won: "승리", lost: "패배", draw: "무승부" };
const STATUS_LABEL: Record<string, string> = { declined: "거절", expired: "만료", cancelled: "취소" };

function RecentRow({ b }: { b: BattleView }) {
  const label = b.result ? RESULT_LABEL[b.result] : STATUS_LABEL[b.status] ?? "";
  const sub =
    b.status === "finished"
      ? `우리 ${formatDelta(b.me.delta ?? 0)} · 상대 ${formatDelta(b.them.delta ?? 0)}`
      : b.status === "declined"
        ? b.side === "challenger" ? "상대가 신청을 거절했어요" : "신청을 거절했어요"
        : BATTLE_REASON_COPY[b.reason ?? ""] ?? "";
  return (
    <li className="recent-row">
      <span className={`res ${b.result ?? b.status}`}>{label}</span>
      <span className="recent-info">
        <b>{b.them.name}</b>
        <span>{sub}</span>
      </span>
      {b.endDay && b.status === "finished" && <span className="recent-day">{md(b.endDay)}</span>}
    </li>
  );
}

/**
 * 우리 빌라 집값 대결 화면 (/battle/:villaId). 입주민 누구나 보고, 방장만 버튼이 있다.
 * - 받은 신청: 방장 [받기] [거절] / 입주민 "방장이 답하기를 기다리는 중"
 * - 보낸 신청: 방장 [신청 취소] / 입주민 보기만
 * - 진행 중: 두 빌라의 오른 값 · 남은 날 (모두 보기만)
 * - 없음: 방장에게 [집값 순위에서 상대 찾기], 입주민에게 "대결 신청은 방장이 해요"
 */
export function Battle() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState<VillaBattles | null>(null);
  const [price, setPrice] = useState<VillaPrice | null>(null);
  const [error, setError] = useState("");
  const [note, setNote] = useState<{ ok?: string; err?: string }>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [b, p] = await Promise.all([api<VillaBattles>(`/api/villas/${id}/battles`), api<VillaPrice>(`/api/villas/${id}/price`)]);
      setData(b);
      setPrice(p);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return nav(`/login?next=/battle/${id}`, { replace: true });
      setError(msg(e));
    }
  }, [id, nav]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(what: "accept" | "decline" | "cancel", ok: string) {
    if (!data?.current) return;
    setBusy(true);
    setNote({});
    try {
      setData(await api<VillaBattles>(`/api/battles/${data.current.id}/${what}`, { method: "POST" }));
      setNote({ ok });
      pokeEvents();
    } catch (e) {
      setNote({ err: msg(e) });
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (error) return <main className="page"><p className="error" role="alert">{error}</p></main>;
  if (!data || !price) return <main className="page"><p className="muted">불러오는 중이에요</p></main>;
  const cur = data.current;
  const myName = cur?.me.name ?? data.recent[0]?.me.name ?? "";

  return (
    <main className="battle-page">
      <Link className="back" to={`/villa/${id}`}>← 빌라로</Link>
      <h1>집값 대결</h1>
      {myName && <p className="battle-sub">{myName}</p>}

      <section className="price-card" aria-label="우리 빌라 집값">
        <div className="price-card-top">
          <span className="label">우리 빌라 집값</span>
          <PriceTag price={price.price} change={price.change} className="big" />
        </div>
        <Spark history={price.history} />
        <p className="muted small">{price.day ? `${md(price.day)} 자정 정산 기준 · 최근 ${price.history.length}일` : "첫 자정 정산 뒤에 집값이 매겨져요"}</p>
      </section>

      <section className="battle-now" aria-label="지금 대결">
        {!cur && (
          <div className="battle-empty">
            <p><b>지금은 대결이 없어요.</b></p>
            {data.isOwner ? (
              data.public ? (
                <>
                  <p className="muted small">집값 순위에서 겨뤄 볼 빌라를 골라 대결을 신청해 보세요.</p>
                  <Link className="btn" to="/ranking">집값 순위에서 상대 찾기</Link>
                </>
              ) : (
                <>
                  <p className="muted small">도시 지도에 공개한 빌라만 대결할 수 있어요.</p>
                  <Link className="btn ghost" to="/settings">설정에서 지도에 공개하기</Link>
                </>
              )
            ) : (
              <p className="muted small">대결 신청은 방장이 해요. 대결이 열리면 여기에서 같이 볼 수 있어요.</p>
            )}
          </div>
        )}

        {cur?.status === "pending" && cur.side === "opponent" && (
          <div className="battle-card incoming">
            <span className="battle-flag">대결 신청이 왔어요</span>
            <p className="battle-title"><b>{cur.them.name}</b>에서 우리 빌라에 집값 대결을 신청했어요</p>
            <ul className="challenge-rules">
              <li>받으면 내일부터 {BATTLE_DAYS}일 동안 집값이 더 많이 오른 빌라가 이겨요</li>
              <li>이기면 입주민 모두 {BATTLE_POINTS}P와 건물에 “대결 승리” 배지 (7일)</li>
            </ul>
            <p className="muted small">{hoursLeft(cur.expiresAt!)}시간 안에 답하지 않으면 신청이 사라져요.</p>
            {data.isOwner ? (
              <div className="row">
                <button type="button" className="btn" disabled={busy} onClick={() => act("accept", "대결을 받았어요! 내일부터 시작해요")}>받기</button>
                <button type="button" className="btn ghost" disabled={busy} onClick={() => act("decline", "대결 신청을 거절했어요")}>거절</button>
              </div>
            ) : (
              <p className="battle-wait">방장이 답하기를 기다리는 중이에요.</p>
            )}
          </div>
        )}

        {cur?.status === "pending" && cur.side === "challenger" && (
          <div className="battle-card outgoing">
            <span className="battle-flag out">답을 기다리는 중</span>
            <p className="battle-title"><b>{cur.them.name}</b>에 집값 대결을 신청했어요</p>
            <p className="muted small">상대 방장이 받으면 다음 날부터 {BATTLE_DAYS}일 동안 겨뤄요. {hoursLeft(cur.expiresAt!)}시간 뒤 만료돼요.</p>
            {data.isOwner && (
              <button type="button" className="btn ghost small" disabled={busy} onClick={() => act("cancel", "신청을 취소했어요")}>신청 취소</button>
            )}
          </div>
        )}

        {cur?.status === "active" && (
          <div className="battle-card active">
            <span className="battle-flag live">대결 중</span>
            <p className="battle-title"><b>{cur.them.name}</b>{withParticle(cur.them.name)} 집값 대결 중이에요</p>
            <Versus b={cur} />
          </div>
        )}
        {note.ok && <p className="ok" role="status">{note.ok}</p>}
        {note.err && <p className="error" role="alert">{note.err}</p>}
      </section>

      {data.recent.length > 0 && (
        <section className="battle-recent">
          <h2>지난 대결</h2>
          <ul>
            {data.recent.map((b) => <RecentRow key={b.id} b={b} />)}
          </ul>
        </section>
      )}

      <section className="battle-rules">
        <h2>집값은 이렇게 매겨요</h2>
        <ul>
          <li>기본 1억에서 시작해요</li>
          <li>입주민 한 명마다 +0.1억</li>
          <li>최근 7일 동안 입주민이 이 빌라에 인증한 날 하루마다 +0.1억</li>
          <li>입주민 층이 1층보다 높은 만큼 한 층마다 +0.1억</li>
        </ul>
        <p className="muted small">매일 자정에 다시 계산해요. 지운 사진 · 같은 사진은 세지 않아요.</p>
      </section>
    </main>
  );
}
