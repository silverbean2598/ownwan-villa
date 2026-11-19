import { useEffect, useState } from "react";
import { MAX_VILLAS_PER_USER, VILLA_CAPACITY, VILLA_LIMIT_MSG } from "../../shared/villa";
import { villaPath, writeCurrentVilla } from "../villa/current";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";

// 로그인한 상태면 alreadyMember(+ villaId) · myVillaCount · atLimit 이 함께 온다
type Preview = { villaName: string; memberCount: number; alreadyMember?: boolean; villaId?: string; myVillaCount?: number; atLimit?: boolean };

export function Join() {
  const { token = "" } = useParams();
  const nav = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  // 방장이 내보낸 빌라(403)면 입주 버튼 대신 다른 곳으로 가는 버튼
  const [banned, setBanned] = useState(false);
  const [busy, setBusy] = useState(false);
  const next = encodeURIComponent(`/join/${token}`);

  useEffect(() => {
    api<Preview>(`/api/invite/${token}`).then((p) => {
      // 이미 이 빌라 입주민(온보딩 중에 나갔다가 다시 연 경우)이면 바로 빌라로. 운동 종목이 없으면 빌라 화면이 온보딩으로 보낸다
      if (p.alreadyMember) {
        if (p.villaId) writeCurrentVilla(p.villaId);
        return nav(p.villaId ? villaPath(p.villaId) : "/villa", { replace: true });
      }
      setPreview(p);
    }, (e) => {
      setBanned(e instanceof ApiError && e.status === 403);
      setError(e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");
    });
    api("/api/me").then(
      () => setLoggedIn(true),
      () => setLoggedIn(false),
    );
  }, [token, nav]);

  async function join() {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ villaId?: string }>(`/api/invite/${token}/join`, { method: "POST" });
      // 새로 들어온 빌라를 바로 보여 준다
      if (r.villaId) writeCurrentVilla(r.villaId);
      nav(r.villaId ? villaPath(r.villaId) : "/villa", { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setBanned(true);
        setPreview(null);
      }
      setError(e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1>빌라 초대</h1>
      {preview && (
        <p>
          <strong>{preview.villaName}</strong> · 입주민 {preview.memberCount}/{VILLA_CAPACITY}명
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {banned && (
        <div className="row" style={{ flexDirection: "column" }}>
          <Link className="btn" to="/villa" replace>내 빌라로</Link>
          <Link className="btn ghost" to="/" replace>첫 화면</Link>
        </div>
      )}
      {preview?.atLimit && (
        <>
          <p className="limit-box" role="status">{VILLA_LIMIT_MSG}</p>
          <div className="row" style={{ flexDirection: "column" }}>
            <Link className="btn" to="/villa" replace>내 빌라로</Link>
            <Link className="btn ghost" to="/settings">설정에서 빌라 나가기</Link>
          </div>
        </>
      )}
      {preview && !preview.atLimit && loggedIn === true && (
        <>
          {!!preview.myVillaCount && (
            <p className="muted">
              지금 사는 빌라는 그대로 두고 한 곳 더 입주해요. ({preview.myVillaCount + 1}/{MAX_VILLAS_PER_USER}곳)
            </p>
          )}
          <button className="btn" type="button" disabled={busy} onClick={join}>입주하기</button>
        </>
      )}
      {preview && loggedIn === false && (
        <div className="row" style={{ flexDirection: "column" }}>
          <Link className="btn" to={`/signup?next=${next}`}>가입하고 입주하기</Link>
          <Link className="btn ghost" to={`/login?next=${next}`}>로그인</Link>
        </div>
      )}
    </main>
  );
}
