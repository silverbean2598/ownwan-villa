import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { safeNext } from "../next";

type Errors = Partial<Record<"username" | "password" | "password2" | "nickname" | "agree" | "form", string>>;

export function Signup() {
  const nav = useNavigate();
  const next = safeNext(useSearchParams()[0].get("next"));
  const [f, setF] = useState({ username: "", password: "", password2: "", nickname: "" });
  const [over14, setOver14] = useState(false);
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err: Errors = {};
    const username = f.username.trim().toLowerCase();
    if (!/^[a-z0-9]{4,16}$/.test(username)) err.username = "영문 소문자와 숫자 4~16자로 입력해 주세요";
    if (f.password.length < 8 || f.password.length > 128) err.password = "비밀번호는 8~128자로 정해 주세요";
    if (f.password2 !== f.password) err.password2 = "비밀번호가 서로 달라요";
    const nick = f.nickname.trim();
    if (nick.length < 2 || nick.length > 10) err.nickname = "닉네임은 2~10자로 입력해 주세요";
    if (!over14 || !agree) err.agree = "두 항목 모두 체크해 주세요";
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy(true);
    try {
      const { recoveryCode } = await api<{ recoveryCode: string }>("/api/signup", {
        method: "POST",
        body: JSON.stringify({ username, password: f.password, nickname: nick, over14, agree }),
      });
      nav("/signup/code", { state: { recoveryCode, next } });
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요";
      setErrors(e instanceof ApiError && e.status === 409 ? { username: msg } : { form: msg });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1>가입하기</h1>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="username">아이디</label>
          <input id="username" type="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" value={f.username} onChange={set("username")} />
          {errors.username && <p className="error">{errors.username}</p>}
        </div>
        <div className="field">
          <label htmlFor="password">비밀번호</label>
          <input id="password" type="password" autoComplete="new-password" value={f.password} onChange={set("password")} />
          {errors.password && <p className="error">{errors.password}</p>}
        </div>
        <div className="field">
          <label htmlFor="password2">비밀번호 확인</label>
          <input id="password2" type="password" autoComplete="new-password" value={f.password2} onChange={set("password2")} />
          {errors.password2 && <p className="error">{errors.password2}</p>}
        </div>
        <div className="field">
          <label htmlFor="nickname">닉네임</label>
          <input id="nickname" type="text" value={f.nickname} onChange={set("nickname")} />
          {errors.nickname && <p className="error">{errors.nickname}</p>}
        </div>
        <label className="check" htmlFor="over14">
          <input id="over14" type="checkbox" checked={over14} onChange={(e) => setOver14(e.target.checked)} />
          만 14세 이상이에요
        </label>
        <label className="check" htmlFor="agree">
          <input id="agree" type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>
            <Link to="/terms" target="_blank">이용약관</Link>과 <Link to="/privacy" target="_blank">개인정보 처리방침</Link>에 동의해요
          </span>
        </label>
        {errors.agree && <p className="error">{errors.agree}</p>}
        {errors.form && <p className="error">{errors.form}</p>}
        <button className="btn" type="submit" disabled={busy} style={{ marginTop: 16 }}>가입하기</button>
      </form>
    </main>
  );
}
