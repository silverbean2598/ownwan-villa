import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { CATALOG, type Item } from "../../shared/catalog";
import { SPORTS, SPORT_LABEL, type Sport } from "../../shared/sports";
import { FurnitureIcon } from "../components/furniture";
import "../components/villa.css";

type ShopData = { points: number; sport: Sport | null; owned: string[] };
type Me = { id: string };

/** 내 종목 + 공용을 먼저, 그다음 다른 종목 */
export function shopSections(sport: Sport | null): { title: string; items: Item[] }[] {
  const mine = CATALOG.filter((i) => i.sport === sport || i.sport === "common");
  const first = { title: sport ? `${SPORT_LABEL[sport]} · 공용` : "공용", items: mine };
  const others = SPORTS.filter((s) => s !== sport).map((s) => ({ title: SPORT_LABEL[s], items: CATALOG.filter((i) => i.sport === s) }));
  return [first, ...others];
}

export function Shop() {
  const nav = useNavigate();
  const [data, setData] = useState<(ShopData & { meId: string }) | null>(null);
  const [error, setError] = useState("");
  const [buyError, setBuyError] = useState("");
  const [buying, setBuying] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await api<Me>("/api/me");
        const shop = await api<ShopData>("/api/shop");
        if (alive) setData({ ...shop, meId: me.id });
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

  async function buy(item: Item) {
    setBuying(item.id);
    setBuyError("");
    try {
      const r = await api<{ points: number }>("/api/shop/buy", { method: "POST", body: JSON.stringify({ itemId: item.id }) });
      setData((d) => d && { ...d, points: r.points, owned: [...d.owned, item.id] });
    } catch (e) {
      setBuyError(e instanceof ApiError ? e.message : "사지 못했어요. 다시 해 주세요");
    } finally {
      setBuying("");
    }
  }

  return (
    <main className="villa-page shop-page">
      <Link className="back" to={`/room/${data.meId}`}>← 내 방으로</Link>
      <header className="shop-head">
        <h1>가구 상점</h1>
        <span className="chip points">내 포인트 <b>{data.points}</b>P</span>
      </header>
      <p className="muted shop-help">산 가구는 내 방에서 [가구 놓기]로 놓을 수 있어요.</p>
      {buyError && <p className="error" role="alert">{buyError}</p>}
      {shopSections(data.sport).map((sec) => (
        <section key={sec.title} className="shop-sec">
          <h2>{sec.title}</h2>
          <ul className="shop-grid">
            {sec.items.map((i) => {
              const owned = data.owned.includes(i.id);
              const short = data.points < i.price;
              return (
                <li key={i.id} className={`shop-item${owned ? " owned" : ""}`}>
                  <div className="shop-pic"><FurnitureIcon itemId={i.id} size={80} /></div>
                  <b>{i.name}</b>
                  <span className="price">{i.price}P · {i.slotType === "wall" ? "벽" : "바닥"}</span>
                  {owned ? (
                    <span className="owned-tag">보유 중</span>
                  ) : (
                    <button type="button" className="btn buy" disabled={short || !!buying} onClick={() => buy(i)}>
                      {short ? "포인트가 모자라요" : buying === i.id ? "사는 중…" : "사기"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
