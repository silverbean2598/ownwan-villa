import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { CityMap } from "../components/city/CityMap";
import { colsFor } from "../components/city/layout";
import { VILLA_CAPACITY } from "../../shared/villa";
import type { CityMine, CityResponse, CityVilla } from "../../shared/city";
import { topicParticle } from "../events/plan";
import { RecruitCard } from "../components/city/RecruitCard";
import type { MyApplication } from "../../shared/recruit";

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");
const width = () => (typeof window === "undefined" ? 390 : Math.min(window.innerWidth, 1100));

/**
 * 누른 빌라의 작은 카드: 이름 · 입주 인원 · 오늘 불 켜진 방 · 펜트하우스 주인 (사진 · 루틴 · 입주민 목록은 없다).
 * 빈방 모집 중이면 모집 글과 [입주 신청]
 */
function VillaCard({
  v, mine, myApp, villaCount, onChanged, onClose,
}: {
  v: CityVilla;
  mine: boolean;
  myApp: MyApplication | null;
  villaCount: number;
  onChanged: () => Promise<void>;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // 닫으면 누른 건물로 포커스를 돌려준다
    const prev = document.activeElement as HTMLElement | SVGElement | null;
    box.current?.focus();
    return () => prev?.focus?.();
  }, [v.id]);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  };
  return (
    <div className="city-sheet">
      <div className="city-card" role="dialog" aria-label={`${v.name} 정보`} tabIndex={-1} ref={box} onKeyDown={onKey}>
        <div className="city-card-top">
          <div>
            {mine && <span className="mine-tag">우리 빌라</span>}
            <h2>{v.name}</h2>
          </div>
          <button type="button" className="x" aria-label="닫기" onClick={onClose}>×</button>
        </div>
        <ul className="city-facts">
          <li>입주 인원<b>{v.memberCount}/{VILLA_CAPACITY}명</b></li>
          <li className="lit">오늘 불 켜진 방<b>{v.litCount}개</b></li>
          <li className="ph">펜트하우스 주인<b>{v.penthouseNickname ?? "아직 없어요"}</b></li>
          <li>가장 높은 층<b>{v.topFloor}층</b></li>
        </ul>
        <RecruitCard key={v.id} v={v} mine={mine} myApp={myApp} villaCount={villaCount} onChanged={onChanged} />
        {!mine && <p className="note">사진과 루틴은 그 빌라 입주민끼리만 봐요.</p>}
      </div>
    </div>
  );
}

export function City() {
  const nav = useNavigate();
  const [data, setData] = useState<CityResponse | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [cols, setCols] = useState(() => colsFor(width()));
  const [busy, setBusy] = useState(false);
  const [hintErr, setHintErr] = useState("");
  const scrolled = useRef(false);

  const load = useCallback(async () => {
    try {
      setData(await api<CityResponse>("/api/city"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return nav("/login?next=/city", { replace: true });
      setError(msg(e));
    }
  }, [nav]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onResize = () => setCols(colsFor(width()));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // 처음 열 때 우리 빌라가 지도에 있으면 그 자리로
  useEffect(() => {
    if (!data || scrolled.current) return;
    const el = document.getElementById("city-mine");
    if (el) {
      scrolled.current = true;
      el.scrollIntoView?.({ block: "center" });
    }
  }, [data]);

  if (error) return <main className="page"><p className="error" role="alert">{error}</p></main>;
  if (!data) return <main className="page"><p className="muted">도시를 불러오는 중이에요</p></main>;

  const { villas } = data;
  // 내가 사는 빌라 모두 (예전 서버 응답이면 mine 하나)
  const mineAll: CityMine[] = data.myVillas ?? (data.mine ? [data.mine] : []);
  const mineIds = mineAll.map((m) => m.villaId);
  const sel = villas.find((v) => v.id === selected) ?? null;
  const hidden = mineAll.filter((m) => !m.public);

  async function publish(villaId: string) {
    setBusy(true);
    setHintErr("");
    try {
      await api(`/api/villas/${villaId}/public`, { method: "PUT", body: JSON.stringify({ public: true }) });
      scrolled.current = false;
      await load();
    } catch (e) {
      setHintErr(msg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="city-page">
      <header className="city-head">
        <Link className="back" to="/villa">← 빌라로</Link>
        <h1>도시</h1>
        <p>
          {villas.length ? `공개한 빌라 ${villas.length}곳이 모여 있어요. ` : "아직 공개한 빌라가 없어요. "}
          불 켜진 창문은 오늘 운동한 사람이에요.
          {villas.some((v) => v.recruit) && " 깃발이 꽂힌 빌라는 입주자를 모집하고 있어요."}
        </p>
      </header>

      {mineAll.length === 0 && <div className="city-hint">빌라에 입주하면 우리 빌라도 지도에 올릴 수 있어요.</div>}
      {mineAll.length === 1 && hidden.length === 1 && hidden[0].isOwner && (
        <div className="city-hint" role="status">
          <span>우리 빌라는 아직 지도에 없어요. 공개하면 다른 빌라도 구경할 수 있어요.</span>
          <button type="button" className="btn" disabled={busy} onClick={() => publish(hidden[0].villaId)}>지도에 공개하기</button>
        </div>
      )}
      {mineAll.length === 1 && hidden.length === 1 && !hidden[0].isOwner && <div className="city-hint" role="status">방장이 공개하면 지도에 나와요.</div>}
      {/* 빌라 여러 곳에 살면 지도에 없는 빌라마다 한 줄씩 */}
      {mineAll.length > 1 &&
        hidden.map((m) => (
          <div className="city-hint" role="status" key={m.villaId}>
            <span>
              {m.name}
              {topicParticle(m.name)} {m.isOwner ? "아직 지도에 없어요." : "방장이 공개하면 지도에 나와요."}
            </span>
            {m.isOwner && (
              <button type="button" className="btn" disabled={busy} aria-label={`${m.name} 지도에 공개하기`} onClick={() => publish(m.villaId)}>
                지도에 공개하기
              </button>
            )}
          </div>
        ))}
      {data.myApplication && (
        <div className="city-hint apply-hint" role="status">
          <span>
            <b>{data.myApplication.villaName}</b>에 입주 신청했어요. 방장의 답을 기다리는 중이에요.
          </span>
          {villas.some((v) => v.id === data.myApplication!.villaId) && (
            <button type="button" className="btn ghost" onClick={() => setSelected(data.myApplication!.villaId)}>보기</button>
          )}
        </div>
      )}
      {hintErr && <p className="error" role="alert" style={{ margin: "0 16px 12px" }}>{hintErr}</p>}

      <div className="city-frame">
        <CityMap
          villas={villas}
          cols={cols}
          mineIds={mineIds}
          selectedId={selected}
          onSelect={(v) => setSelected(v.id)}
        />
      </div>

      {sel && (
        <VillaCard
          v={sel}
          mine={mineIds.includes(sel.id)}
          myApp={data.myApplication ?? null}
          villaCount={mineAll.length}
          onChanged={load}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
