import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { api, ApiError } from "../api";
import { Avatar } from "./Avatar";
import { SPORT_LABEL, type Sport } from "../../shared/sports";
import type { AvatarSpec } from "../../shared/avatar";
import { objParticle } from "../events/plan";

export type Member = { userId: string; nickname: string; sport: Sport | null; avatar: AvatarSpec };
type Ban = { userId: string; nickname: string; createdAt: number };
type Ask = { kind: "kick" | "transfer"; m: Member } | { kind: "dissolve" } | null;

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");

/** 얼굴만 잘라 보이는 작은 캐릭터 */
function MemberHead({ spec }: { spec: AvatarSpec }) {
  return (
    <svg className="member-head" viewBox="14 4 92 92" aria-hidden="true">
      <Avatar size={120} spec={spec} />
    </svg>
  );
}

/** 화면 안 확인 창. Esc · [취소]로 닫힌다 */
function Confirm({ label, children, onCancel }: { label: string; children: ReactNode; onCancel: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.querySelector<HTMLElement>("input, button:not(:disabled)")?.focus();
  }, []);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") onCancel();
  };
  return (
    <div className="confirm-overlay" onKeyDown={onKey} onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="confirm-box" role="alertdialog" aria-modal="true" aria-label={label} ref={box}>
        {children}
      </div>
    </div>
  );
}

/**
 * 설정 → 방장 → 입주민 관리: 내보내기 · 방장 넘기기 · 내보낸 사람 다시 받기 · 빌라 해체.
 * onChanged: 입주민 · 방장이 바뀌었으니 빌라 정보를 다시 불러온다. onDissolved: 해체된 뒤.
 */
export function MemberManage({
  villa, meId, onChanged, onDissolved, onAuthLost,
}: {
  villa: { id: string; name: string; ownerId: string; members: Member[] };
  meId: string;
  onChanged: () => Promise<void>;
  onDissolved: () => void;
  onAuthLost: () => void;
}) {
  const [bans, setBans] = useState<Ban[]>([]);
  const [ask, setAsk] = useState<Ask>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok?: string; err?: string }>({});

  const loadBans = useCallback(async () => {
    setBans(await api<Ban[]>(`/api/villas/${villa.id}/bans`));
  }, [villa.id]);
  useEffect(() => {
    loadBans().catch(() => {});
  }, [loadBans]);

  const close = () => {
    setAsk(null);
    setTyped("");
  };
  async function act(ok: string, fn: () => Promise<unknown>) {
    setBusy(true);
    setNote({});
    try {
      await fn();
      close();
      setNote({ ok });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onAuthLost();
      close();
      setNote({ err: msg(e) });
    } finally {
      setBusy(false);
    }
  }

  const kick = (m: Member) =>
    act(`${m.nickname} 님을 내보냈어요`, async () => {
      await api(`/api/villas/${villa.id}/members/${m.userId}/kick`, { method: "POST" });
      await onChanged();
      await loadBans();
    });
  const transfer = (m: Member) =>
    act(`${m.nickname} 님에게 방장을 넘겼어요`, async () => {
      await api(`/api/villas/${villa.id}/transfer`, { method: "POST", body: JSON.stringify({ userId: m.userId }) });
      await onChanged();
    });
  const unban = (b: Ban) =>
    act(`${b.nickname} 님이 다시 입주할 수 있어요`, async () => {
      await api(`/api/villas/${villa.id}/bans/${b.userId}`, { method: "DELETE" });
      await loadBans();
    });
  const dissolve = () =>
    act("", async () => {
      await api(`/api/villas/${villa.id}/dissolve`, { method: "POST", body: JSON.stringify({ confirmName: typed }) });
      onDissolved();
    });

  return (
    <section className="settings-section">
      <h2>입주민 관리</h2>
      <ul className="member-list">
        {villa.members.map((m) => (
          <li className="member-row" key={m.userId}>
            <MemberHead spec={m.avatar} />
            <div className="member-info">
              <span className="member-name">{m.nickname}</span>
              <span className="member-sub">
                {m.userId === villa.ownerId && <span className="owner-badge">방장</span>}
                {m.sport ? SPORT_LABEL[m.sport] : "종목 없음"}
              </span>
            </div>
            {m.userId !== meId && (
              <div className="member-actions">
                <button className="btn ghost small" type="button" onClick={() => setAsk({ kind: "transfer", m })}>방장 넘기기</button>
                <button className="btn danger ghost small" type="button" onClick={() => setAsk({ kind: "kick", m })}>내보내기</button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <h3 className="sub-title">내보낸 사람</h3>
      {bans.length === 0 ? (
        <p className="muted small">내보낸 사람이 없어요.</p>
      ) : (
        <ul className="member-list">
          {bans.map((b) => (
            <li className="member-row ban-row" key={b.userId}>
              <div className="member-info">
                <span className="member-name">{b.nickname}</span>
              </div>
              <div className="member-actions">
                <button className="btn ghost small" type="button" disabled={busy} onClick={() => unban(b)}>다시 받기</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="danger-zone">
        <h3 className="sub-title">빌라 해체</h3>
        <p className="muted small">해체하면 입주민 모두 빌라를 나가고 초대 링크도 쓸 수 없어요. 연속 기록 · 포인트 · 가구는 그대로예요.</p>
        <button className="btn danger ghost" type="button" onClick={() => setAsk({ kind: "dissolve" })}>빌라 해체하기</button>
      </div>

      {note.ok && <p className="ok" role="status">{note.ok}</p>}
      {note.err && <p className="error" role="alert">{note.err}</p>}

      {ask?.kind === "kick" && (
        <Confirm label="내보내기 확인" onCancel={close}>
          <p>{ask.m.nickname} 님을 빌라에서 내보낼까요? 내보낸 사람은 방장이 풀어 줄 때까지 다시 입주할 수 없어요.</p>
          <div className="row">
            <button className="btn danger" type="button" disabled={busy} onClick={() => kick(ask.m)}>내보내기</button>
            <button className="btn ghost" type="button" onClick={close}>취소</button>
          </div>
        </Confirm>
      )}
      {ask?.kind === "transfer" && (
        <Confirm label="방장 넘기기 확인" onCancel={close}>
          <p>{ask.m.nickname} 님에게 방장을 넘길까요? 넘기면 나는 일반 입주민이 돼요.</p>
          <div className="row">
            <button className="btn" type="button" disabled={busy} onClick={() => transfer(ask.m)}>넘기기</button>
            <button className="btn ghost" type="button" onClick={close}>취소</button>
          </div>
        </Confirm>
      )}
      {ask?.kind === "dissolve" && (
        <Confirm label="빌라 해체 확인" onCancel={close}>
          <p>
            <b>{villa.name}</b>{objParticle(villa.name)} 해체할까요? 되돌릴 수 없어요.
          </p>
          <div className="field">
            <label htmlFor="confirm-villa-name">빌라 이름을 입력하면 해체돼요</label>
            <input id="confirm-villa-name" type="text" autoComplete="off" placeholder={villa.name} value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn danger" type="button" disabled={busy || typed.trim() !== villa.name} onClick={dissolve}>해체하기</button>
            <button className="btn ghost" type="button" onClick={close}>취소</button>
          </div>
        </Confirm>
      )}
    </section>
  );
}
