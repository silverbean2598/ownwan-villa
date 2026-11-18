import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { Building, CAPACITY, type Member } from "../components/Building";

type VillaData = {
  id: string;
  name: string;
  ownerId: string;
  penthouseUserId: string | null;
  inviteToken?: string;
  members: Member[];
};
type Me = { id: string; sport: string | null };

export function Villa() {
  const nav = useNavigate();
  const [state, setState] = useState<{ me: Me; villa: VillaData | null } | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"" | "ok" | "manual">("");
  const linkRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await api<Me>("/api/me");
        if (!me.sport) return nav("/onboard", { replace: true });
        const villa = await api<VillaData | null>("/api/villas/mine");
        if (alive) setState({ me, villa });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return nav("/login?next=/villa", { replace: true });
        if (alive) setError(e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");
      }
    })();
    return () => {
      alive = false;
    };
  }, [nav]);

  if (error) return <main className="page"><p className="error" role="alert">{error}</p></main>;
  if (!state) return <main className="page"><p className="muted">불러오는 중이에요</p></main>;

  const { me, villa } = state;
  if (!villa) {
    return (
      <main className="page">
        <h1>아직 입주한 빌라가 없어요</h1>
        <p className="muted">빌라를 만들어 친구를 초대해 보세요.</p>
        <Link className="btn" to="/villa/new">빌라 만들기</Link>
      </main>
    );
  }

  const mine = villa.members.find((m) => m.userId === me.id);
  const done = villa.members.filter((m) => m.certifiedToday).length;
  const inviteUrl = villa.inviteToken ? `${location.origin}/join/${villa.inviteToken}` : "";

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied("ok");
    } catch {
      setCopied("manual");
      setTimeout(() => linkRef.current?.select(), 0);
    }
  }

  return (
    <main className="villa-page">
      <header className="villa-head">
        <h1>{villa.name}</h1>
        <div className="stats">
          <span className="chip"><span>입주 <b>{villa.members.length}</b>/{CAPACITY}명</span></span>
          <span className="chip"><span>오늘 완료 <b>{done}</b>명</span></span>
        </div>
        <div className="villa-actions">
          {mine && !mine.certifiedToday && (
            <Link className="btn primary" to="/certify">오늘 오운완 인증하기</Link>
          )}
          <Link className="btn ghost" to="/shop">가구 상점</Link>
          {inviteUrl && (
            <button type="button" className="btn ghost" onClick={copyInvite}>
              {copied === "ok" ? "복사했어요" : "초대 링크 복사"}
            </button>
          )}
        </div>
        {copied === "manual" && (
          <input ref={linkRef} className="invite-fallback" readOnly value={inviteUrl} aria-label="초대 링크" onFocus={(e) => e.currentTarget.select()} />
        )}
      </header>
      <Building members={villa.members} penthouseUserId={villa.penthouseUserId} ownerId={villa.ownerId} meId={me.id} />
    </main>
  );
}
