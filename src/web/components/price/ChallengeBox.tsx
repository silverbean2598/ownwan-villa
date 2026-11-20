import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api";
import { challengeBlock, selfBlock, type RankingMine } from "../../../shared/price";
import { BATTLE_DAYS, BATTLE_POINTS } from "../../../shared/rules/price";

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");

/**
 * [대결 신청] (집값 순위 한 줄 · 도시 카드). 방장에게만 보인다.
 * - 신규입력: [대결 신청] → 확인 칸(우리 빌라가 여럿이면 어느 빌라로 신청할지 고르기) → [신청하기]
 * - 누를 수 없음: 버튼은 흐리게, 아래에 이유 한 줄 (우리 빌라 비공개 · 이미 대결 중 · 상대가 대결 중 · 내 빌라끼리)
 * - 방장이 아닌 입주민 · 빌라가 없는 사람: 아무것도 그리지 않는다
 * 신청하면 우리 빌라 대결 화면으로 간다
 */
export function ChallengeBox({
  target, mine, compact = false, quietSelf = false,
}: {
  target: { id: string; name: string; inBattle: boolean };
  mine: RankingMine[];
  compact?: boolean;
  /** 우리 빌라 쪽 이유(비공개 · 이미 대결 중)면 줄마다 쓰지 않고 그리지 않는다 (순위 화면은 위에 한 번만 알린다) */
  quietSelf?: boolean;
}) {
  const nav = useNavigate();
  const owned = mine.filter((m) => m.isOwner);
  const ready = owned.filter((m) => m.villaId !== target.id && m.public && !m.inBattle);
  const [fromId, setFromId] = useState<string>((ready[0] ?? owned[0])?.villaId ?? "");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!owned.length || mine.some((m) => m.villaId === target.id)) return null;
  const from = owned.find((m) => m.villaId === fromId) ?? owned[0];
  const block = challengeBlock(target, from, owned.map((m) => m.villaId));

  async function send() {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/villas/${from.villaId}/battles`, { method: "POST", body: JSON.stringify({ opponentVillaId: target.id }) });
      nav(`/battle/${from.villaId}`);
    } catch (e) {
      setErr(msg(e));
      setBusy(false);
    }
  }

  if (block && quietSelf && block === selfBlock(from)) return null;
  if (block) {
    return (
      <div className={`challenge${compact ? " compact" : ""}`}>
        <button type="button" className="btn ghost small challenge-btn" disabled aria-describedby={`cb-${target.id}`}>대결 신청</button>
        <p className="challenge-why" id={`cb-${target.id}`}>{block}</p>
      </div>
    );
  }
  if (!open) {
    return (
      <div className={`challenge${compact ? " compact" : ""}`}>
        <button type="button" className="btn small challenge-btn" onClick={() => setOpen(true)} aria-label={`${target.name}에 대결 신청`}>
          대결 신청
        </button>
      </div>
    );
  }
  return (
    <div className="challenge-confirm" role="group" aria-label={`${target.name}에 대결 신청`}>
      <p>
        <b>{target.name}</b>에 집값 대결을 신청할까요?
      </p>
      {ready.length > 1 && (
        <fieldset className="challenge-from">
          <legend>대결할 우리 빌라</legend>
          {ready.map((m) => (
            <label key={m.villaId}>
              <input type="radio" name={`from-${target.id}`} checked={m.villaId === from.villaId} onChange={() => setFromId(m.villaId)} />
              <span>{m.name}</span>
            </label>
          ))}
        </fieldset>
      )}
      <ul className="challenge-rules">
        <li>상대 방장이 48시간 안에 받으면 다음 날부터 {BATTLE_DAYS}일 동안 겨뤄요</li>
        <li>집값이 더 많이 오른 빌라가 이기고, 입주민 모두 {BATTLE_POINTS}P를 받아요</li>
      </ul>
      <div className="row">
        <button type="button" className="btn" disabled={busy} onClick={send}>신청하기</button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => setOpen(false)}>취소</button>
      </div>
      {err && <p className="error" role="alert">{err}</p>}
    </div>
  );
}
