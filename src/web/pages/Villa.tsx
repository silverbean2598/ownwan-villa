import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { Badge } from "../components/Badge";
import { CertifyButton } from "../components/CertifyButton";
import { Building, CAPACITY, type Member } from "../components/Building";
import { VillaSwitcher } from "../components/VillaSwitcher";
import { loadMyVillas, pickVilla, villaPath, writeCurrentVilla } from "../villa/current";
import type { MyVilla } from "../../shared/villa";

type VillaData = {
  id: string;
  name: string;
  ownerId: string;
  penthouseUserId: string | null;
  inviteToken?: string;
  members: Member[];
};
type Me = { id: string; sport: string | null };

/**
 * 빌라 화면. 주소는 /villa/:id. 예전 주소 /villa 는 이 기기에서 마지막으로 본 빌라(없으면 가장 먼저 입주한 빌라)로 보낸다.
 * 빌라 여러 곳에 살면 위쪽 탭으로 바꾼다.
 */
export function Villa() {
  const nav = useNavigate();
  const { id } = useParams();
  const [state, setState] = useState<{ me: Me; villas: MyVilla[]; villa: VillaData | null } | null>(null);
  const [error, setError] = useState("");
  const [badge, setBadge] = useState(0);
  const [copied, setCopied] = useState<"" | "ok" | "manual">("");
  const linkRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let alive = true;
    setCopied("");
    (async () => {
      try {
        const me = await api<Me>("/api/me");
        if (!me.sport) return nav("/onboard", { replace: true });
        const villas = await loadMyVillas();
        const pick = pickVilla(villas, id);
        if (!pick) {
          if (id) return nav("/villa", { replace: true });
          if (alive) setState({ me, villas, villa: null });
          return;
        }
        // 주소에 빌라가 없거나 내가 살지 않는 빌라면 보여 줄 빌라 주소로 바꾼다
        if (pick !== id) return nav(villaPath(pick), { replace: true });
        writeCurrentVilla(pick);
        const villa = await api<VillaData>(`/api/villas/${pick}`);
        if (alive) setState({ me, villas, villa });
        api<{ recoveryApprovals: number }>("/api/badges").then((b) => alive && setBadge(b.recoveryApprovals), () => {});
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return nav(`/login?next=${encodeURIComponent(id ? villaPath(id) : "/villa")}`, { replace: true });
        if (alive) setError(e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");
      }
    })();
    return () => {
      alive = false;
    };
  }, [nav, id]);

  if (error) return <main className="page"><p className="error" role="alert">{error}</p></main>;
  if (!state) return <main className="page"><p className="muted">불러오는 중이에요</p></main>;

  const { me, villas, villa } = state;
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
      <VillaSwitcher
        villas={villas}
        currentId={villa.id}
        showAdd
        onPick={(v) => {
          writeCurrentVilla(v);
          nav(villaPath(v));
        }}
      />
      <header className="villa-head">
        <div className="villa-title">
          <h1>{villa.name}</h1>
          <Link className="btn ghost city-link" to="/city">도시 보기</Link>
        </div>
        <div className="stats">
          <span className="chip"><span>입주 <b>{villa.members.length}</b>/{CAPACITY}명</span></span>
          <span className="chip"><span>오늘 완료 <b>{done}</b>명</span></span>
        </div>
        <div className="villa-actions">
          {mine && <CertifyButton certifiedToday={mine.certifiedToday} certifiedElsewhere={!!mine.certifiedAnywhere && villas.length > 1} villaId={villa.id} />}
          <Link className="btn ghost" to="/shop">가구 상점</Link>
          <Link className="btn ghost gear-link" to="/settings" aria-label={badge ? `설정, 알림 ${badge}건` : "설정"}>
            설정<Badge count={badge} />
          </Link>
          {inviteUrl && (
            <button type="button" className="btn ghost" onClick={copyInvite}>
              {copied === "ok" ? "복사했어요" : "초대 링크 복사"}
            </button>
          )}
        </div>
        {copied === "manual" && (
          <textarea ref={linkRef} className="invite-fallback" readOnly rows={2} value={inviteUrl} aria-label="초대 링크" onFocus={(e) => e.currentTarget.select()} />
        )}
      </header>
      <Building members={villa.members} penthouseUserId={villa.penthouseUserId} ownerId={villa.ownerId} meId={me.id} villaId={villa.id} />
    </main>
  );
}
