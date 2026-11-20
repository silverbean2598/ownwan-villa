import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { Badge } from "../components/Badge";
import { AvatarEditor } from "../components/AvatarEditor";
import { SportCards } from "../components/SportCards";
import { MemberManage, type Member } from "../components/MemberManage";
import { pokeEvents } from "../events/poke";
import { VillaSwitcher } from "../components/VillaSwitcher";
import { loadMyVillas, pickVilla, writeCurrentVilla } from "../villa/current";
import type { MyVilla, VillaKind } from "../../shared/villa";
import { PromoteSettings } from "../components/PromoteSettings";
import { KakaoSection, type KakaoStatus } from "../components/kakao/KakaoSection";
import { DEFAULT_AVATAR, type AvatarSpec } from "../../shared/avatar";
import type { Sport } from "../../shared/sports";
import { RecruitSettings } from "../components/RecruitSettings";
import { daysLeft } from "../components/city/RecruitCard";
import type { MyApplication } from "../../shared/recruit";

type Me = { id: string; username: string; nickname: string; sport: Sport | null; avatar: AvatarSpec };
type VillaInfo = {
  id: string; name: string; ownerId: string; inviteToken?: string; public?: boolean; members: Member[];
  /** 건물 종류 · 정원 (예전 서버 응답에는 없다 → 빌라 · 20명) */
  kind?: VillaKind; capacity?: number;
} | null;
type Pending = { id: string; nickname: string }[];
type Note = { ok?: string; err?: string };

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");

