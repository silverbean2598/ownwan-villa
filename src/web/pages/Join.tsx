import { useEffect, useState } from "react";
import { VILLA_CAPACITY } from "../../shared/villa";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";

// 로그인한 상태면 alreadyMember · inOtherVilla가 함께 온다
type Preview = { villaName: string; memberCount: number; alreadyMember?: boolean; inOtherVilla?: boolean };

export function Join() {
  const { token = "" } = useParams();
  const nav = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = encodeURIComponent(`/join/${token}`);

  useEffect(() => {
    api<Preview>(`/api/invite/${token}`).then((p) => {
      // 이미 이 빌라 입주민(온보딩 중에 나갔다가 다시 연 경우)이면 바로 빌라로. 운동 종목이 없으면 빌라 화면이 온보딩으로 보낸다
      if (p.alreadyMember) return nav("/villa", { replace: true });
      setPreview(p);
    }, (e) =>
      setError(e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요"),
    );
    api("/api/me").then(
      () => setLoggedIn(true),
      () => setLoggedIn(false),
    );
  }, [token, nav]);

  async function join() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/invite/${token}/join`, { method: "POST" });
      nav("/villa", { replace: true });
    } catch (e) {
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
      {preview?.inOtherVilla && (
        <>
          <p className="muted">이미 다른 빌라에 살고 있어요. 옮기려면 설정에서 지금 빌라를 먼저 나가 주세요.</p>
          <div className="row" style={{ flexDirection: "column" }}>
            <Link className="btn" to="/villa" replace>내 빌라로</Link>
            <Link className="btn ghost" to="/settings">설정</Link>
          </div>
        </>
      )}
      {preview && !preview.inOtherVilla && loggedIn === true && (
        <button className="btn" type="button" disabled={busy} onClick={join}>입주하기</button>
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
