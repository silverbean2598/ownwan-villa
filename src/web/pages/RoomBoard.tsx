import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { BoardItem, groupByDay, type BoardItemData } from "../components/Board";
import { NotFoundRoom, useRoomMember } from "./Room";
import "../components/villa.css";

const PAGE = 20;

export function RoomBoard() {
  const { userId } = useParams();
  const { state, error } = useRoomMember(userId, `/room/${userId}/board`);
  const [items, setItems] = useState<BoardItemData[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState("");
  const target = state?.member?.userId;

  const load = useCallback(
    async (before?: number) => {
      if (!target) return;
      setLoading(true);
      setErr("");
      try {
        const r = await api<BoardItemData[]>(
          `/api/users/${target}/board?limit=${PAGE}${before ? `&before=${before}` : ""}`,
        );
        setItems((prev) => (before ? [...prev, ...r] : r));
        setMore(r.length === PAGE);
        setLoaded(true);
      } catch (e) {
        setErr(e instanceof ApiError ? e.message : "기록을 불러오지 못했어요");
      } finally {
        setLoading(false);
      }
    },
    [target],
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <main className="page"><p className="error" role="alert">{error}</p></main>;
  if (!state) return <main className="page"><p className="muted">불러오는 중이에요</p></main>;
  if (!state.member) return <NotFoundRoom />;

  return (
    <main className="villa-page room-page">
      <Link className="back" to={`/room/${state.member.userId}`}>← 방으로</Link>
      <h1>{state.member.nickname}의 기록</h1>
      {err && <p className="error" role="alert">{err}</p>}
      {loaded && items.length === 0 && <p className="muted">아직 붙인 기록이 없어요</p>}
      {groupByDay(items).map((g) => (
        <section key={g.day} className="day-group">
          <h2>{g.heading}</h2>
          <div className="board full">
            {g.items.map((it) => <BoardItem key={it.id} item={it} />)}
          </div>
        </section>
      ))}
      {more && (
        <button type="button" className="btn ghost more" disabled={loading} onClick={() => load(items[items.length - 1].createdAt)}>
          {loading ? "불러오는 중이에요" : "더 보기"}
        </button>
      )}
    </main>
  );
}