function Section({ title, note, children, id }: { title: ReactNode; note?: Note; children: ReactNode; id?: string }) {
  return (
    <section className="settings-section" id={id}>
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
  // 내가 사는 빌라 모두. 빌라 설정(방장 메뉴 · 공개 · 나가기)은 고른 빌라 하나에 대해 보여 준다
  const [villas, setVillas] = useState<MyVilla[]>([]);
  const [pending, setPending] = useState<Pending>([]);
  const [loadError, setLoadError] = useState("");
  const [notes, setNotes] = useState<Record<string, Note>>({});
  const [nickname, setNickname] = useState("");
  const [sport, setSport] = useState<Sport | null>(null);
  const [avatar, setAvatar] = useState<AvatarSpec>(DEFAULT_AVATAR);
  const [owned, setOwned] = useState<string[]>([]);
  const [pw, setPw] = useState({ current: "", next: "" });
  const [newCode, setNewCode] = useState("");
  const [codeCopied, setCodeCopied] = useState(false);
  const [villaName, setVillaName] = useState("");
  const [confirm, setConfirm] = useState<"" | "leave" | "delete">("");
  const [typed, setTyped] = useState("");
  const [busyCity, setBusyCity] = useState(false);
  // 카카오 연결 상태 (따로 불러온다: 실패해도 나머지 설정은 그대로 쓴다)
  const [kakao, setKakao] = useState<KakaoStatus | null>(null);
  // 내가 보낸, 기다리는 입주 신청 (따로 불러온다)
  const [myApp, setMyApp] = useState<MyApplication | null>(null);
  const kakaoNotice = useSearchParams()[0].get("kakao");
  const passwordless = kakao?.hasPassword === false;

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
  /** 내 빌라 목록과 고른 빌라(want → 이 기기에서 마지막으로 본 빌라 → 첫 빌라)의 정보를 불러온다 */
  async function loadVillas(want?: string | null) {
    let list = await loadMyVillas();
    let id = pickVilla(list, want);
    let v: VillaInfo = null;
    try {
      v = id ? await api<NonNullable<VillaInfo>>(`/api/villas/${id}`) : null;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
      // 목록을 받은 뒤 그 빌라에서 나갔거나 내보내졌다: 목록을 다시 받아 다른 빌라로
      list = (await loadMyVillas()).filter((x) => x.id !== id);
      id = pickVilla(list);
      v = id ? await api<NonNullable<VillaInfo>>(`/api/villas/${id}`) : null;
      if (id) writeCurrentVilla(id);
    }
    setVillas(list);
    setVilla(v);
    setVillaName(v?.name ?? "");
    setConfirm((c) => (c === "leave" ? "" : c));
    return v;
  }
  /** 방장 넘기기 · 내보내기 뒤: 빌라 정보(방장 · 입주민 · 초대 링크)를 다시 불러온다 */
  async function reloadVilla() {
    const v = await loadVillas(villa?.id);
    pokeEvents();
    if (v) await loadPending().catch(() => {});
  }

  useEffect(() => {
    (async () => {
      try {
        const m = await api<Me>("/api/me");
        const v = await loadVillas();
        setMe(m);
        setNickname(m.nickname);
        setSport(m.sport);
        setAvatar(m.avatar);
        if (v) await loadPending();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return nav("/login?next=/settings", { replace: true });
        setLoadError(msg(e));
      }
    })();
  }, [nav]);

  // 가진 옷 · 소품은 따로 불러온다: 실패해도 설정 화면(비밀번호 · 빌라 나가기 등)은 그대로 쓴다
  useEffect(() => {
    api<{ owned: string[] }>("/api/shop").then((s) => setOwned(s.owned), () => {});
  }, []);

  useEffect(() => {
    api<KakaoStatus>("/api/auth/kakao/status").then(setKakao, () => {});
  }, []);

  useEffect(() => {
    api<{ pending: MyApplication | null }>("/api/me/application").then((r) => setMyApp(r?.pending ?? null), () => {});
  }, []);

  // 상점의 [꾸미러 가기](/settings#avatar)로 오면 캐릭터 꾸미기로 내려간다
  useEffect(() => {
    if (me && location.hash === "#avatar") document.getElementById("avatar")?.scrollIntoView();
  }, [me]);

  if (loadError) return <main className="page"><p className="error" role="alert">{loadError}</p></main>;
  if (!me) return <main className="page"><p className="muted">불러오는 중이에요</p></main>;

  const patch = (body: object) => api("/api/me", { method: "PATCH", body: JSON.stringify(body) });
  const isOwner = !!villa && villa.ownerId === me.id;
  const inviteUrl = villa?.inviteToken ? `${location.origin}/join/${villa.inviteToken}` : "";

  return (
    <main className="page">
      <Link className="back" to={villa ? `/villa/${villa.id}` : "/villa"}>← 빌라로</Link>
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

      {myApp && (
        <Section title="내 입주 신청" note={notes.apply}>
          <div className="my-apply" role="status">
            <span>
              <b>{myApp.villaName}</b>에 입주 신청했어요. 방장이 승인하면 바로 입주해요. ({daysLeft(myApp.expiresAt)}일 뒤 만료)
            </span>
            <button
              className="btn ghost small"
              type="button"
              onClick={() => run("apply", "신청을 취소했어요", async () => {
                await api(`/api/applications/${myApp.id}/cancel`, { method: "POST" });
                setMyApp(null);
              })}
            >
              신청 취소
            </button>
          </div>
        </Section>
      )}

      <Section title="내 정보" note={notes.nick}>
        <p className="muted">{passwordless ? "카카오로 로그인해요" : `아이디 ${me.username}`}</p>
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

      <Section title="캐릭터 꾸미기" note={notes.avatar} id="avatar">
        <AvatarEditor value={avatar} onChange={setAvatar} owned={owned} />
        <button className="btn" type="button" onClick={() => run("avatar", "저장했어요", () => patch({ avatar }))}>저장</button>
      </Section>

      {kakao && <KakaoSection status={kakao} notice={kakaoNotice} onChanged={setKakao} />}

      {/* 카카오로만 가입한 계정은 비밀번호 · 복구 코드가 없다 */}
      {!passwordless && <>
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
      </>}

      {villas.length > 1 && villa && (
        <section className="settings-section" aria-label="빌라 고르기">
          <h2>빌라별 설정</h2>
          <p className="muted small">아래 방장 메뉴 · 도시 지도 공개 · 빈방 모집 · 빌라 나가기는 고른 빌라에만 적용돼요.</p>
          <VillaSwitcher
            villas={villas}
            currentId={villa.id}
            label="설정할 빌라"
            onPick={(id) => {
              writeCurrentVilla(id);
              setNotes((p) => ({ ...p, villa: {}, city: {}, leave: {}, transfer: {} }));
              void loadVillas(id).catch((e) => note("leave", { err: msg(e) }));
            }}
          />
        </section>
      )}

      {villa && isOwner && (
        <Section title={villas.length > 1 ? `${villa.name} (방장)` : "빌라 (방장)"} note={notes.villa}>
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
          {inviteUrl && <textarea className="invite-fallback" readOnly rows={2} value={inviteUrl} aria-label="초대 링크" onFocus={(e) => e.currentTarget.select()} />}
        </Section>
      )}

      {villa && (
        <Section title={villas.length > 1 ? `${villa.name} 도시 지도 공개` : "도시 지도에 공개"} note={notes.city}>
          {isOwner ? (
            <>
              <label className="switch-row">
                <span>
                  <b>{villa.public ? "지도에 나와요" : "지도에 나오지 않아요"}</b>
                  <span className="muted small">켜면 다른 빌라도 빌라 이름 · 건물 · 불 켜진 방 수를 볼 수 있어요. 사진과 루틴은 계속 우리끼리만 봐요.</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  className={`switch${villa.public ? " on" : ""}`}
                  aria-checked={!!villa.public}
                  aria-label="도시 지도에 공개"
                  disabled={busyCity}
                  onClick={async () => {
                    const next = !villa.public;
                    setBusyCity(true);
                    await run("city", next ? "지도에 공개했어요" : "지도에서 내렸어요", async () => {
                      await api(`/api/villas/${villa.id}/public`, { method: "PUT", body: JSON.stringify({ public: next }) });
                      setVilla({ ...villa, public: next });
                    });
                    setBusyCity(false);
                  }}
                >
                  <span className="knob" />
                </button>
              </label>
              <Link className="text-link" to="/city">도시 보러 가기</Link>
            </>
          ) : (
            <p className="muted small">
              {villa.public ? "우리 빌라는 지도에 나와요." : "우리 빌라는 지도에 나오지 않아요."} 공개 설정은 방장이 해요.
            </p>
          )}
        </Section>
      )}

      {villa && (
        <Section title={villas.length > 1 ? `${villa.name} 집값 대결` : "집값 대결"}>
          <p className="muted small">
            {isOwner
              ? "다른 공개 빌라에 7일 집값 대결을 신청하거나, 받은 신청에 답할 수 있어요."
              : "우리 빌라 대결 상황을 볼 수 있어요. 신청하고 받는 건 방장이 해요."}
          </p>
          <Link className="text-link" to={`/battle/${villa.id}`} style={{ marginTop: 0 }}>대결 화면 열기</Link>
        </Section>
      )}

      {villa && (
        <PromoteSettings
          key={villa.id}
          villa={villa}
          isOwner={isOwner}
          title={villas.length > 1 ? `${villa.name} 아파트 승격` : "아파트 승격"}
          onPromoted={(capacity) => {
            setVilla({ ...villa, kind: "apartment", capacity });
            // 축하 카드를 바로 보여 준다
            pokeEvents();
          }}
          onAuthLost={() => nav("/login?next=/settings", { replace: true })}
        />
      )}

      {villa && (
        <RecruitSettings
          villa={villa}
          isOwner={isOwner}
          title={villas.length > 1 ? `${villa.name} 빈방 모집` : "빈방 모집"}
          onPublished={() => setVilla({ ...villa, public: true })}
          onAuthLost={() => nav("/login?next=/settings", { replace: true })}
        />
      )}

      {villa && isOwner && (
        <MemberManage
          villa={villa}
          meId={me.id}
          onChanged={reloadVilla}
          onTransferred={async (nickname) => {
            await reloadVilla();
            note("transfer", { ok: `${nickname} 님에게 방장을 넘겼어요` });
          }}
          onDissolved={() => {
            pokeEvents();
            nav("/villa", { replace: true });
          }}
          onAuthLost={() => nav("/login?next=/settings", { replace: true })}
        />
      )}

      {notes.transfer?.ok && <p className="ok" role="status">{notes.transfer.ok}</p>}

      {villa && (
        <Section title={villas.length > 1 ? `${villa.name} 나가기` : "빌라 나가기"} note={notes.leave}>
          {confirm === "leave" ? (
            <div role="alertdialog" aria-label="빌라 나가기 확인">
              <p>
                {villas.length > 1
                  ? `${villa.name}에서 나갈까요? 연속 기록과 포인트, 가구, 다른 빌라는 그대로예요. 다시 들어오면 이 빌라에서는 1층부터 시작해요.`
                  : "빌라를 나갈까요? 연속 기록과 포인트, 가구는 그대로지만 층은 1층부터 다시 시작해요."}
              </p>
              <div className="row">
                <button className="btn danger" type="button" onClick={() => run("leave", "", async () => {
                  await api(`/api/villas/${villa.id}/leave`, { method: "POST" });
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
            <p>탈퇴하면 계정, 인증 사진, 루틴이 바로 삭제되고 되돌릴 수 없어요. 계속하려면 {passwordless ? "닉네임" : "아이디"} <b>{passwordless ? me.nickname : me.username}</b>를 입력해 주세요.</p>
            <div className="field">
              <label htmlFor="confirm-username">{passwordless ? "닉네임 확인" : "아이디 확인"}</label>
              <input id="confirm-username" type="text" autoCapitalize="none" autoCorrect="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
            </div>
            <div className="row">
              <button
                className="btn danger"
                type="button"
                disabled={typed !== (passwordless ? me.nickname : me.username)}
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
