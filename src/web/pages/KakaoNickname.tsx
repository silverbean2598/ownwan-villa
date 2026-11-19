import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { safeNext } from "../next";
import { isValidNickname } from "../../shared/nickname";
import { KakaoButton } from "../components/kakao/KakaoButton";

type Errors = Partial<Record<"nickname" | "agree" | "form", string>>;

/** 카카오로 처음 온 사람: 닉네임만 정하면 가입이 끝나요 (복구 코드 없음 — 카카오로 다시 로그인하면 돼요) */
export function KakaoNickname() {
  const nav = useNavigate();
  const [nickname, setNickname] = useState("");
  const [over14, setOver14] = useState(false);
  const [agree, setAgree] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const nick = nickname.trim();
    const err: Errors = {};
    if (!isValidNickname(nick)) err.nickname = "닉네임은 2~10자로 입력해 주세요";
    if (!over14 || !agree) err.agree = "두 항목 모두 체크해 주세요";
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy(true);
    try {
      const r = await api<{ next: string }>("/api/auth/kakao/finish", {
        method: "POST",
        body: JSON.stringify({ nickname: nick, over14, agree }),
      });
      nav(safeNext(r.next), { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 410) setExpired(true);
      setErrors({ form: e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1>닉네임 정하기</h1>
      <p className="muted">빌라에서 보이는 이름이에요. 카카오에서는 회원번호만 받고, 이름이나 프로필은 받지 않아요.</p>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="nickname">닉네임</label>
          <input id="nickname" type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} />
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
        {errors.form && <p className="error" role="alert">{errors.form}</p>}
        {expired ? (
          <div style={{ marginTop: 16 }}><KakaoButton label="카카오로 다시 시작하기" /></div>
        ) : (
          <button className="btn" type="submit" disabled={busy} style={{ marginTop: 16 }}>시작하기</button>
        )}
      </form>
      <p className="muted small" style={{ marginTop: 16 }}>복구 코드는 따로 없어요. 다음에도 카카오로 로그인하면 돼요.</p>
    </main>
  );
}
