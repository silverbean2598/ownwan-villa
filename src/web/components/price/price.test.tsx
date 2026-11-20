// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PriceBadges, PriceTag } from "./PriceTag";
import { Ranking } from "../../pages/Ranking";
import { Battle } from "../../pages/Battle";
import { CityMap } from "../city/CityMap";
import { buildingLabel } from "../city/CityBuilding";
import { challengeBlock, type RankingResponse, type VillaBattles, type BattleView } from "../../../shared/price";
import { cardButton, cardLink, eventCopy, isCard, isToast } from "../../events/plan";
import type { CityVilla } from "../../../shared/city";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement;
let calls: { path: string; method: string; body?: string }[] = [];

function mockApi(routes: Record<string, unknown>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      calls.push({ path, method, body: init?.body as string | undefined });
      const hit = routes[`${method} ${path}`] ?? routes[path];
      return new Response(JSON.stringify(hit ?? { ok: true }), { status: hit === undefined && method === "GET" ? 404 : 200 });
    }),
  );
}
const flush = () => act(async () => void (await new Promise((r) => setTimeout(r, 0))));
async function mount(path: string) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/ranking" element={<Ranking />} />
          <Route path="/battle/:id" element={<Battle />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await flush();
}
const click = async (el: Element | null | undefined) => {
  await act(async () => {
    el!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
};
const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === text);

afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  host?.remove();
  vi.unstubAllGlobals();
});

describe("PriceTag", () => {
  it("shows_price_and_colored_change", () => {
    expect(renderToStaticMarkup(<PriceTag price={32} change={3} />)).toContain("3.2억");
    expect(renderToStaticMarkup(<PriceTag price={32} change={3} />)).toContain('class="up"');
    expect(renderToStaticMarkup(<PriceTag price={32} change={-2} />)).toContain("▼0.2억");
    expect(renderToStaticMarkup(<PriceTag price={32} change={0} />)).toContain("변동 없음");
    expect(renderToStaticMarkup(<PriceTag price={null} />)).toContain("집계 전");
  });
  it("badges", () => {
    const html = renderToStaticMarkup(<PriceBadges trophy={2} battleWin inBattle />);
    expect(html).toContain("지난주 2위");
    expect(html).toContain("대결 승리");
    expect(html).toContain("대결 중");
    expect(renderToStaticMarkup(<PriceBadges />)).toBe("");
  });
});

describe("challengeBlock", () => {
  const mine = { villaId: "a", name: "에이", isOwner: true, public: true, inBattle: false };
  it("reasons", () => {
    expect(challengeBlock({ id: "b", inBattle: false }, mine)).toBeNull();
    expect(challengeBlock({ id: "b", inBattle: false }, { ...mine, isOwner: false })).toContain("방장만");
    expect(challengeBlock({ id: "b", inBattle: false }, { ...mine, public: false })).toContain("지도에 공개");
    expect(challengeBlock({ id: "b", inBattle: false }, { ...mine, inBattle: true })).toContain("이미 대결");
    expect(challengeBlock({ id: "b", inBattle: true }, mine)).toContain("다른 대결");
    expect(challengeBlock({ id: "b", inBattle: false }, mine, ["a", "b"])).toContain("내가 방장인 빌라끼리");
  });
});

