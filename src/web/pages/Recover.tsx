import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";

type Step = "choose" | "code" | "request" | "ticket" | "complete";

export function Recover() {
  const nav = useNavigate();
  const [step, setStep] = useState<Step>("choose");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function go(s: Step) {
    setError("");
    setStep(s);
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");
    } finally {
      setBusy(false);
    }
  }

  const finish = (recoveryCode: string) => nav("/signup/code", { state: { recoveryCode }, replace: true });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!username) return setError("아이디를 입력해 주세요");
    if (step === "request") {
      return run(async () => {
        const r = await api<{ ticket: string }>("/api/recover/request", { method: "POST", body: JSON.stringify({ username }) });
        setTicket(r.ticket);
        setStep("ticket");
      });
    }
    if (step === "code" && !code) return setError("복구 코드를 입력해 주세요");
    if (step === "complete" && !ticket) return setError("요청 번호를 입력해 주세요");
    if (password.length < 8) return setError("새 비밀번호는 8자 이상이어야 해요");
    run(async () => {
      const r =
        step === "code"
          ? await api<{ recoveryCode: string }>("/api/recover/code", { method: "POST", body: JSON.stringify({ username, code, newPassword: password }) })
          : await api<{ recoveryCode: string }>("/api/recover/complete", { method: "POST", body: JSON.stringify({ username, ticket, newPassword: password }) });
      finish(r.recoveryCode);
    });
  }

  if (step === "choose") {
    return (
      <main className="page">
        <h1>계정 되찾기</h1>
        <div className="row" style={{ flexDirection: "column", gap: 12 }}>
          <button className="btn" type="button" onClick={() => go("code")}>복구 코드로 되찾기</button>
          <button className="btn ghost" type="button" onClick={() => go("request")}>복구 코드도 없어요</button>
        </div>
        <p className="muted" style={{ marginTop: 20 }}><Link to="/login">로그인으로 돌아가기</Link></p>
      </main>
    );
  }

  if (step === "ticket") {
    return (
      <main className="page">
        <h1>요청 번호를 저장해 주세요</h1>
        <div className="code" aria-label="요청 번호">{ticket}</div>
        <p className="muted">방장에게 직접 연락해서 승인해 달라고 말해 주세요. 승인 24시간 뒤에 비밀번호를 바꿀 수 있어요</p>
        <button className="btn" type="button" onClick={() => go("complete")} style={{ marginTop: 16 }}>승인받았어요, 비밀번호 바꾸기</button>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>{step === "code" ? "복구 코드로 되찾기" : step === "request" ? "방장에게 확인 요청하기" : "비밀번호 바꾸기"}</h1>
      <form onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="username">아이디</label>
          <input id="username" type="text" autoCapitalize="none" autoCorrect="off" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        </div>
        {step === "code" && (
          <div className="field">
            <label htmlFor="code">복구 코드</label>
            <input id="code" type="text" autoCapitalize="characters" autoCorrect="off" value={code} onChange={(e) => setCode(e.target.value)} />
          </div>
        )}
        {step === "complete" && (
          <div className="field">
            <label htmlFor="ticket">요청 번호</label>
            <input id="ticket" type="text" autoCapitalize="characters" autoCorrect="off" value={ticket} onChange={(e) => setTicket(e.target.value)} />
          </div>
        )}
        {step !== "request" && (
          <div className="field">
            <label htmlFor="password">새 비밀번호</label>
            <input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={busy} style={{ marginTop: 16 }}>
          {step === "request" ? "요청하기" : "비밀번호 바꾸기"}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 20 }}>
        <button className="btn ghost" type="button" onClick={() => go("choose")}>뒤로</button>
      </p>
    </main>
  );
}
