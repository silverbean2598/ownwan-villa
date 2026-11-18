import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { Badge } from "../components/Badge";
import { AvatarEditor } from "../components/AvatarEditor";
import { SportCards } from "../components/SportCards";
import { DEFAULT_AVATAR, type AvatarSpec } from "../../shared/avatar";
import type { Sport } from "../../shared/sports";

type Me = { id: string; username: string; nickname: string; sport: Sport | null; avatar: AvatarSpec };
type VillaInfo = { id: string; name: string; ownerId: string; inviteToken?: string } | null;
type Pending = { id: string; nickname: string }[];
type Note = { ok?: string; err?: string };

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");

function Section({ title, note, children }: { title: ReactNode; note?: Note; children: ReactNode }) {
  return (
    <section className="settings-section">
      <h2>{title}</h2>
      {children}
      {note?.ok && <p className="ok" role="status">{note.ok}</p>}
      {note?.err && <p className="error" role="alert">{note.err}</p>}
    </section>
  );
}

export function Settings() {
  const nav = useNavigate();
  const [me, setMe] = useState<Me | null>(null);
  const [villa, setVilla] = useState<VillaInfo>(null);
  const [pending, setPending] = useState<Pending>([]);
  const [loadError, setLoadError] = useState("");
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [nickname, setNickname] = useState("");
  const [sport, setSport] = useState<Sport | null>(null);
  const [avatar, setAvatar] = useState<AvatarSpec>(DEFAULT_AVATAR);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [newCode, setNewCode] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const [villaName, setVillaName] = useState("");
  const [confirm, setConfirm] = useState<"" | "leave" | "delete">("");
  const [typed, setTyped] = useState("");

  const note = (k: string, n: Note) => setNotes((p) => ({ ...p, [k]: n }));
  async function run(k: string, ok: string, fn: () => Promise<unknown>) {
    note(k, {});
    try {
      await fn();
      note(k, { ok });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return nav("/login?next=/settings", { replace: true });
      note(k, { err: msg(e) });
    }
  }
  async function loadPending() {
    setPending(await api<Pending>("/api/recover/pending"));
  }

  useEffect(() => {
    (async () => {
      try {
        const m = await api<Me>("/api/me");
        const v = await api<VillaInfo>("/api/villas/mine");
        setMe(m);
        setNickname(m.nickname);
        setSport(m.sport);
        setAvatar(m.avatar);
        setVilla(v);
        setVillaName(v?.name ?? "");
        if (v) await loadPending();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return nav("/login?next=/settings", { replace: true });
        setLoadError(msg(e));
      }
    })();
  }, [nav]);

  if (loadError) return <main className="page"><p className="error" role="alert">{loadError}</p></main>;
  if (!me) return <main className="page"><p className="muted">불러오는 중이에요</p></main>;

  const patch = (body: object) => api("/api/me", { method: "PATCH", body: JSON.stringify(body) });
  const isOwner = !!villa && villa.ownerId === me.id;
  const inviteUrl = villa?.inviteToken ? `${location.origin}/join/${villa.inviteToken}` : "";

  return (
    <main className="page">
      <Link className="back" to="/villa">← 빌라로</Link>
      <h1>설정</h1>

      {pending.length > 0 && (
        <Section title={<>계정 복구 승인 요청<Badge count={pending.length} /></>} note={notes.recover}>
          <p className="muted">비밀번호를 잃어버린 입주민이 확인을 부탁했어요. 본인이 맞는지 확인하고 승인해 주세요.</p>
          {pending.map((r) => (
            <div className="row" key={r.id} style={{ alignItems: "center", justifyContent: "space-between" }}>
              <span>{r.nickname}</span>
              <button
                className="btn"
                type="button"
                onClick={() => run("recover", "승인했어요", async () => {
                  await api(`/api/recover/${r.id}/approve`, { method: "POST" });
                  await loadPending();
                })}
              >
                승인
              </button>
            </div>
          ))}
        </Section>
      )}

      <Section title="내 정보" note={notes.nick}>
        <p className="muted">아이디 {me.username}</p>
        <div className="field">
          <label htmlFor="nickname">닉네임</label>
          <input id="nickname" type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </div>
        <button className="btn" type="button" onClick={() => run("nick", "저장했어요", () => patch({ nickname }))}>저장</button>
      </Section>

      <Section title="운동 종목" note={notes.sport}>
        <SportCards value={sport} avatar={avatar} onChange={setSport} />
        <button className="btn" type="button" disabled={!sport} style={{ marginTop: 12 }} onClick={() => run("sport", "저장했어요", () => patch({ sport }))}>
          저장
        </button>
      </Section>

      <Section title="캐릭터 꾸미기" note={notes.avatar}>
        <AvatarEditor value={avatar} onChange={setAvatar} />
        <button className="btn" type="button" onClick={() => run("avatar", "저장했어요", () => patch({ avatar }))}>저장</button>
      </Section>

      <Section title="비밀번호 변경" note={notes.pw}>
        <div className="field">
          <label htmlFor="pw-current">지금 비밀번호</label>
          <input id="pw-current" type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="pw-next">새 비밀번호 (8~128자)</label>
          <input id="pw-next" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        </div>
        <button
          className="btn"
          type="button"
          onClick={() => run("pw", "바꿨어요. 다른 기기는 로그아웃돼요", async () => {
            await api("/api/me/password", { method: "POST", body: JSON.stringify(pw) });
            setPw({ current: "", next: "" });
          })}
        >
          바꾸기
        </button>
      </Section>

      <Section title="복구 코드 다시 받기" note={notes.code}>
        <p className="muted">새 코드를 받으면 예전 코드는 쓸 수 없어요.</p>
        {newCode && (
          <>
            <div className="code" aria-label="새 복구 코드">{newCode}</div>
            <p className="muted">이 화면을 닫으면 다시 볼 수 없어요.</p>
            <button
              className="btn ghost"
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(newCode);
                  setCodeCopied(true);
                } catch {
                  setCodeCopied(false);
                }
              }}
            >
              {codeCopied ? "복사했어요" : "복사"}
            </button>
          </>
        )}
        {!newCode && (
          <button
            className="btn"
            type="button"
            onClick={() => run("code", "", async () => {
              const r = await api<{ recoveryCode: string }>("/api/recovery-code/reissue", { method: "POST" });
              setNewCode(r.recoveryCode);
            })}
          >
            새 코드 받기
          </button>
        )}
      </Section>

      {villa && isOwner && (
        <Section title="빌라 (방장)" note={notes.villa}>
          <div className="field">
            <label htmlFor="villa-name">빌라 이름</label>
            <input id="villa-name" type="text" value={villaName} onChange={(e) => setVillaName(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn" type="button" onClick={() => run("villa", "저장했어요", () => api(`/api/villas/${villa.id}`, { method: "PATCH", body: JSON.stringify({ name: villaName }) }))}>
              이름 바꾸기
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => run("villa", "새 초대 링크를 만들었어요. 예전 링크는 쓸 수 없어요", async () => {
                const r = await api<{ inviteToken: string }>(`/api/villas/${villa.id}/invite/rotate`, { method: "POST" });
                setVilla({ ...villa, inviteToken: r.inviteToken });
              })}
            >
              초대 링크 새로 만들기
            </button>
          </div>
          {inviteUrl && <input className="invite-fallback" readOnly value={inviteUrl} aria-label="초대 링크" onFocus={(e) => e.currentTarget.select()} />}
        </Section>
      )}

      {villa && (
        <Section title="빌라 나가기" note={notes.leave}>
          {confirm === "leave" ? (
            <div role="alertdialog" aria-label="빌라 나가기 확인">
              <p>빌라를 나갈까요? 연속 기록과 포인트, 가구는 그대로지만 층은 1층부터 다시 시작해요.</p>
              <div className="row">
                <button className="btn danger" type="button" onClick={() => run("leave", "", async () => {
                  await api("/api/villas/leave", { method: "POST" });
                  nav("/villa", { replace: true });
                })}>나갈게요</button>
                <button className="btn ghost" type="button" onClick={() => setConfirm("")}>취소</button>
              </div>
            </div>
          ) : (
            <button className="btn danger ghost" type="button" onClick={() => setConfirm("leave")}>빌라 나가기</button>
          )}
        </Section>
      )}

      <Section title="로그아웃" note={notes.logout}>
        <button className="btn ghost" type="button" onClick={() => run("logout", "", async () => {
          await api("/api/logout", { method: "POST" });
          nav("/", { replace: true });
        })}>로그아웃</button>
      </Section>

      <Section title="탈퇴" note={notes.delete}>
        {confirm === "delete" ? (
          <div role="alertdialog" aria-label="탈퇴 확인">
            <p>탈퇴하면 계정, 인증 사진, 루틴이 바로 삭제되고 되돌릴 수 없어요. 계속하려면 아이디 <b>{me.username}</b>를 입력해 주세요.</p>
            <div className="field">
              <label htmlFor="confirm-username">아이디 확인</label>
              <input id="confirm-username" type="text" autoCapitalize="none" autoCorrect="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </div>
            <div className="row">
              <button
                className="btn danger"
                type="button"
                disabled={typed !== me.username}
                onClick={() => run("delete", "", async () => {
                  await api("/api/me", { method: "DELETE" });
                  nav("/", { replace: true });
                })}
              >
                탈퇴하기
              </button>
              <button className="btn ghost" type="button" onClick={() => { setConfirm(""); setTyped(""); }}>취소</button>
            </div>
          </div>
        ) : (
          <button className="btn danger ghost" type="button" onClick={() => setConfirm("delete")}>탈퇴</button>
        )}
      </Section>

      <footer className="settings-foot">
        <Link to="/terms">이용약관</Link>
        <Link to="/privacy">개인정보 처리방침</Link>
      </footer>
    </main>
  );
}
