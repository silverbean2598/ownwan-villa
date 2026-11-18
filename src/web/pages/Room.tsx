import { useEffect, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { SPORT_LABEL } from "../../shared/sports";
import { displayStreak } from "../../shared/rules/streak";
import { Board, type BoardItemData } from "../components/Board";
import { usePhotoActions } from "../components/PhotoActions";
import { RoomScene } from "../components/RoomScene";
import type { Member } from "../components/Building";
import { FurnitureIcon } from "../components/furniture";
import { slotAnchors, sceneGeom, type Anchor } from "../components/furniture/layout";
import { CATALOG, SLOTS, findItem, slotType, type Slot } from "../../shared/catalog";
import { CertifyButton } from "../components/CertifyButton";
import "../components/villa.css";

type VillaData = { ownerId: string; penthouseUserId: string | null; members: Member[] } | null;
type Me = { id: string };

type Placement = { slot: string; itemId: string };
type ShopData = { points: number; owned: string[] };

export const SLOT_LABEL: Record<Slot, string> = {
  wall1: "오른쪽 벽",
  wall2: "뒷벽",
  floor1: "바닥 1",
  floor2: "바닥 2",
  floor3: "바닥 3",
};

/** 방 상세 위에 겹치는 자리 버튼의 위치(%) */
function slotStyle(p: Anchor): CSSProperties {
  const { g } = sceneGeom("detail", false);
  const wall = slotType(p.slot) === "wall";
  const w = wall ? 34 * (p.skew ? p.sx : p.s) : 46 * p.s;
  const h = wall ? 30 * p.s : 30 * p.s;
  const top = wall ? p.y - h / 2 : p.y - h + 4 * p.s;
  return {
    left: `${((p.x - w / 2) / g.W) * 100}%`,
    top: `${(top / g.H) * 100}%`,
    width: `${(w / g.W) * 100}%`,
    height: `${(h / g.H) * 100}%`,
    transform: p.skew ? `skewY(${Math.atan(p.skew)}rad)` : undefined,
  };
}

/** 방 주인의 방 정보를 불러온다. 401이면 로그인으로 보낸다. */
export function useRoomMember(userId: string | undefined, path: string) {
  const nav = useNavigate();
  const [state, setState] = useState<{ me: Me; member: Member | null; penthouse: boolean; iAmVillaOwner: boolean } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await api<Me>("/api/me");
        const villa = await api<VillaData>("/api/villas/mine");
        const member = villa?.members.find((m) => m.userId === userId) ?? null;
        if (alive) setState({ me, member, penthouse: !!member && villa?.penthouseUserId === member.userId, iAmVillaOwner: villa?.ownerId === me.id });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return nav(`/login?next=${encodeURIComponent(path)}`, { replace: true });
        if (alive) setError(e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");
      }
    })();
    return () => {
      alive = false;
    };
  }, [nav, userId, path]);
  return { state, error };
}

export function NotFoundRoom() {
  return (
    <main className="page">
      <h1>이 방을 찾을 수 없어요</h1>
      <Link className="btn" to="/villa">빌라로</Link>
    </main>
  );
}

