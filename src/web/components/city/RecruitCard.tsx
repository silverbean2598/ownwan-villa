import { useState } from "react";
import { api, ApiError } from "../../api";
import type { CityVilla } from "../../../shared/city";
import { APPLY_BLOCKED_MSG, APPLY_MESSAGE_MAX, charLen, type MyApplication } from "../../../shared/recruit";
import { MAX_VILLAS_PER_USER } from "../../../shared/villa";
import { SPORT_LABEL } from "../../../shared/sports";

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");

/** 만료까지 남은 날 (올림, 최소 1일) */
export const daysLeft = (expiresAt: number, nowMs = Date.now()) => Math.max(1, Math.ceil((expiresAt - nowMs) / 86_400_000));

/** 모집 글 내용: 소개 · 원하는 종목 · 빈방 (도시 카드 · 설정 읽기전용이 같이 쓴다) */
export function RecruitPostView({ intro, sports, vacancies }: { intro: string; sports: (keyof typeof SPORT_LABEL)[]; vacancies?: number }) {
  return (
    <div className="recruit-post">
      <p className="recruit-intro">{intro || "같이 운동할 이웃을 찾고 있어요"}</p>
      <div className="recruit-tags">
        {sports.length ? sports.map((s) => <span className="recruit-tag" key={s}>{SPORT_LABEL[s]}</span>) : <span className="recruit-tag any">종목 상관없음</span>}
        {vacancies !== undefined && <span className="recruit-tag room">빈방 {vacancies}개</span>}
      </div>
    </div>
  );
}

/**
 * 도시 카드 안 빈방 모집 칸. 상태: 우리 빌라(읽기만) / 신청함(취소) / 신청할 수 없음(입주 금지 · 3곳) /
 * 다른 곳에 신청 중(그 신청 취소) / 신청 가능([입주 신청] → 한마디 + [신청 보내기])
 */
export function RecruitCard({
  v, mine, myApp, villaCount, onChanged,
}: {
  v: CityVilla;
  mine: boolean;
  myApp: MyApplication | null;
  villaCount: number;
  onChanged: () => Promise<void>;
}) {
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok?: string; err?: string }>({});
  const r = v.recruit;
  if (!r) return null;

  async function act(ok: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setNote({});
    try {
      await fn();
      setComposing(false);
      setMessage("");
      await onChanged();
      setNote({ ok });
    } catch (e) {
      setNote({ err: msg(e) });
    } finally {
      setBusy(false);
    }
  }
  const apply = () => act("신청했어요! 방장이 승인하면 바로 입주해요", () => api(`/api/villas/${v.id}/apply`, { method: "POST", body: JSON.stringify({ message }) }));
  const cancel = (app: MyApplication) => act("신청을 취소했어요", () => api(`/api/applications/${app.id}/cancel`, { method: "POST" }));
  const over = charLen(message) > APPLY_MESSAGE_MAX;

  let action: JSX.Element;
  if (mine) action = <p className="recruit-state">우리 빌라 모집 글이에요.</p>;
  else if (myApp?.villaId === v.id)
    action = (
      <div className="recruit-state waiting" role="status">
        <span>
          <b>신청했어요</b> 방장의 답을 기다리는 중이에요 · {daysLeft(myApp.expiresAt)}일 뒤 만료
        </span>
        <button type="button" className="btn ghost small" disabled={busy} onClick={() => cancel(myApp)}>신청 취소</button>
      </div>
    );
  else if (r.blocked) action = <p className="recruit-state">{APPLY_BLOCKED_MSG}</p>;
  else if (villaCount >= MAX_VILLAS_PER_USER) action = <p className="recruit-state">빌라는 {MAX_VILLAS_PER_USER}곳까지 살 수 있어요. 한 곳을 나가면 신청할 수 있어요.</p>;
  else if (myApp)
    action = (
      <div className="recruit-state">
        <span>{myApp.villaName}에 보낸 신청을 기다리는 중이에요. 신청은 한 번에 한 곳만 할 수 있어요.</span>
        <button type="button" className="btn ghost small" disabled={busy} onClick={() => cancel(myApp)}>그 신청 취소</button>
      </div>
    );
  else if (!composing)
    action = (
      <button type="button" className="btn recruit-apply" onClick={() => setComposing(true)}>입주 신청</button>
    );
  else
    action = (
      <div className="recruit-form">
        <label htmlFor={`apply-msg-${v.id}`}>방장에게 한마디 <span className="muted">(선택)</span></label>
        <textarea
          id={`apply-msg-${v.id}`}
          rows={3}
          value={message}
          placeholder="예) 평일 저녁에 헬스해요. 같이 꾸준히 하고 싶어요!"
          onChange={(e) => setMessage(e.target.value)}
          aria-describedby={`apply-count-${v.id}`}
        />
        <div className={`counter${over ? " over" : ""}`} id={`apply-count-${v.id}`}>{charLen(message)}/{APPLY_MESSAGE_MAX}</div>
        <div className="row">
          <button type="button" className="btn" disabled={busy || over} onClick={apply}>신청 보내기</button>
          <button type="button" className="btn ghost" disabled={busy} onClick={() => setComposing(false)}>취소</button>
        </div>
        <p className="muted small">방장이 승인하면 바로 입주해요. 7일 동안 답이 없으면 신청은 사라져요.</p>
      </div>
    );

  return (
    <section className="recruit-box" aria-label="입주자 모집">
      <div className="recruit-head">
        <span className="recruit-flag">입주자 모집 중</span>
      </div>
      <RecruitPostView intro={r.intro} sports={r.sports} vacancies={r.vacancies} />
      {action}
      {note.ok && <p className="ok" role="status">{note.ok}</p>}
      {note.err && <p className="error" role="alert">{note.err}</p>}
    </section>
  );
}
