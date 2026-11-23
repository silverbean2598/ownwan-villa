import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { api, ApiError } from "../api";
import { SpriteCrop } from "./avatar2/SpriteAvatar";
import { SPORT_LABEL, type Sport } from "../../shared/sports";
import type { AvatarSpec } from "../../shared/avatar";
import { objParticle } from "../events/plan";
import { Badge } from "./Badge";
import { parseAvatar, DEFAULT_AVATAR } from "../../shared/avatar";
import type { ReceivedApplication } from "../../shared/recruit";

export type Member = { userId: string; nickname: string; sport: Sport | null; avatar: AvatarSpec };
type Ban = { userId: string; nickname: string; createdAt: number };
type Ask = { kind: "kick" | "transfer"; m: Member } | { kind: "dissolve" } | null;

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");

/** 신청한 날 (한국 시간 "11월 19일") */
export const appliedDay = (ms: number) => {
  const d = new Date(ms + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
};

// 서 있는 그림(275 × 400)에서 얼굴 둘레
const HEAD_BOX = [30, 16, 216, 216] as const;

/** 얼굴만 잘라 보이는 작은 캐릭터 (목록이 길어도 화면 가까이 올 때 sm/ 그림을 받는다) */
export function MemberHead({ spec }: { spec: AvatarSpec }) {
  return <SpriteCrop className="member-head" spec={spec} box={HEAD_BOX} />;
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
 * 설정 → 방장 → 입주민 관리: 내보내기 · 방장 넘기기 · 내보낸 사람 다시 받기 · 아파트 해체.
 * onChanged: 입주민이 바뀌었으니 아파트 정보를 다시 불러온다. onTransferred: 방장을 넘긴 뒤. onDissolved: 해체된 뒤.
 */
export function MemberManage({
  villa, meId, onChanged, onTransferred, onDissolved, onAuthLost,
}: {
  villa: { id: string; name: string; ownerId: string; members: Member[] };
  meId: string;
  onChanged: () => Promise<void>;
  onTransferred: (nickname: string) => Promise<void>;
  onDissolved: () => void;
  onAuthLost: () => void;
}) {
  const [bans, setBans] = useState<Ban[]>([]);
  const [ask, setAsk] = useState<Ask>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok?: string; err?: string }>({});
  const [apps, setApps] = useState<ReceivedApplication[]>([]);
  const [appNote, setAppNote] = useState<{ ok?: string; err?: string }>({});

  // 받은 입주 신청 (방장만). 방장을 넘겨받으면 새 방장에게 보인다
  const loadApps = useCallback(async () => {
    setApps(await api<ReceivedApplication[]>(`/api/villas/${villa.id}/applications`));
  }, [villa.id]);
  useEffect(() => {
    loadApps().catch(() => {});
  }, [loadApps]);

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

  /** 승인 · 거절: 실패해도(그 사이 꽉 참 · 3곳 · 만료) 목록을 다시 받아 끝난 신청을 치운다 */
  async function decide(a: ReceivedApplication, approve: boolean) {
    setBusy(true);
    setAppNote({});
    try {
      await api(`/api/villas/${villa.id}/applications/${a.id}/${approve ? "approve" : "reject"}`, { method: "POST" });
      setAppNote({ ok: approve ? `${a.nickname} 님이 입주했어요` : `${a.nickname} 님의 신청을 거절했어요` });
      if (approve) await onChanged();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onAuthLost();
      setAppNote({ err: msg(e) });
    } finally {
      await loadApps().catch(() => {});
      setBusy(false);
    }
  }

  const kick = (m: Member) =>
    act(`${m.nickname} 님을 내보냈어요`, async () => {
      await api(`/api/villas/${villa.id}/members/${m.userId}/kick`, { method: "POST" });
      await onChanged();
      await loadBans();
    });
  // 넘기면 나는 방장이 아니라 이 화면이 사라지므로 안내는 설정 화면(onTransferred)이 띄운다
  const transfer = (m: Member) =>
    act("", async () => {
      await api(`/api/villas/${villa.id}/transfer`, { method: "POST", body: JSON.stringify({ userId: m.userId }) });
      await onTransferred(m.nickname);
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
    <section className="settings-section" id="members">
      <h2>입주민 관리</h2>
      <h3 className="sub-title" style={{ marginTop: 4 }}>입주 신청<Badge count={apps.length} /></h3>
      {apps.length === 0 ? (
        <p className="muted small">기다리는 입주 신청이 없어요. 빈방 모집을 켜면 도시 지도에서 신청을 받을 수 있어요.</p>
      ) : (
        <ul className="apply-list" aria-label="받은 입주 신청">
          {apps.map((a) => (
            <li className="apply-row" key={a.id}>
              <div className="apply-top">
                <MemberHead spec={parseAvatar(a.avatar) ?? DEFAULT_AVATAR} />
                <div className="member-info">
                  <span className="member-name">{a.nickname}</span>
                  <span className="member-sub">
                    <span className="streak-chip">연속 {a.streak}일</span>
                    <span>{a.sport ? SPORT_LABEL[a.sport] : "종목 없음"}</span>
                    <span>· {appliedDay(a.createdAt)} 신청</span>
                  </span>
                </div>
              </div>
              {a.message && <p className="apply-msg">{a.message}</p>}
              <div className="apply-actions">
                <button className="btn small" type="button" disabled={busy} aria-label={`${a.nickname} 님 승인`} onClick={() => decide(a, true)}>승인</button>
                <button className="btn ghost small" type="button" disabled={busy} aria-label={`${a.nickname} 님 거절`} onClick={() => decide(a, false)}>거절</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {apps.length > 0 && <p className="muted small">승인하면 바로 입주해요. 거절해도 이유는 알리지 않아요.</p>}
      {appNote.ok && <p className="ok" role="status">{appNote.ok}</p>}
      {appNote.err && <p className="error" role="alert">{appNote.err}</p>}

      <h3 className="sub-title">입주민 {villa.members.length}명</h3>
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
        <h3 className="sub-title">아파트 해체</h3>
        <p className="muted small">해체하면 입주민 모두 아파트를 나가고 초대 링크도 쓸 수 없어요. 연속 기록 · 포인트 · 가구는 그대로예요.</p>
        <button className="btn danger ghost" type="button" onClick={() => setAsk({ kind: "dissolve" })}>아파트 해체하기</button>
      </div>

      {note.ok && <p className="ok" role="status">{note.ok}</p>}
      {note.err && <p className="error" role="alert">{note.err}</p>}

      {ask?.kind === "kick" && (
        <Confirm label="내보내기 확인" onCancel={close}>
          <p>{ask.m.nickname} 님을 아파트에서 내보낼까요? 내보낸 사람은 방장이 풀어 줄 때까지 다시 입주할 수 없어요.</p>
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
        <Confirm label="아파트 해체 확인" onCancel={close}>
          <p>
            <b>{villa.name}</b>{objParticle(villa.name)} 해체할까요? 되돌릴 수 없어요.
          </p>
          <div className="field">
            <label htmlFor="confirm-villa-name">아파트 이름을 입력하면 해체돼요</label>
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
