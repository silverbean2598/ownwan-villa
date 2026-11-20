import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import type { RankingResponse } from "../../shared/price";
import { LEAGUE_POINTS } from "../../shared/rules/price";
import { PriceBadges, PriceTag, TrophyIcon } from "../components/price/PriceTag";
import { ChallengeBox } from "../components/price/ChallengeBox";
import { topicParticle } from "../events/plan";
import "../components/price/price.css";

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");
/** "2026-11-19" → "11월 19일" */
export const md = (day: string) => `${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일`;

/**
 * 집값 순위: 지도에 공개한 빌라를 어제(마지막 정산) 집값 높은 순으로. 내 빌라는 강조.
 * 방장에게는 줄마다 [대결 신청] (누를 수 없으면 이유 한 줄)
 */
export function Ranking() {
  const nav = useNavigate();
  const from = useSearchParams()[0].get("from");
  const [data, setData] = useState<RankingResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<RankingResponse>("/api/ranking").then(setData, (e) => {
      if (e instanceof ApiError && e.status === 401) return nav("/login?next=/ranking", { replace: true });
      setError(msg(e));
    });
  }, [nav]);

  if (error) return <main className="page"><p className="error" role="alert">{error}</p></main>;
  if (!data) return <main className="page"><p className="muted">순위를 불러오는 중이에요</p></main>;

  const mineIds = new Set(data.mine.map((m) => m.villaId));
  const hiddenMine = data.mine.filter((m) => !m.public);
  const back = from === "city" ? { to: "/city", label: "← 도시로" } : { to: "/villa", label: "← 빌라로" };

  return (
    <main className="rank-page">
      <header className="rank-head">
        <Link className="back" to={back.to}>{back.label}</Link>
        <h1>집값 순위</h1>
        <p>
          {data.day ? `${md(data.day)} 자정 정산 기준이에요. ` : "첫 자정 정산이 끝나면 집값이 매겨져요. "}
          입주민이 그 빌라에 인증한 날이 많을수록, 층이 높을수록 집값이 올라요.
        </p>
      </header>

      <section className="league-note" aria-label="주간 리그">
        <div className="league-cups" aria-hidden="true">
          <TrophyIcon rank={1} size={22} />
          <TrophyIcon rank={2} size={22} />
          <TrophyIcon rank={3} size={22} />
        </div>
        <p>
          <b>주간 리그</b> 매주 월요일 0시, 지난주 1·2·3위 빌라 입주민에게 {LEAGUE_POINTS.join("·")}P와 트로피를 줘요.
          {data.leagueWeek ? ` 지금 트로피는 ${md(data.leagueWeek)}부터 한 주의 결과예요.` : ""}
        </p>
      </section>

      {hiddenMine.map((m) => (
        <p className="rank-hint" key={m.villaId}>
          {m.name}{topicParticle(m.name)} 지도에 공개하지 않아 순위에 없어요.{m.isOwner ? " 설정에서 공개하면 순위에 오르고 대결도 할 수 있어요." : ""}
        </p>
      ))}

      {data.villas.length === 0 ? (
        <p className="rank-empty">아직 지도에 공개한 빌라가 없어요.</p>
      ) : (
        <ol className="rank-list">
          {data.villas.map((v) => {
            const mine = mineIds.has(v.id);
            return (
              <li key={v.id} className={`rank-row${mine ? " mine" : ""}${v.rank !== null && v.rank <= 3 ? ` top${v.rank}` : ""}`}>
                <div className="rank-main">
                  <span className="rank-no" aria-label={v.rank ? `${v.rank}위` : "집계 전"}>{v.rank ?? "–"}</span>
                  <div className="rank-info">
                    <span className="rank-name">
                      {mine && <span className="mine-tag">우리 빌라</span>}
                      <span className="nm">{v.name}</span>
                    </span>
                    <span className="rank-sub">
                      입주 {v.memberCount}명
                      <PriceBadges trophy={v.trophy} battleWin={v.battleWin} inBattle={v.inBattle} />
                    </span>
                  </div>
                  <PriceTag price={v.price} change={v.change} className="stack" />
                </div>
                <ChallengeBox target={v} mine={data.mine} compact />
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
