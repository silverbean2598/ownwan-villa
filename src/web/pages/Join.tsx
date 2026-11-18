import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";

type Preview = { villaName: string; memberCount: number };

export function Join() {
  const { token = "" } = useParams();
  const nav = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const next = encodeURIComponent(`/join/${token}`);

  useEffect(() => {
    api<Preview>(`/api/invite/${token}`).then(setPreview, (e) =>
      setError(e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요"),
    );
    api("/api/me").then(
      () => setLoggedIn(true),
      () => setLoggedIn(false),
    );
  }, [token]);

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
          <strong>{preview.villaName}</strong> · 입주민 {preview.memberCount}/10명
        </p>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {preview && loggedIn === true && (
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
