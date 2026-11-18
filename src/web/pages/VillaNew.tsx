import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";

export function VillaNew() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (n.length < 1 || n.length > 20) return setError("빌라 이름은 1~20자로 지어 주세요");
    setError("");
    setBusy(true);
    try {
      const { inviteToken } = await api<{ inviteToken: string }>("/api/villas", { method: "POST", body: JSON.stringify({ name: n }) });
      setLink(`${location.origin}/join/${inviteToken}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return nav("/login?next=/villa/new");
      setError(e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (link)
    return (
      <main className="page">
        <h1>빌라를 지었어요</h1>
        <p className="muted">친구에게 이 초대 링크를 보내 주세요.</p>
        <div className="code" aria-label="초대 링크">{link}</div>
        <div className="row">
          <button className="btn ghost" type="button" onClick={copy}>{copied ? "복사했어요" : "링크 복사"}</button>
        </div>
        <button className="btn" type="button" onClick={() => nav("/villa", { replace: true })} style={{ marginTop: 16 }}>내 빌라로</button>
      </main>
    );

  return (
    <main className="page">
      <h1>빌라 만들기</h1>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="name">빌라 이름</label>
          <input id="name" type="text" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={busy} style={{ marginTop: 16 }}>만들기</button>
      </form>
    </main>
  );
}