describe("events", () => {
  it("copy_and_kinds", () => {
    const e = (type: string, payload: Record<string, unknown>) => ({ id: "x", type, payload, createdAt: 0 });
    expect(isCard("league_rank") && isCard("battle_result") && isCard("battle_challenged")).toBe(true);
    expect(isToast("battle_started") && isToast("battle_declined") && isToast("battle_expired") && isToast("battle_cancelled")).toBe(true);
    expect(eventCopy(e("league_rank", { rank: 1, points: 100 }))).toBe("지난주 집값 리그 1위! 우리 빌라 건물에 금 트로피가 달렸어요. 입주민 모두 +100P");
    expect(eventCopy(e("league_rank", { rank: 3, points: 0, multi: true, villaName: "햇살" }))).toContain("햇살 건물에 동 트로피");
    expect(eventCopy(e("league_rank", { rank: 3, points: 0 }))).toContain("다음 기회에");
    expect(eventCopy(e("battle_result", { result: "won", opponentName: "새벽런닝", points: 50 }))).toBe("새벽런닝을 이겼어요! 집값 대결 승리 입주민 모두 +50P");
    expect(eventCopy(e("battle_result", { result: "draw", opponentName: "햇살빌라" }))).toContain("햇살빌라와 무승부");
    expect(eventCopy(e("battle_started", { opponentName: "달빛" }))).toBe("달빛과 집값 대결이 내일부터 7일 동안 열려요");
    expect(eventCopy(e("battle_challenged", { fromName: "달빛" }))).toContain("달빛에서 집값 대결을 신청했어요");
    expect(cardButton("battle_challenged")).toBe("대결 보러 가기");
    expect(cardLink(e("battle_challenged", { villaId: "v9" }))).toBe("/battle/v9");
    expect(cardLink(e("league_rank", { villaId: "v9" }))).toBeNull();
  });
});

describe("city building", () => {
  const v = (o: Partial<CityVilla>): CityVilla => ({ id: "v1", name: "햇살빌라", slot: 0, topFloor: 3, memberCount: 6, litCount: 2, penthouseNickname: null, ...o });
  it("trophy_and_battle_medal_drawn_and_read", () => {
    const html = renderToStaticMarkup(<CityMap villas={[v({ trophy: 1, battleWin: true }), v({ id: "v2", slot: 1 })]} cols={2} selectedId={null} onSelect={() => {}} />);
    expect(html).toContain('data-trophy="1"');
    expect(html.match(/class="cb-medal"/g)).toHaveLength(1);
    expect(buildingLabel(v({ trophy: 2, battleWin: true }), false)).toContain("지난주 집값 2위, 대결 승리");
  });
});

const ranking: RankingResponse = {
  day: "2026-11-19",
  leagueWeek: "2026-11-09",
  villas: [
    { id: "b", name: "새벽런닝", rank: 1, price: 184, change: 6, memberCount: 18, trophy: 1, inBattle: false },
    { id: "a", name: "햇살빌라", rank: 2, price: 52, change: -1, memberCount: 9, battleWin: true, inBattle: false },
    { id: "c", name: "달빛빌라", rank: 3, price: 41, change: 0, memberCount: 7, inBattle: true },
  ],
  mine: [{ villaId: "a", name: "햇살빌라", isOwner: true, public: true, inBattle: false }],
};

describe("Ranking", () => {
  it("lists_villas_highlights_mine_and_challenge_states", async () => {
    mockApi({ "/api/ranking": ranking, "POST /api/villas/a/battles": { current: null, recent: [] }, "/api/villas/a/battles": { isOwner: true, public: true, current: null, recent: [] }, "/api/villas/a/price": { day: null, price: null, change: null, history: [] } });
    await mount("/ranking");
    const rows = [...host.querySelectorAll(".rank-row")];
    expect(rows.map((r) => r.querySelector(".nm")!.textContent)).toEqual(["새벽런닝", "햇살빌라", "달빛빌라"]);
    expect(rows[1].className).toContain("mine");
    expect(rows[0].textContent).toContain("18.4억");
    expect(rows[0].textContent).toContain("▲0.6억");
    // 우리 빌라 줄에는 버튼 없음, 대결 중인 빌라는 흐린 버튼 + 이유
    expect(rows[1].querySelector(".challenge-btn")).toBeNull();
    expect(rows[2].querySelector<HTMLButtonElement>(".challenge-btn")!.disabled).toBe(true);
    expect(rows[2].textContent).toContain("다른 대결 중");
    await click(rows[0].querySelector(".challenge-btn"));
    expect(host.textContent).toContain("새벽런닝에 집값 대결을 신청할까요?");
    await click(button("신청하기"));
    expect(calls.find((c) => c.method === "POST")).toMatchObject({ path: "/api/villas/a/battles", body: JSON.stringify({ opponentVillaId: "b" }) });
  });

  it("non_owner_sees_no_challenge_buttons", async () => {
    mockApi({ "/api/ranking": { ...ranking, mine: [{ ...ranking.mine[0], isOwner: false }] } });
    await mount("/ranking");
    expect(host.querySelector(".challenge-btn")).toBeNull();
  });
});

