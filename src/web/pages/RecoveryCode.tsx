import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

function saveAsImage(code: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 240;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 640, 240);
  ctx.fillStyle = "#1a1a1a";
  ctx.textAlign = "center";
  ctx.font = "24px sans-serif";
  ctx.fillText("오운완빌라 복구 코드", 320, 80);
  ctx.font = "bold 44px monospace";
  ctx.fillText(code, 320, 160);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "ownwan-recovery-code.png";
  a.click();
}

export function RecoveryCode() {
  const nav = useNavigate();
  const code = (useLocation().state as { recoveryCode?: string } | null)?.recoveryCode;
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  if (!code) return <Navigate to="/" replace />;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code!);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="page">
      <h1>복구 코드를 저장해 주세요</h1>
      <p className="muted">비밀번호를 잊어버렸을 때 이 코드가 필요해요. 이 화면을 닫으면 다시 볼 수 없어요.</p>
      <div className="code" aria-label="복구 코드">{code}</div>
      <div className="row">
        <button className="btn ghost" type="button" onClick={copy}>{copied ? "복사했어요" : "복사"}</button>
        <button className="btn ghost" type="button" onClick={() => saveAsImage(code)}>이미지로 저장</button>
      </div>
      <label className="check" htmlFor="saved">
        <input id="saved" type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        복구 코드를 저장했어요
      </label>
      <button className="btn" type="button" disabled={!saved} onClick={() => nav("/", { replace: true })} style={{ marginTop: 16 }}>다음</button>
    </main>
  );
}
