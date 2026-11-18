import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { SPORT_LABEL } from "../../shared/sports";
import { Board, type BoardItemData } from "../components/Board";
import { RoomScene } from "../components/RoomScene";
import type { Member } from "../components/Building";
import "../components/villa.css";

type VillaData = { penthouseUserId: string | null; members: Member[] } | null;
type Me = { id: string };

export const SLOTS = ["wall1", "wall2", "floor1", "floor2", "floor3"] as const;

/** 방 주인의 방 정보를 불러온다. 401이면 로그인으로 보낸다. */
export function useRoomMember(userId: string | undefined, path: string) {
  const nav = useNavigate();
  const [state, setState] = useState<{ me: Me; member: Member | null; penthouse: boolean } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const me = await api<Me>("/api/me");
        const villa = await api<VillaData>("/api/villas/mine");
        const member = villa?.members.find((m) => m.userId === userId) ?? null;
        if (alive) setState({ me, member, penthouse: !!member && villa?.penthouseUserId === member.userId });
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

  useEffect(() => {
    if (!state?.member) return;
    let alive = true;
    api<BoardItemData[]>(`/api/users/${state.member.userId}/board?limit=6`)
      .then((r) => alive && setItems(r))
      .catch((e) => alive && setBoardError(e instanceof ApiError ? e.message : "기록을 불러오지 못했어요"));
    return () => {
      alive = false;
    };
  }, [state?.member]);

  if (error) return <main className="page"><p className="error" role="alert">{error}</p></main>;
  if (!state) return <main className="page"><p className="muted">불러오는 중이에요</p></main>;
  const { me, member, penthouse } = state;
  if (!member) return <NotFoundRoom />;
  const isMe = me.id === member.userId;

  return (
    <main className="villa-page room-page">
      <Link className="back" to="/villa">← 빌라로</Link>
      <header className="room-head">
        <h1>{member.nickname}</h1>
        <div className="stats">
          <span className="chip" aria-label="종목">{SPORT_LABEL[member.sport]}</span>
          <span className="chip">{penthouse ? "펜트하우스" : `${member.floor}층`}</span>
          <span className="chip">연속 <b>{member.streak}</b>일</span>
        </div>
        {isMe && !member.certifiedToday && (
          <Link className="btn primary" to="/certify">오늘 오운완 인증하기</Link>
        )}
      </header>
      <div className={`room-stage ${member.certifiedToday ? "on" : "off"}`}>
        <div className={`room ${member.certifiedToday ? "on" : "off"} big`}>
          <RoomScene
            sport={member.sport}
            lit={member.certifiedToday}
            avatar={member.avatar}
            penthouse={penthouse}
            variant="detail"
            board={
              <section className="left-wall" aria-label="게시판">
                <Link className="board-link" to={`/room/${member.userId}/board`} aria-label="전체 기록 보기">
                  {boardError ? <p className="error" role="alert">{boardError}</p> : <Board items={items ?? []} />}
                </Link>
              </section>
            }
          />
        </div>
        {isMe && (
          <div className="slots" aria-hidden="true">
            {SLOTS.map((s) => (
              <span key={s} className={`slot ${s}`} data-slot={s} />
            ))}
          </div>
        )}
      </div>
      <Link className="btn ghost board-all" to={`/room/${member.userId}/board`}>전체 기록 보기</Link>
    </main>
  );
}
