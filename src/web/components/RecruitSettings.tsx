import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { RecruitPostView } from "./city/RecruitCard";
import { SPORTS, SPORT_LABEL, type Sport } from "../../shared/sports";
import { VILLA_CAPACITY } from "../../shared/villa";
import { RECRUIT_INTRO_MAX, RECRUIT_NEED_PUBLIC_MSG, charLen, type RecruitPost } from "../../shared/recruit";

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");

/**
 * 설정 → 빈방 모집 (고른 빌라). [확정 — 기획자 결정, 2026-11-19]
 * - 신규입력: 방장, 아직 모집 안 함 → 스위치를 켜면 소개 · 종목 칸 + [모집 시작하기]
 * - 수정: 방장, 모집 중 → 소개 · 종목을 고치고 [저장], 스위치를 끄면 모집 끝 (받은 신청은 취소)
 * - 읽기전용: 입주민 → 지금 모집 글만 보인다
 * 지도에 공개하지 않은 빌라는 모집할 수 없다(방장에게 [지도에 공개하기]), 꽉 찬 빌라도 모집할 수 없다.
 */
export function RecruitSettings({
  villa, isOwner, title, onPublished, onAuthLost,
}: {
  villa: { id: string; public?: boolean; members: unknown[] };
  isOwner: boolean;
  title: string;
  onPublished: () => void;
  onAuthLost: () => void;
}) {
  const [post, setPost] = useState<RecruitPost | null>(null);
  const [draftOpen, setDraftOpen] = useState(false);
  const [intro, setIntro] = useState("");
  const [sports, setSports] = useState<Sport[]>([]);
  const [busy, setBusy] = useState(false);
  const [askOff, setAskOff] = useState(false);
  const [note, setNote] = useState<{ ok?: string; err?: string }>({});

  const memberCount = villa.members.length;
  useEffect(() => {
    let alive = true;
    api<RecruitPost>(`/api/villas/${villa.id}/recruit`).then(
      (p) => {
        if (!alive) return;
        setPost(p);
        setDraftOpen(p.open);
        setIntro(p.intro);
        setSports(p.sports);
      },
      () => alive && setPost(null),
    );
    return () => {
      alive = false;
    };
  }, [villa.id, villa.public, memberCount]);

  if (!post) return null;

  async function act(ok: string, fn: () => Promise<void>) {
    setBusy(true);
    setNote({});
    try {
      await fn();
      setNote({ ok });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onAuthLost();
      setNote({ err: msg(e) });
    } finally {
      setBusy(false);
    }
  }
  const save = (open: boolean) =>
    act(open ? (post.open ? "저장했어요" : "모집을 시작했어요. 도시 지도에 깃발이 꽂혀요") : "모집을 끝냈어요", async () => {
      const r = await api<{ open: boolean; intro: string; sports: Sport[]; updatedAt: number }>(`/api/villas/${villa.id}/recruit`, {
        method: "PUT",
        body: JSON.stringify({ open, intro, sports }),
      });
      setPost({ ...post, ...r, pendingCount: open ? post.pendingCount : 0 });
      setIntro(r.intro);
      setDraftOpen(open);
      setAskOff(false);
    });
  const publish = () =>
    act("지도에 공개했어요. 이제 모집할 수 있어요", async () => {
      await api(`/api/villas/${villa.id}/public`, { method: "PUT", body: JSON.stringify({ public: true }) });
      setPost({ ...post, public: true });
      onPublished();
    });
  const toggle = () => {
    setNote({});
    if (!draftOpen) return setDraftOpen(true);
    // 아직 저장하지 않은 새 글이면 그냥 접는다
    if (!post.open) return setDraftOpen(false);
    if (post.pendingCount) return setAskOff(true);
    void save(false);
  };
  const flip = (s: Sport) => setSports((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : SPORTS.filter((x) => x === s || cur.includes(x))));
  const over = charLen(intro) > RECRUIT_INTRO_MAX;

  let body: JSX.Element;
  if (!isOwner) {
    body = post.open ? (
      <>
        <p className="muted small">지금 빈방을 모집하고 있어요. 모집 글은 방장이 써요.</p>
        <div className="recruit-box">
          <div className="recruit-head"><span className="recruit-flag">입주자 모집 중</span></div>
          <RecruitPostView intro={post.intro} sports={post.sports} vacancies={VILLA_CAPACITY - post.memberCount} />
        </div>
      </>
    ) : (
      <p className="muted small">지금은 빈방을 모집하지 않아요. 모집 글은 방장이 써요.</p>
    );
  } else if (!post.public) {
    body = (
      <div className="recruit-hint">
        <b>{RECRUIT_NEED_PUBLIC_MSG}</b>
        <div className="muted small">모집 글은 도시 지도의 우리 빌라 건물에 걸려요. 사진과 루틴은 계속 우리끼리만 봐요.</div>
        <button type="button" className="btn" disabled={busy} onClick={publish}>지도에 공개하기</button>
      </div>
    );
  } else if (post.memberCount >= VILLA_CAPACITY) {
    body = <p className="recruit-hint">빌라가 꽉 차서 지금은 모집할 수 없어요 ({post.memberCount}/{VILLA_CAPACITY}명). 빈방이 생기면 다시 켤 수 있어요.</p>;
  } else {
    body = (
      <>
        <label className="switch-row">
          <span>
            <b>{post.open ? "모집 중이에요" : "모집하지 않아요"}</b>
            <span className="muted small">켜면 도시 지도의 우리 빌라에 "모집 중" 깃발이 꽂히고, 누구나 입주 신청을 보낼 수 있어요. 승인하면 바로 입주해요.</span>
          </span>
          <button
            type="button"
            role="switch"
            className={`switch recruit${draftOpen ? " on" : ""}`}
            aria-checked={draftOpen}
            aria-label="빈방 모집"
            disabled={busy}
            onClick={toggle}
          >
            <span className="knob" />
          </button>
        </label>
        {askOff && (
          <div className="recruit-hint" role="alertdialog" aria-label="모집 끄기 확인" style={{ marginTop: 12 }}>
            모집을 끄면 받은 신청 {post.pendingCount}개가 취소돼요. 끌까요?
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn danger" disabled={busy} onClick={() => save(false)}>모집 끄기</button>
              <button type="button" className="btn ghost" onClick={() => setAskOff(false)}>그대로 두기</button>
            </div>
          </div>
        )}
        {draftOpen && !askOff && (
          <div className="recruit-edit">
            <div className="field">
              <label htmlFor="recruit-intro">한 줄 소개</label>
              <input
                id="recruit-intro"
                type="text"
                value={intro}
                placeholder="예) 평일 아침 7시, 같이 인증할 이웃 찾아요"
                onChange={(e) => setIntro(e.target.value)}
                aria-describedby="recruit-intro-count"
              />
              <div className={`counter${over ? " over" : ""}`} id="recruit-intro-count" style={{ textAlign: "right" }}>{charLen(intro)}/{RECRUIT_INTRO_MAX}</div>
            </div>
            <div className="field" role="group" aria-labelledby="recruit-sports-label">
              <span id="recruit-sports-label" style={{ fontWeight: 600, fontSize: 14 }}>함께하고 싶은 종목 <span className="muted">(여러 개)</span></span>
              <div className="sport-chips">
                {SPORTS.map((s) => (
                  <button key={s} type="button" className="sport-chip" aria-pressed={sports.includes(s)} onClick={() => flip(s)}>
                    {SPORT_LABEL[s]}
                  </button>
                ))}
              </div>
              <span className="muted small">{sports.length ? `${sports.map((s) => SPORT_LABEL[s]).join(" · ")} 하는 이웃을 찾아요` : "고르지 않으면 종목 상관없음으로 보여요"}</span>
            </div>
            <button type="button" className="btn" disabled={busy || over} onClick={() => save(true)}>
              {post.open ? "저장" : "모집 시작하기"}
            </button>
            {post.open && !!post.pendingCount && <p className="muted small">받은 신청 {post.pendingCount}개는 아래 입주민 관리에서 볼 수 있어요.</p>}
          </div>
        )}
      </>
    );
  }

  return (
    <section className="settings-section" id="recruit">
      <h2>{title}</h2>
      {body}
      {note.ok && <p className="ok" role="status">{note.ok}</p>}
      {note.err && <p className="error" role="alert">{note.err}</p>}
    </section>
  );
}
