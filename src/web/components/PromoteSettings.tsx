import { useState } from "react";
import { api, ApiError } from "../api";
import { APARTMENT_CAPACITY, capacityOf, promoteState, type VillaKind } from "../../shared/villa";

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");

/**
 * 설정 → 아파트로 승격 (고른 빌라) [제안 — 기획자 확인 필요, 2026-11-20]
 * - eligible (방장 · 빌라 · 정원이 다 참): [아파트로 승격] → 확인 칸("다시 빌라로 돌아갈 수 없어요") → [아파트로 바꾸기]
 * - waiting (방장 · 아직 정원이 안 참): 읽기전용 진행 막대 "입주민 17/20명 — 20명이 모이면 아파트로 바꿀 수 있어요"
 * - member (방장이 아닌 입주민 · 빌라): 읽기전용 진행 막대 + "방장이 아파트로 바꿀 수 있어요" (다 찼으면 "다 모였어요! 방장이 바꾸면…")
 * - apartment (이미 아파트): 누구나 읽기전용 "우리 아파트예요 · 정원 50명"
 */
export function PromoteSettings({
  villa, isOwner, title, onPromoted, onAuthLost,
}: {
  villa: { id: string; name: string; members: unknown[]; kind?: VillaKind; capacity?: number };
  isOwner: boolean;
  title: string;
  onPromoted: (capacity: number) => void;
  onAuthLost: () => void;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok?: string; err?: string }>({});
  const memberCount = villa.members.length;
  const capacity = capacityOf(villa);
  const state = promoteState({ kind: villa.kind, capacity: villa.capacity, memberCount }, isOwner);

  async function promote() {
    setBusy(true);
    setNote({});
    try {
      const r = await api<{ capacity: number }>(`/api/villas/${villa.id}/promote`, { method: "POST" });
      setAsking(false);
      setNote({ ok: `아파트가 됐어요! 이제 ${r.capacity}명까지 함께 살 수 있어요. 빈방 모집도 다시 켤 수 있어요.` });
      onPromoted(r.capacity);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onAuthLost();
      setAsking(false);
      setNote({ err: msg(e) });
    } finally {
      setBusy(false);
    }
  }

  const progress = (
    <div className="promote-progress" role="img" aria-label={`입주민 ${memberCount}명, 정원 ${capacity}명`}>
      <span style={{ width: `${Math.min(100, Math.round((memberCount / capacity) * 100))}%` }} />
    </div>
  );

  let body: JSX.Element;
  if (state === "apartment") {
    body = (
      <p className="promote-done">
        <span className="kind-badge">아파트</span>
        <span>우리 아파트예요 · 정원 {capacity}명 (지금 {memberCount}명)</span>
      </p>
    );
  } else if (state === "eligible") {
    body = asking ? (
      <div className="promote-confirm" role="alertdialog" aria-label="아파트로 승격 확인">
        <p><b>아파트로 바꾸면 다시 빌라로 돌아갈 수 없어요.</b></p>
        <ul className="muted small">
          <li>정원이 {capacity}명에서 {APARTMENT_CAPACITY}명으로 늘어요</li>
          <li>이름 · 층 · 펜트하우스 · 집값 계산은 그대로예요</li>
          <li>입주민 모두에게 축하 카드가 가요</li>
        </ul>
        <div className="row">
          <button className="btn" type="button" disabled={busy} onClick={promote}>아파트로 바꾸기</button>
          <button className="btn ghost" type="button" disabled={busy} onClick={() => setAsking(false)}>취소</button>
        </div>
      </div>
    ) : (
      <>
        {progress}
        <p className="muted small">
          입주민 {memberCount}/{capacity}명이 다 모였어요! 아파트로 바꾸면 정원이 {APARTMENT_CAPACITY}명으로 늘어나 더 많은 이웃과 함께 살 수 있어요.
        </p>
        <button className="btn" type="button" onClick={() => { setNote({}); setAsking(true); }}>아파트로 승격</button>
      </>
    );
  } else {
    body = (
      <>
        {progress}
        <p className="muted small">
          {state === "member" && memberCount >= capacity
            ? `입주민 ${memberCount}/${capacity}명이 다 모였어요! 방장이 아파트로 바꾸면 정원이 ${APARTMENT_CAPACITY}명으로 늘어요.`
            : `입주민 ${memberCount}/${capacity}명 — ${capacity}명이 모이면 ${state === "member" ? "방장이 " : ""}아파트로 바꿀 수 있어요.`}
          {state === "member" && memberCount < capacity && ` 아파트가 되면 정원이 ${APARTMENT_CAPACITY}명으로 늘어요.`}
        </p>
      </>
    );
  }

  return (
    <section className="settings-section promote-section">
      <h2>{title}</h2>
      {body}
      {note.ok && <p className="ok" role="status">{note.ok}</p>}
      {note.err && <p className="error" role="alert">{note.err}</p>}
    </section>
  );
}
