import { useState } from "react";
import { api, ApiError } from "../../api";
import type { AvatarSpec } from "../../../shared/avatar";
import type { Sport } from "../../../shared/sports";
import { PAY_NOT_READY_MESSAGE, PREMIUM_THEMES, findTheme, formatWon, type PremiumTheme, type ThemeId } from "../../../shared/premium";
import { RoomScene } from "../RoomScene";
import "./premium.css";

export type PremiumData = {
  sport: Sport | null;
  avatar: AvatarSpec;
  penthouse: boolean;
  placements: { slot: string; itemId: string }[];
  premiumOwned: string[];
  theme: string | null;
};

type Props = {
  data: PremiumData;
  /** 상세로 연 상품 id (주소 ?item=) */
  itemId: string | null;
  onOpen: (id: string | null) => void;
  onTheme: (theme: string | null) => void;
};

/** 상점 → 프리미엄 탭: 목록 카드, 상품을 누르면 상세(내 방에 미리 입혀 보기) */
export function PremiumShop({ data, itemId, onOpen, onTheme }: Props) {
  const open = findTheme(itemId);
  if (open) return <PremiumDetail data={data} theme={open} onBack={() => onOpen(null)} onTheme={onTheme} />;
  return (
    <section className="shop-sec premium-list">
      <h2>방 테마</h2>
      <ul className="premium-cards">
        {PREMIUM_THEMES.map((t) => {
          const owned = data.premiumOwned.includes(t.id);
          const on = data.theme === t.id;
          return (
            <li key={t.id}>
              <button type="button" className="premium-card" onClick={() => onOpen(t.id)} aria-label={`${t.name} 자세히 보기`}>
                <div className="premium-thumb">
                  <div className="room on">
                    <RoomScene sport={data.sport ?? "gym"} lit avatar={data.avatar} penthouse={data.penthouse} placements={data.placements} theme={t.id} />
                  </div>
                </div>
                <div className="premium-body">
                  <div className="premium-tags">
                    {t.season && <span className="premium-season">{t.season}</span>}
                    {owned && <span className="premium-owned">{on ? "보유 중 · 켜짐" : "보유 중"}</span>}
                  </div>
                  <b className="premium-name">{t.name}</b>
                  <p className="premium-tagline">{t.tagline}</p>
                  <span className="premium-price">{formatWon(t.priceWon)}</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="muted premium-note">프리미엄은 포인트가 아니라 결제로 사요. 한 번 사면 계속 갖고, 언제든 켜고 끌 수 있어요.</p>
    </section>
  );
}

type DetailProps = { data: PremiumData; theme: PremiumTheme; onBack: () => void; onTheme: (theme: string | null) => void };

function PremiumDetail({ data, theme, onBack, onTheme }: DetailProps) {
  const owned = data.premiumOwned.includes(theme.id);
  const on = data.theme === theme.id;
  // 미리 보기: 낮/밤, 테마 입히기 전/후 (산 뒤에는 지금 켜짐 여부로 시작)
  const [lit, setLit] = useState(true);
  const [tryOn, setTryOn] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const shown: ThemeId | null = tryOn ? theme.id : null;
  const sport = data.sport ?? "gym";

  async function toggle(next: boolean) {
    setBusy(true);
    setError("");
    try {
      const r = await api<{ theme: string | null }>("/api/theme", { method: "PUT", body: JSON.stringify({ themeId: next ? theme.id : null }) });
      onTheme(r.theme);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "바꾸지 못했어요. 다시 해 주세요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="premium-detail" aria-labelledby="premium-title">
      <button type="button" className="premium-back" onClick={onBack}>← 프리미엄 목록</button>
      <header className="premium-head">
        <div className="premium-tags">
          {theme.season && <span className="premium-season">{theme.season}</span>}
          {owned && <span className="premium-owned">{on ? "보유 중 · 켜짐" : "보유 중"}</span>}
        </div>
        <h2 id="premium-title">{theme.name}</h2>
        <span className="premium-price big">{formatWon(theme.priceWon)}</span>
      </header>

      <div className="premium-try">
        <div className="premium-try-bar">
          <span className="premium-try-label">내 방에 미리 입혀 보기</span>
          <div className="seg" role="group" aria-label="낮 밤">
            <button type="button" className={lit ? "on" : ""} aria-pressed={lit} onClick={() => setLit(true)}>낮</button>
            <button type="button" className={!lit ? "on" : ""} aria-pressed={!lit} onClick={() => setLit(false)}>밤</button>
          </div>
        </div>
        <div className={`room ${lit ? "on" : "off"} big premium-room`}>
          <RoomScene sport={sport} lit={lit} avatar={data.avatar} penthouse={data.penthouse} variant="detail" placements={data.placements} theme={shown} />
        </div>
        <div className="premium-try-foot">
          <div className="seg" role="group" aria-label="테마 입히기 전후">
            <button type="button" className={!tryOn ? "on" : ""} aria-pressed={!tryOn} onClick={() => setTryOn(false)}>지금 내 방</button>
            <button type="button" className={tryOn ? "on" : ""} aria-pressed={tryOn} onClick={() => setTryOn(true)}>테마 입힌 방</button>
          </div>
        </div>
        <div className="premium-tile-preview">
          <span className="muted">아파트 화면에서는 이렇게 보여요</span>
          <div className={`room ${lit ? "on" : "off"}${data.penthouse ? " ph-wide" : ""}`}>
            <RoomScene sport={sport} lit={lit} avatar={data.avatar} penthouse={data.penthouse} placements={data.placements} theme={shown} />
          </div>
        </div>
      </div>

      <h3 className="premium-h3">들어 있는 것</h3>
      <ul className="premium-includes">
        {theme.includes.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
      <ul className="premium-facts">
        <li>장식은 테마에 딸려 있어요. 내 가구 5칸은 그대로 두고 함께 보여요.</li>
        <li>한 번 사면 계속 갖고, 언제든 켜고 끌 수 있어요.</li>
        <li>낮 · 밤, 펜트하우스, 아파트 화면의 작은 방까지 모두 바뀌어요.</li>
        <li>포인트 상점의 크리스마스 트리 · 전구 줄조명과는 따로예요. 같이 놓을 수 있어요.</li>
      </ul>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="premium-cta">
        {owned ? (
          <label className="premium-switch">
            <input type="checkbox" role="switch" checked={on} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
            <span>{on ? "내 방에 켜져 있어요" : "내 방에 켜기"}</span>
          </label>
        ) : (
          <button type="button" className="btn" onClick={() => setNotice(PAY_NOT_READY_MESSAGE)}>
            {formatWon(theme.priceWon)}에 사기
          </button>
        )}
        {notice && (
          <p className="premium-notice" role="status">
            {notice}
          </p>
        )}
      </div>
    </section>
  );
}
