import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { SPORT_LABEL } from "../../shared/sports";
import { displayStreak } from "../../shared/rules/streak";
import { Board, type BoardItemData } from "../components/Board";
import { usePhotoActions } from "../components/PhotoActions";
import { RoomScene } from "../components/RoomScene";
import type { Member } from "../components/Building";
import { FurnitureIcon } from "../components/furniture";
import { placeSlot, placedRect, sceneGeom, type Placed } from "../components/furniture/layout";
import { FURNITURE, SLOTS, findItem, slotType, type Slot } from "../../shared/catalog";
import { CertifyButton } from "../components/CertifyButton";
import { loadMyVillas, pickVilla, roomPath, villaPath } from "../villa/current";
import { ShareButton } from "../share/ShareButton";
import "../components/villa.css";

type VillaData = { id: string; name?: string; ownerId: string; penthouseUserId: string | null; members: Member[] };
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

/**
 * 방 상세 위에 겹치는 자리 버튼의 위치(%). 놓인 가구(없으면 기본 크기)의 실제 자리와 같은 상자,
 * 옆벽 자리는 벽면을 따라 기울인다.
 */
function slotStyle(p: Placed): CSSProperties {
  const { g } = sceneGeom("detail", false);
  const r = placedRect(p);
  // 손가락으로 누르기 쉽게 너무 작은 자리는 조금 키운다
  const w = Math.max(r.w, 22);
  const h = Math.max(r.h, 18);
  return {
    left: `${((r.cx - w / 2) / g.W) * 100}%`,
    top: `${((r.cy - h / 2) / g.H) * 100}%`,
    width: `${(w / g.W) * 100}%`,
    height: `${(h / g.H) * 100}%`,
    transform: r.skew ? `skewY(${r.skew}rad)` : undefined,
  };
}

type RoomState = { me: Me; member: Member | null; penthouse: boolean; iAmVillaOwner: boolean; villaId: string; villaName: string | null; multi: boolean };

/**
 * 방 주인의 방 정보를 불러온다. 401이면 로그인으로 보낸다.
 * 어느 빌라에서 보는지는 주소의 ?villa= 로 정한다. 없으면(예전 주소) 이 기기에서 마지막으로 본 빌라부터, 그 사람이 사는 빌라를 찾는다.
 */
