import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { AvatarEditor } from "../components/AvatarEditor";
import { SportCards } from "../components/SportCards";
import { DEFAULT_AVATAR, type AvatarSpec } from "../../shared/avatar";
import type { Sport } from "../../shared/sports";

export function Onboard() {
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [sport, setSport] = useState<Sport | null>(null);
  const [avatar, setAvatar] = useState<AvatarSpec>(DEFAULT_AVATAR);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [owned, setOwned] = useState<string[]>([]);

  // 이미 산 옷 · 소품이 있으면 고를 수 있게 (처음 가입한 사람은 보통 없다)
  useEffect(() => {
    api<{ owned: string[] }>("/api/shop").then((s) => setOwned(s.owned), () => {});
  }, []);

  async function finish() {
    setError("");
    setBusy(true);
    try {
      await api("/api/me", { method: "PATCH", body: JSON.stringify({ sport, avatar }) });
      nav("/villa", { replace: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return nav("/login?next=/onboard");
      setError(e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");
    } finally {
      setBusy(false);
    }
  }

  if (step === 1)
    return (
      <main className="page">
        <h1>어떤 운동을 하시나요?</h1>
        <p className="muted">주로 하는 운동을 하나 골라 주세요.</p>
        <SportCards value={sport} avatar={avatar} onChange={setSport} />
        <button className="btn" type="button" disabled={!sport} onClick={() => setStep(2)} style={{ marginTop: 16 }}>
          다음
        </button>
      </main>
    );

  return (
    <main className="page">
      <h1>캐릭터 꾸미기</h1>
      <AvatarEditor value={avatar} onChange={setAvatar} owned={owned} />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button className="btn ghost" type="button" onClick={() => setStep(1)}>이전</button>
        <button className="btn" type="button" disabled={busy} onClick={finish}>완료</button>
      </div>
    </main>
  );
}