export function Room() {
  const { userId } = useParams();
  const { state, error } = useRoomMember(userId, `/room/${userId}`);
  const [items, setItems] = useState<BoardItemData[] | null>(null);
  const [boardError, setBoardError] = useState("");
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [shop, setShop] = useState<ShopData | null>(null);
  const [picking, setPicking] = useState<Slot | null>(null);
  const [placeError, setPlaceError] = useState("");
  const [busy, setBusy] = useState(false);
  const isMe = !!state?.member && state.me.id === state.member.userId;

  useEffect(() => {
    if (state?.member) setPlacements(state.member.placements);
  }, [state?.member]);

  useEffect(() => {
    if (!isMe) return;
    let alive = true;
    api<ShopData>("/api/shop")
      .then((r) => alive && setShop(r))
      .catch(() => alive && setShop({ points: 0, owned: [] }));
    return () => {
      alive = false;
    };
  }, [isMe]);

  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!state?.member) return;
    let alive = true;
    api<BoardItemData[]>(`/api/users/${state.member.userId}/board?limit=6`)
      .then((r) => alive && setItems(r))
      .catch((e) => alive && setBoardError(e instanceof ApiError ? e.message : "기록을 불러오지 못했어요"));
    return () => {
      alive = false;
    };
  }, [state?.member, reload]);
  const photoActions = usePhotoActions({
    ownerId: userId ?? "",
    meId: state?.me.id ?? "",
    iAmVillaOwner: !!state?.iAmVillaOwner,
    onDone: () => setReload((n) => n + 1),
  });

  if (error) return <main className="page"><p className="error" role="alert">{error}</p></main>;
  if (!state) return <main className="page"><p className="muted">불러오는 중이에요</p></main>;
  const { member, penthouse } = state;
  if (!member) return <NotFoundRoom />;
  const anchors = slotAnchors("detail", penthouse);
  const placedIn = (slot: Slot) => placements.find((p) => p.slot === slot);

  function openPicker(slot?: Slot) {
    setPlaceError("");
    setPicking(slot ?? SLOTS.find((s) => !placedIn(s)) ?? "wall1");
  }

  async function place(slot: Slot, itemId: string | null) {
    setBusy(true);
    setPlaceError("");
    try {
      await api("/api/placements", { method: "PUT", body: JSON.stringify({ slot, itemId }) });
      setPlacements((ps) => {
        const rest = ps.filter((p) => p.slot !== slot && p.itemId !== itemId);
        return itemId ? [...rest, { slot, itemId }] : rest;
      });
      setPicking(null);
    } catch (e) {
      setPlaceError(e instanceof ApiError ? e.message : "가구를 놓지 못했어요. 다시 해 주세요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="villa-page room-page">
      <Link className="back" to="/villa">← 빌라로</Link>
      <header className="room-head">
        <h1>{member.nickname}</h1>
        <div className="stats">
          <span className="chip" aria-label="종목">{SPORT_LABEL[member.sport]}</span>
          <span className="chip">{penthouse ? "펜트하우스" : `${member.floor}층`}</span>
          {member.floorUpToday && <span className="chip up-chip">+1층</span>}
          <span className="chip">연속 <b>{displayStreak(member.streak, member.certifiedToday)}</b>일</span>
        </div>
        {isMe && <CertifyButton certifiedToday={member.certifiedToday} />}
      </header>
      <div className={`room-stage ${member.certifiedToday ? "on" : "off"}`}>
        <div className={`room ${member.certifiedToday ? "on" : "off"} big`}>
          <RoomScene
            sport={member.sport}
            lit={member.certifiedToday}
            avatar={member.avatar}
            penthouse={penthouse}
            variant="detail"
            placements={placements}
            board={
              <section className="left-wall" aria-label="게시판">
                <Link className="board-link" to={`/room/${member.userId}/board`} aria-label="전체 기록 보기">
                  {boardError ? <p className="error" role="alert">{boardError}</p> : <Board items={items ?? []} renderPhotoActions={photoActions.render} />}
                </Link>
              </section>
            }
          />
        </div>
        {isMe && (
          <div className="slots">
            {SLOTS.map((s) => {
              const item = findItem(placedIn(s)?.itemId);
              return (
                <button
                  key={s}
                  type="button"
                  className={`slot ${slotType(s)}${item ? " filled" : ""}${picking === s ? " picking" : ""}`}
                  data-slot={s}
                  style={slotStyle(anchors[s])}
                  aria-label={`${SLOT_LABEL[s]}: ${item ? `${item.name} 바꾸기` : "가구 놓기"}`}
                  onClick={() => openPicker(s)}
                >
                  {!item && <span aria-hidden="true">+</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {isMe && picking && (
        <Picker
          slot={picking}
          placements={placements}
          owned={shop?.owned ?? []}
          busy={busy}
          error={placeError}
          onSlot={(s) => {
            setPlaceError("");
            setPicking(s);
          }}
          onPlace={place}
          onClose={() => setPicking(null)}
        />
      )}
      {isMe && !picking && (
        <div className="room-actions">
          <button type="button" className="btn" onClick={() => openPicker()}>가구 놓기</button>
          <Link className="btn ghost" to="/shop">가구 상점</Link>
        </div>
      )}
      <Link className="btn ghost board-all" to={`/room/${member.userId}/board`}>전체 기록 보기</Link>
      {photoActions.dialog}
    </main>
  );
}

type PickerProps = {
  slot: Slot;
  placements: Placement[];
  owned: string[];
  busy: boolean;
  error: string;
  onSlot: (s: Slot) => void;
  onPlace: (s: Slot, itemId: string | null) => void;
  onClose: () => void;
};

/** 자리를 고르고, 그 자리에 맞는 내 가구를 놓거나 비운다 */
function Picker({ slot, placements, owned, busy, error, onSlot, onPlace, onClose }: PickerProps) {
  const type = slotType(slot);
  const current = placements.find((p) => p.slot === slot)?.itemId;
  const items = CATALOG.filter((i) => i.slotType === type && owned.includes(i.id));
  return (
    <section className="picker" role="dialog" aria-label="가구 놓기">
      <div className="picker-head">
        <h2>가구 놓기</h2>
        <button type="button" className="picker-close" onClick={onClose}>닫기</button>
      </div>
      <div className="picker-slots" role="radiogroup" aria-label="자리">
        {SLOTS.map((s) => (
          <button key={s} type="button" role="radio" aria-checked={s === slot} className={`choice small${s === slot ? " on" : ""}`} onClick={() => onSlot(s)}>
            {SLOT_LABEL[s]}
          </button>
        ))}
      </div>
      {items.length === 0 ? (
        <p className="muted picker-empty">
          놓을 수 있는 {type === "wall" ? "벽" : "바닥"} 가구가 없어요. <Link to="/shop">가구 상점</Link>에서 골라 보세요.
        </p>
      ) : (
        <ul className="picker-items">
          {items.map((i) => {
            const elsewhere = placements.find((p) => p.itemId === i.id && p.slot !== slot);
            return (
              <li key={i.id}>
                <button type="button" className={`pick${current === i.id ? " on" : ""}`} disabled={busy || current === i.id} onClick={() => onPlace(slot, i.id)}>
                  <FurnitureIcon itemId={i.id} size={48} />
                  <span>{i.name}</span>
                  <small>{current === i.id ? "놓여 있어요" : elsewhere ? `${SLOT_LABEL[elsewhere.slot as Slot]}에서 옮겨요` : "놓기"}</small>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {current && (
        <button type="button" className="btn ghost" disabled={busy} onClick={() => onPlace(slot, null)}>
          이 자리 비우기
        </button>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
