import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { ACCESSORIES, CATALOG, EXTRA_FURNITURE, OUTFITS, type Item, type ShopItem } from "../../shared/catalog";
import { DEFAULT_AVATAR, type AvatarSpec } from "../../shared/avatar";
import { SPORTS, SPORT_LABEL, type Sport } from "../../shared/sports";
import { FurnitureIcon } from "../components/furniture";
import { WearPreview } from "../components/WearPreview";
import "../components/villa.css";
import { pokeEvents } from "../events/poke";

type ShopData = { points: number; sport: Sport | null; owned: string[]; penthouse: boolean };
type Me = { id: string; avatar: AvatarSpec };

export const SHOP_TABS = [
  { id: "furniture", label: "가구" },
  { id: "outfit", label: "옷" },
  { id: "accessory", label: "소품" },
] as const;
export type ShopTab = (typeof SHOP_TABS)[number]["id"];

/** 내 종목 + 공용을 먼저, 그다음 다른 종목 (1차 가구 25종) */
export function shopSections(sport: Sport | null): { title: string; items: Item[] }[] {
  const mine = CATALOG.filter((i) => i.sport === sport || i.sport === "common");
  const first = { title: sport ? `${SPORT_LABEL[sport]} · 공용` : "공용", items: mine };
  const others = SPORTS.filter((s) => s !== sport).map((s) => ({ title: SPORT_LABEL[s], items: CATALOG.filter((i) => i.sport === s) }));
  return [first, ...others];
}

/** 가구 탭: 내 종목 · 공용 → 확장 묶음(운동 기구 · 휴식 가구 · 계절·특별) → 다른 종목 → 펜트하우스 전용 */
export function furnitureSections(sport: Sport | null): { title: string; items: Item[]; penthouseOnly?: boolean }[] {
  const [first, ...others] = shopSections(sport);
  const cat = (c: string) => ({ title: c, items: EXTRA_FURNITURE.filter((i) => i.category === c) });
  return [first, cat("운동 기구"), cat("휴식 가구"), cat("계절·특별"), ...others, { ...cat("펜트하우스 전용"), penthouseOnly: true }];
}

const isTab = (t: string | null): t is ShopTab => SHOP_TABS.some((x) => x.id === t);

export function Shop() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab: ShopTab = isTab(params.get("tab")) ? (params.get("tab") as ShopTab) : "furniture";
  const [data, setData] = useState<(ShopData & { meId: string; avatar: AvatarSpec }) | null>(null);
  const [error, setError] = useState("");
  const [buyError, setBuyError] = useState("");
  const [buying, setBuying] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await api<Me>("/api/me");
        const shop = await api<ShopData>("/api/shop");
        if (alive) setData({ ...shop, meId: me.id, avatar: me.avatar ?? DEFAULT_AVATAR });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return nav("/login?next=/shop", { replace: true });
        if (alive) setError(e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");
      }
    })();
    return () => {
      alive = false;
    };
  }, [nav]);

  if (error) return <main className="page"><p className="error" role="alert">{error}</p></main>;
  if (!data) return <main className="page"><p className="muted">불러오는 중이에요</p></main>;

  async function buy(item: ShopItem) {
    setBuying(item.id);
    setBuyError("");
    try {
      const r = await api<{ points: number }>("/api/shop/buy", { method: "POST", body: JSON.stringify({ itemId: item.id }) });
      setData((d) => d && { ...d, points: r.points, owned: [...d.owned, item.id] });
      pokeEvents();
    } catch (e) {
      setBuyError(e instanceof ApiError ? e.message : "사지 못했어요. 다시 해 주세요");
    } finally {
      setBuying("");
    }
  }

  const card = (i: ShopItem, pic: ReactNode, note: string, locked = false) => {
    const owned = data.owned.includes(i.id);
    const short = data.points < i.price;
    return (
      <li key={i.id} className={`shop-item${owned ? " owned" : ""}`}>
        <div className="shop-pic">{pic}</div>
        <b>{i.name}</b>
        <span className="price">{i.price}P{note && ` · ${note}`}</span>
        {owned ? (
          <span className="owned-tag">보유 중</span>
        ) : locked ? (
          <span className="locked-tag">펜트하우스 주인만</span>
        ) : (
          <button type="button" className="btn buy" disabled={short || !!buying} onClick={() => buy(i)}>
            {short ? "포인트가 모자라요" : buying === i.id ? "사는 중…" : "사기"}
          </button>
        )}
      </li>
    );
  };

  const help =
    tab === "furniture"
      ? "산 가구는 내 방에서 [가구 놓기]로 놓을 수 있어요."
      : "산 옷 · 소품은 설정의 [캐릭터 꾸미기]에서 입을 수 있어요.";

  return (
    <main className="villa-page shop-page">
      <Link className="back" to={`/room/${data.meId}`}>← 내 방으로</Link>
      <header className="shop-head">
        <h1>상점</h1>
        <span className="chip points">내 포인트 <b>{data.points}</b>P</span>
      </header>
      <div className="shop-tabs" role="tablist" aria-label="상점 종류">
        {SHOP_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`shop-tab${tab === t.id ? " on" : ""}`}
            onClick={() => setParams(t.id === "furniture" ? {} : { tab: t.id }, { replace: true })}
          >
            {t.label}
          </button>
        ))}
      </div>
      <p className="muted shop-help">
        {help} {tab !== "furniture" && <Link to="/settings#avatar">꾸미러 가기</Link>}
      </p>
      {buyError && <p className="error" role="alert">{buyError}</p>}
      {tab === "furniture" &&
        furnitureSections(data.sport).map((sec) => (
          <section key={sec.title} className="shop-sec">
            <h2>{sec.title}</h2>
            {sec.penthouseOnly && (
              <p className="muted shop-lock">
                {data.penthouse ? "지금 펜트하우스에 살고 있어서 살 수 있어요." : "🔒 지금 펜트하우스에 사는 사람만 살 수 있어요. 산 뒤에는 계속 갖고 어디든 놓을 수 있어요."}
              </p>
            )}
            <ul className="shop-grid">
              {sec.items.map((i) =>
                card(i, <FurnitureIcon itemId={i.id} size={80} />, i.slotType === "wall" ? "벽" : "바닥", !!i.penthouseOnly && !data.penthouse),
              )}
            </ul>
          </section>
        ))}
      {tab === "outfit" && (
        <section className="shop-sec">
          <h2>운동복</h2>
          <ul className="shop-grid">{OUTFITS.map((i) => card(i, <WearPreview spec={data.avatar} itemId={i.id} size={96} />, ""))}</ul>
        </section>
      )}
      {tab === "accessory" && (
        <section className="shop-sec">
          <h2>소품</h2>
          <ul className="shop-grid">{ACCESSORIES.map((i) => card(i, <WearPreview spec={data.avatar} itemId={i.id} size={84} />, ""))}</ul>
        </section>
      )}
    </main>
  );
}
