import { useState } from "react";
import { api, ApiError } from "../api";
import type { MyVilla } from "../../shared/villa";

type V = Pick<MyVilla, "id" | "name" | "certifiedToday">;

/**
 * 오늘 인증을 올릴 아파트 [확정 — 기획자 결정, 2026-11-19]
 * - 아파트 없음 : 안내만 (지금처럼 기록만 남는다)
 * - 아파트 1곳 : 읽기전용 — "OO에 올라가요"
 * - 아파트 2곳 이상 : 체크박스. 처음에는 모두 체크(신규입력), 언제든 바꿀 수 있다(수정). 마지막 하나는 끌 수 없다.
 *   오늘 이미 올린 아파트에는 "오늘 올렸어요" 표시
 */
export function VillaPicks({ villas, picked, onChange, disabled = false }: { villas: V[]; picked: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  if (villas.length === 0) return <p className="villa-one muted">아파트 없이 내 기록으로만 남아요.</p>;
  if (villas.length === 1)
    return (
      <p className="villa-one">
        <b>{villas[0].name}</b>에 올라가요
      </p>
    );
  const on = villas.filter((v) => picked.includes(v.id));
  return (
    <fieldset className="villa-picks" disabled={disabled}>
      <legend>올릴 아파트</legend>
      {villas.map((v) => {
        const checked = picked.includes(v.id);
        const last = checked && on.length === 1;
        return (
          <label key={v.id} className="villa-pick">
            <input
              type="checkbox"
              checked={checked}
              // 하나는 남아 있어야 한다
              disabled={last}
              aria-describedby={last ? "villa-pick-hint" : undefined}
              onChange={() => onChange(checked ? picked.filter((x) => x !== v.id) : [...picked, v.id])}
            />
            <span className="name">{v.name}</span>
            {v.certifiedToday && <span className="posted">오늘 올렸어요</span>}
          </label>
        );
      })}
      <p className="hint" id="villa-pick-hint">
        {on.length === 1 ? "아파트를 하나 이상 골라야 해요. " : ""}고른 아파트에서만 방에 불이 켜지고 사진이 보여요. 포인트는 한 번만 받아요.
      </p>
    </fieldset>
  );
}

/**
 * 다른 아파트에도 올리기: 오늘 어느 아파트엔가 사진 인증을 올렸고 아직 안 올린 아파트가 있을 때만 보인다.
 * 오늘 올린 사진 · 루틴을 그 아파트에도 붙인다. 포인트는 더 받지 않는다. 아파트에서 내리기는 없다.
 */
export function AddToVillas({
  villas,
  focusId,
  onAdded,
  onAuthLost,
}: {
  villas: V[];
  focusId?: string | null;
  onAdded: () => void | Promise<void>;
  onAuthLost: () => void;
}) {
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState<{ ok?: string; err?: string }>({});
  if (!villas.some((v) => v.certifiedToday)) return null;
  // 방금 이 화면에서 올린 아파트도 계속 보여 줘서 결과 문구가 사라지지 않게 한다
  const rest = villas.filter((v) => !v.certifiedToday);
  if (!rest.length && !note.ok) return null;
  const sorted = [...rest].sort((a, b) => Number(b.id === focusId) - Number(a.id === focusId));

  async function add(v: V) {
    setBusy(v.id);
    setNote({});
    try {
      await api("/api/certs/today/villas", { method: "POST", body: JSON.stringify({ villaIds: [v.id] }) });
      setNote({ ok: `${v.name}에도 올렸어요. 포인트는 한 번만 받아요` });
      await onAdded();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onAuthLost();
      setNote({ err: e instanceof ApiError ? e.message : "올리지 못했어요. 다시 해 주세요" });
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="add-more" aria-labelledby="add-more-title">
      <h2 id="add-more-title">다른 아파트에도 올리기</h2>
      <p className="muted">오늘 올린 사진과 루틴을 다른 아파트에도 붙여요. 오늘 안에만 할 수 있어요.</p>
      {sorted.map((v) => (
        <div className="add-more-row" key={v.id}>
          <span>{v.name}</span>
          <button type="button" className="btn ghost" disabled={!!busy} aria-label={`${v.name}에도 올리기`} onClick={() => add(v)}>
            {busy === v.id ? "올리는 중" : "올리기"}
          </button>
        </div>
      ))}
      {note.ok && <p className="ok" role="status">{note.ok}</p>}
      {note.err && <p className="error" role="alert">{note.err}</p>}
    </section>
  );
}
