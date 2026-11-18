import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { Avatar } from "../components/Avatar";
import { AVATAR_OPTIONS, DEFAULT_AVATAR, type AvatarSpec } from "../../shared/avatar";
import { SPORTS, SPORT_LABEL, type Sport } from "../../shared/sports";

const HAIR_LABEL: Record<string, string> = { short: "짧은 머리", long: "긴 머리", bun: "올림머리", buzz: "삭발" };

export function Onboard() {
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [sport, setSport] = useState<Sport | null>(null);
  const [avatar, setAvatar] = useState<AvatarSpec>(DEFAULT_AVATAR);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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
        <div className="choices" role="radiogroup" aria-label="운동 종목">
          {SPORTS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={sport === s}
              className={`choice${sport === s ? " on" : ""}`}
              onClick={() => setSport(s)}
            >
              {SPORT_LABEL[s]}
            </button>
          ))}
        </div>
        <button className="btn" type="button" disabled={!sport} onClick={() => setStep(2)} style={{ marginTop: 16 }}>
          다음
        </button>
      </main>
    );

  return (
    <main className="page">
      <h1>캐릭터 꾸미기</h1>
      <div style={{ display: "flex", justifyContent: "center", margin: "16px 0" }}>
        <Avatar spec={avatar} size={120} />
      </div>
      <div className="field">
        <label>피부색</label>
        <div className="row swatches">
          {AVATAR_OPTIONS.skin.map((c, i) => (
            <button
              key={c}
              type="button"
              className={`swatch${avatar.skin === i ? " on" : ""}`}
              style={{ background: c }}
              aria-label={`피부색 ${i + 1}`}
              aria-pressed={avatar.skin === i}
              onClick={() => setAvatar({ ...avatar, skin: i })}
            />
          ))}
        </div>
      </div>
      <div className="field">
        <label>머리 모양</label>
        <div className="row">
          {AVATAR_OPTIONS.hair.map((h) => (
            <button
              key={h}
              type="button"
              className={`choice small${avatar.hair === h ? " on" : ""}`}
              aria-pressed={avatar.hair === h}
              onClick={() => setAvatar({ ...avatar, hair: h })}
            >
              {HAIR_LABEL[h]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>옷 색</label>
        <div className="row swatches">
          {AVATAR_OPTIONS.shirt.map((c, i) => (
            <button
              key={c}
              type="button"
              className={`swatch${avatar.shirt === i ? " on" : ""}`}
              style={{ background: c }}
              aria-label={`옷 색 ${i + 1}`}
              aria-pressed={avatar.shirt === i}
              onClick={() => setAvatar({ ...avatar, shirt: i })}
            />
          ))}
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="row">
        <button className="btn ghost" type="button" onClick={() => setStep(1)}>이전</button>
        <button className="btn" type="button" disabled={busy} onClick={finish}>완료</button>
      </div>
    </main>
  );
}