export function useRoomMember(userId: string | undefined, path: string) {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const want = params.get("villa");
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await api<Me>("/api/me");
        const villas = await loadMyVillas();
        const first = pickVilla(villas, want);
        const order = want ? (first === want ? [want] : []) : [...new Set([first, ...villas.map((v) => v.id)])].filter((x): x is string => !!x);
        let found: RoomState = { me, member: null, penthouse: false, iAmVillaOwner: false, villaId: first ?? "", villaName: null, multi: villas.length > 1 };
        for (const id of order) {
          const villa = await api<VillaData>(`/api/villas/${id}`);
          const member = villa.members.find((m) => m.userId === userId) ?? null;
          if (!member) continue;
          found = { ...found, member, penthouse: villa.penthouseUserId === member.userId, iAmVillaOwner: villa.ownerId === me.id, villaId: id, villaName: villa.name ?? null };
          break;
        }
        if (alive) setState(found);
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return nav(`/login?next=${encodeURIComponent(path)}`, { replace: true });
        if (alive) setError(e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");
      }
    })();
    return () => {
      alive = false;
    };
  }, [nav, userId, path, want]);
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
  // 방 꾸미기: 보기(점선 자리 없음) ↔ 편집 중(점선 자리를 눌러 가구 놓기). 남의 방은 읽기 전용이라 버튼이 없다
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState<Slot | null>(null);
  const editBtn = useRef<HTMLButtonElement>(null);
  const firstSlot = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<"slot" | "edit" | null>(null);
  const [placeError, setPlaceError] = useState("");
  const [busy, setBusy] = useState(false);
  const isMe = !!state?.member && state.me.id === state.member.userId;

  useEffect(() => {
    if (state?.member) setPlacements(state.member.placements);
  }, [state?.member]);

  // 다른 방으로 옮기면 보기로 돌아간다
  useEffect(() => {
    setEditing(false);
    setPicking(null);
  }, [userId]);

  // 버튼이 바뀌어 사라져도 키보드 초점을 잃지 않게: 꾸미기 시작 → 첫 자리, 완료 → 방 꾸미기 버튼
  useEffect(() => {
    const to = focusAfter.current;
    focusAfter.current = null;
    if (to === "slot") firstSlot.current?.focus();
    if (to === "edit") editBtn.current?.focus();
  }, [editing]);

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
    api<BoardItemData[]>(`/api/users/${state.member.userId}/board?limit=6&villa=${encodeURIComponent(state.villaId)}`)
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
  const { member, penthouse, villaId, multi } = state;
  if (!member) return <NotFoundRoom />;
  const userStreak = displayStreak(member.userStreak ?? member.streak, member.certifiedAnywhere ?? member.certifiedToday);
  const villaStreak = displayStreak(member.streak, member.certifiedToday);
  const placedIn = (slot: Slot) => placements.find((p) => p.slot === slot);

  function openPicker(slot: Slot) {
    setPlaceError("");
    setPicking(slot);
  }

  function startEdit() {
    focusAfter.current = "slot";
    setEditing(true);
  }

  function finishEdit() {
    focusAfter.current = "edit";
    setPicking(null);
    setEditing(false);
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
      <Link className="back" to={villaPath(villaId)}>← 빌라로</Link>
      <header className="room-head">
        <h1>{member.nickname}</h1>
        <div className="stats">
          <span className="chip" aria-label="종목">{SPORT_LABEL[member.sport]}</span>
          <span className="chip">{penthouse ? "펜트하우스" : `${member.floor}층`}</span>
          {member.floorUpToday && <span className="chip up-chip">+1층</span>}
          <span className="chip">연속 <b>{userStreak}</b>일</span>
          {/* 빌라 여러 곳에 살면 이 빌라 층을 정하는 연속 기록이 다를 수 있다 */}
          {multi && villaStreak !== userStreak && <span className="chip">이 빌라 <b>{villaStreak}</b>일</span>}
        </div>
        {isMe && <CertifyButton certifiedToday={member.certifiedToday} certifiedElsewhere={multi && !!member.certifiedAnywhere} villaId={villaId} />}
      </header>
      <div className={`room-stage ${member.certifiedToday ? "on" : "off"}${isMe && editing ? " editing" : ""}`}>
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
                <Link className="board-link" to={roomPath(member.userId, villaId, true)} aria-label="전체 기록 보기">
                  {boardError ? <p className="error" role="alert">{boardError}</p> : <Board items={items ?? []} renderPhotoActions={photoActions.render} />}
                </Link>
              </section>
            }
          />
        </div>
        {/* 점선 자리는 꾸미는 중에만 그린다(보기에서는 화면에도, 보조기기에도 없다) */}
        {isMe && editing && (
          <div className="slots" role="group" aria-label="가구 자리">
            {SLOTS.map((s, i) => {
              const item = findItem(placedIn(s)?.itemId);
              return (
                <button
                  key={s}
                  ref={i === 0 ? firstSlot : undefined}
                  type="button"
                  className={`slot ${slotType(s)}${item ? " filled" : ""}${picking === s ? " picking" : ""}`}
                  data-slot={s}
                  style={slotStyle(placeSlot("detail", penthouse, s, item?.id))}
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
      {isMe && editing && !picking && (
        <p className="edit-hint" role="status">
          점선 자리를 눌러 가구를 놓거나 바꿔 보세요
        </p>
      )}
      {isMe && !picking && (
        <div className="room-actions">
          {editing ? (
            <button type="button" className="btn done" onClick={finishEdit}>
              완료
            </button>
          ) : (
            <button ref={editBtn} type="button" className="btn" onClick={startEdit}>
              방 꾸미기
            </button>
          )}
          <Link className="btn ghost" to="/shop">가구 상점</Link>
        </div>
      )}
      {isMe && !picking && (
        <div className="room-actions share-row">
          {/* 지금 놓인 가구 그대로 */}
          <ShareButton card={{ kind: "room", input: { member: { ...member, placements }, penthouse, villaName: state.villaName } }} label="내 방 이미지로 저장 · 공유" />
        </div>
      )}
      <Link className="btn ghost board-all" to={roomPath(member.userId, villaId, true)}>전체 기록 보기</Link>
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
  const items = FURNITURE.filter((i) => i.slotType === type && owned.includes(i.id));
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