const side = (villaId: string, name: string, base: number | null = null, now: number | null = null) => ({ villaId, name, base, now, delta: base !== null && now !== null ? now - base : null });
const pending = (s: "challenger" | "opponent"): BattleView => ({
  id: "bt", status: "pending", reason: null, side: s, me: side("a", "햇살빌라"), them: side("b", "새벽런닝"), createdAt: Date.now(), expiresAt: Date.now() + 30 * 3600_000,
});
const priceRes = { day: "2026-11-19", price: 52, change: 3, history: [{ day: "2026-11-18", price: 49 }, { day: "2026-11-19", price: 52 }] };

describe("Battle", () => {
  it("incoming_owner_can_accept_or_decline", async () => {
    const data: VillaBattles = { isOwner: true, public: true, current: pending("opponent"), recent: [] };
    mockApi({ "/api/villas/a/battles": data, "/api/villas/a/price": priceRes, "POST /api/battles/bt/accept": { ...data, current: { ...data.current, status: "active", startDay: "2026-11-21", endDay: "2026-11-27", daysLeft: 7, started: false } } });
    await mount("/battle/a");
    expect(host.textContent).toContain("새벽런닝에서 우리 빌라에 집값 대결을 신청했어요");
    expect(host.textContent).toContain("30시간 안에");
    await click(button("받기"));
    expect(calls.some((c) => c.method === "POST" && c.path === "/api/battles/bt/accept")).toBe(true);
    expect(host.textContent).toContain("대결을 받았어요");
    expect(host.textContent).toContain("내일부터 집값 변화를 겨뤄요");
  });

  it("incoming_member_read_only_and_outgoing_cancel", async () => {
    mockApi({ "/api/villas/a/battles": { isOwner: false, public: true, current: pending("opponent"), recent: [] }, "/api/villas/a/price": priceRes });
    await mount("/battle/a");
    expect(button("받기")).toBeUndefined();
    expect(host.textContent).toContain("방장이 답하기를 기다리는 중이에요");
    act(() => root!.unmount());
    host.remove();
    mockApi({ "/api/villas/a/battles": { isOwner: true, public: true, current: pending("challenger"), recent: [] }, "/api/villas/a/price": priceRes });
    await mount("/battle/a");
    expect(host.textContent).toContain("새벽런닝에 집값 대결을 신청했어요");
    expect(button("신청 취소")).toBeDefined();
  });

  it("active_shows_both_increases_and_recent_results", async () => {
    const active: BattleView = {
      ...pending("challenger"), status: "active", me: side("a", "햇살빌라", 48, 54), them: side("b", "새벽런닝", 180, 183),
      startDay: "2026-11-17", endDay: "2026-11-23", daysLeft: 4, started: true,
    };
    const won: BattleView = { ...pending("opponent"), id: "old", status: "finished", me: side("a", "햇살빌라", 40, 47), them: side("c", "달빛빌라", 30, 33), result: "won", endDay: "2026-11-10" };
    mockApi({ "/api/villas/a/battles": { isOwner: false, public: true, current: active, recent: [won] }, "/api/villas/a/price": priceRes });
    await mount("/battle/a");
    expect(host.textContent).toContain("+0.6억");
    expect(host.textContent).toContain("+0.3억");
    expect(host.textContent).toContain("우리가 0.3억 앞서요");
    expect(host.textContent).toContain("오늘 포함 4일 남았어요");
    expect(host.querySelectorAll(".vs-days .done")).toHaveLength(3);
    expect(host.querySelector(".recent-row")!.textContent).toContain("승리");
    expect(host.querySelector(".recent-row")!.textContent).toContain("달빛빌라");
  });

  it("none_owner_private_points_to_settings_member_sees_note", async () => {
    mockApi({ "/api/villas/a/battles": { isOwner: true, public: false, current: null, recent: [] }, "/api/villas/a/price": priceRes });
    await mount("/battle/a");
    expect(host.textContent).toContain("도시 지도에 공개한 빌라만 대결할 수 있어요");
  });
});
