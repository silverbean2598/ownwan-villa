import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { BoardItem, groupByDay, type BoardItemData } from "../components/Board";
import { usePhotoActions } from "../components/PhotoActions";
import { CheerBar, CommentThread } from "../components/Cheer";
import { RoutineEditor } from "../components/RoutineEdit";
import { NotFoundRoom, useRoomMember } from "./Room";
import { roomPath } from "../villa/current";
import { ShareButton } from "../share/ShareButton";
import { kstDay } from "../../shared/rules/day";
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
  const villaId = state?.villaId ?? "";
  const [thread, setThread] = useState<string | null>(null);
  const cheering = useRef(new Set<string>());
  const patch = (id: string, p: Partial<BoardItemData>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  /** 하트: 먼저 화면을 바꾸고, 실패하면 되돌린다. 응답을 기다리는 동안 같은 하트는 다시 누르지 않는다 */
  async function cheer(it: BoardItemData) {
    if (cheering.current.has(it.id)) return;
    cheering.current.add(it.id);
    const before = { cheeredByMe: !!it.cheeredByMe, cheerCount: it.cheerCount ?? 0 };
    patch(it.id, { cheeredByMe: !before.cheeredByMe, cheerCount: Math.max(0, before.cheerCount + (before.cheeredByMe ? -1 : 1)) });
    setErr("");
    try {
      const r = await api<{ cheered: boolean; count: number }>(`/api/certs/${it.id}/cheer`, { method: "POST" });
      patch(it.id, { cheeredByMe: r.cheered, cheerCount: r.count });
    } catch (e) {
      patch(it.id, before);
      setErr(e instanceof ApiError ? e.message : "응원하지 못했어요. 다시 해 주세요");
    } finally {
      cheering.current.delete(it.id);
    }
  }
  /** 고치는 중인 루틴 (한 번에 하나). draft · error 는 저장에 실패해 되돌아왔을 때 */
  const [editing, setEditing] = useState<{ id: string; draft?: string; error?: string } | null>(null);

  /** 루틴 저장: 먼저 화면을 바꾸고 닫는다. 실패하면 글을 되돌리고, 고치던 글로 다시 연다 */
  async function saveRoutine(it: BoardItemData, text: string) {
    const body = text.trim();
    const before = { body: it.body, editedAt: it.editedAt };
    patch(it.id, { body, editedAt: Date.now() });
    setEditing(null);
    setErr("");
    try {
      const r = await api<{ ok: boolean; body: string; editedAt: number }>(`/api/certs/${it.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      });
      patch(it.id, { body: r.body, editedAt: r.editedAt });
    } catch (e) {
      patch(it.id, before);
      setEditing({ id: it.id, draft: text, error: e instanceof ApiError ? e.message : "루틴을 고치지 못했어요. 다시 해 주세요" });
    }
  }
  const photoActions = usePhotoActions({
    ownerId: userId ?? "",
    meId: state?.me.id ?? "",
    iAmVillaOwner: !!state?.iAmVillaOwner,
    onDone: () => void load(),
  });

  const load = useCallback(
    async (before?: number) => {
      if (!target) return;
      setLoading(true);
      setErr("");
      try {
        const r = await api<BoardItemData[]>(
          `/api/users/${target}/board?limit=${PAGE}&villa=${encodeURIComponent(villaId)}${before ? `&before=${before}` : ""}`,
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
    [target, villaId],
  );
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <main className="page"><p className="error" role="alert">{error}</p></main>;
  if (!state) return <main className="page"><p className="muted">불러오는 중이에요</p></main>;
  if (!state.member) return <NotFoundRoom />;
  const mine = state.me.id === state.member.userId;
  const today = kstDay(Date.now());

  return (
    <main className="villa-page room-page">
      <Link className="back" to={roomPath(state.member.userId, state.villaId)}>← 방으로</Link>
      <h1>{state.member.nickname}의 기록</h1>
      {err && <p className="error" role="alert">{err}</p>}
      {loaded && items.length === 0 && <p className="muted">아직 붙인 기록이 없어요</p>}
      {groupByDay(items).map((g) => (
        <section key={g.day} className="day-group">
          <div className="day-head">
            <h2>{g.heading}</h2>
            {/* 내 기록의 오늘 칸에서 오늘 인증 카드를 만든다 */}
            {mine && g.day === today && <ShareButton card={{ kind: "cert", villaId }} label="오늘 인증 카드 만들기" className="small" />}
          </div>
          <div className="board full">
            {g.items.map((it) => (
              <Fragment key={it.id}>
                <div className="board-cell">
                  <BoardItem item={it} renderPhotoActions={photoActions.render} />
                  {!it.hidden && (
                    <CheerBar
                      item={it}
                      mine={mine}
                      open={thread === it.id}
                      onCheer={() => void cheer(it)}
                      onToggleThread={() => {
                        setEditing(null);
                        setThread(thread === it.id ? null : it.id);
                      }}
                    >
                      {/* 내 루틴에만 [수정]. 다른 사람 기록 · 사진에는 없다(읽기전용) */}
                      {mine && it.kind === "routine" && editing?.id !== it.id && (
                        <button
                          type="button"
                          className="cheer-edit"
                          aria-label="루틴 수정"
                          onClick={() => {
                            setThread(null);
                            setEditing({ id: it.id });
                          }}
                        >
                          수정
                        </button>
                      )}
                    </CheerBar>
                  )}
                </div>
                {editing?.id === it.id && !it.hidden && (
                  <RoutineEditor
                    key={`${it.id}:${editing.error ?? ""}`}
                    original={it.body ?? ""}
                    initial={editing.draft}
                    error={editing.error}
                    onSave={(text) => void saveRoutine(it, text)}
                    onCancel={() => setEditing(null)}
                  />
                )}
                {thread === it.id && !it.hidden && (
                  <CommentThread certId={it.id} onCount={(n) => patch(it.id, { commentCount: n })} />
                )}
              </Fragment>
            ))}
          </div>
        </section>
      ))}
      {more && (
        <button type="button" className="btn ghost more" disabled={loading} onClick={() => load(items[items.length - 1].createdAt)}>
          {loading ? "불러오는 중이에요" : "더 보기"}
        </button>
      )}
      {photoActions.dialog}
    </main>
  );
}
