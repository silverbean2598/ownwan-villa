import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { safeNext } from "../next";

export function Login() {
  const nav = useNavigate();
  const nextParam = useSearchParams()[0].get("next");
  // 기본은 빌라 화면 (빌라가 없으면 그 화면이 빌라 만들기를 안내한다)
  const next = nextParam ? safeNext(nextParam) : "/villa";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ username?: string; password?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err: typeof errors = {};
    if (!username) err.username = "아이디를 입력해 주세요";
    if (!password) err.password = "비밀번호를 입력해 주세요";
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy(true);
    try {
      await api("/api/login", { method: "POST", body: JSON.stringify({ username, password }) });
      nav(next, { replace: true });
    } catch (e) {
      setErrors({ form: e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1>로그인</h1>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="username">아이디</label>
          <input id="username" type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
          {errors.username && <p className="error">{errors.username}</p>}
        </div>
        <div className="field">
          <label htmlFor="password">비밀번호</label>
          <input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          {errors.password && <p className="error">{errors.password}</p>}
        </div>
        {errors.form && <p className="error">{errors.form}</p>}
        <button className="btn" type="submit" disabled={busy} style={{ marginTop: 16 }}>로그인</button>
      </form>
      <p className="muted" style={{ marginTop: 20 }}>
        <Link to="/recover">비밀번호를 잊었어요</Link>
      </p>
      <p className="muted">
        아직 계정이 없나요? <Link to={nextParam ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}>가입하기</Link>
      </p>
    </main>
  );
}
