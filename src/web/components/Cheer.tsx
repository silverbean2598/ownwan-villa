import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError } from "../api";
import type { AvatarSpec } from "../../shared/avatar";
import { MemberHead } from "./MemberManage";
import type { BoardItemData } from "./Board";

export const COMMENT_MAX = 100;

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");

export function HeartIcon({ filled = false, size = 14 }: { filled?: boolean; size?: number }) {
  return (
    <svg className="cheer-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20.5 C5 16 2.5 12.2 2.5 8.6 C2.5 5.6 4.9 3.5 7.6 3.5 C9.5 3.5 11.1 4.5 12 6 C12.9 4.5 14.5 3.5 16.4 3.5 C19.1 3.5 21.5 5.6 21.5 8.6 C21.5 12.2 19 16 12 20.5 Z"
        fill={filled ? "#F2667E" : "none"}
        stroke={filled ? "#E0526B" : "currentColor"}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CommentIcon({ size = 14 }: { size?: number }) {
  return (
    <svg className="cheer-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 4 H19 A2.5 2.5 0 0 1 21.5 6.5 V14.5 A2.5 2.5 0 0 1 19 17 H11 L6.5 20.5 V17 H5 A2.5 2.5 0 0 1 2.5 14.5 V6.5 A2.5 2.5 0 0 1 5 4 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 방 게시판 사진 · 메모 귀퉁이의 작은 수 표시. 0이면 그리지 않는다 */
export function CheerBadges({ item }: { item: BoardItemData }) {
  const hearts = item.cheerCount ?? 0;
  const talk = item.commentCount ?? 0;
  if (!hearts && !talk) return null;
  return (
    <span className="cheer-badges">
      {hearts > 0 && (
        <span className="cheer-badge" aria-label={`응원 ${hearts}개`}>
          <HeartIcon filled size={9} />
          {hearts}
        </span>
      )}
      {talk > 0 && (
        <span className="cheer-badge" aria-label={`댓글 ${talk}개`}>
          <CommentIcon size={9} />
          {talk}
        </span>
      )}
    </span>
  );
}

/** "방금" · "3분 전" · "5시간 전" · "2일 전", 일주일이 넘으면 "10월 1일" */
export function timeAgo(ms: number, nowMs = Date.now()): string {
  const s = Math.max(0, nowMs - ms) / 1000;
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}일 전`;
  const d = new Date(ms + 9 * 3600_000);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

type Props = {
  item: BoardItemData;
  mine: boolean;
  open: boolean;
  onCheer: () => void;
  onToggleThread: () => void;
  /** 줄 끝에 붙이는 버튼 (내 루틴의 [수정]) */
  children?: ReactNode;
};

/** 기록 아래 한 줄: [하트 n] [말풍선 n] */
export function CheerBar({ item, mine, open, onCheer, onToggleThread, children }: Props) {
  const hearts = item.cheerCount ?? 0;
  const talk = item.commentCount ?? 0;
  const on = !!item.cheeredByMe;
  return (
    <div className="cheer-bar">
      <button
        type="button"
        className={`cheer-heart${on ? " on" : ""}`}
        aria-pressed={on}
        aria-label={mine ? `응원 ${hearts}개` : on ? "응원 취소" : "응원하기"}
        disabled={mine}
        onClick={onCheer}
      >
        <HeartIcon filled={on || (mine && hearts > 0)} />
        <span>{hearts}</span>
      </button>
      <button type="button" className={`cheer-talk${open ? " on" : ""}`} aria-expanded={open} aria-label={`댓글 ${talk}개 보기`} onClick={onToggleThread}>
        <CommentIcon />
        <span>{talk}</span>
      </button>
      {children}
    </div>
  );
}

type Comment = { id: string; userId: string; nickname: string; avatar: AvatarSpec; body: string; createdAt: number; canDelete: boolean };

/** 펼친 댓글: 목록 + 입력. 개수가 바뀌면 onCount 로 알린다 */
export function CommentThread({ certId, onCount }: { certId: string; onCount: (n: number) => void }) {
  const [list, setList] = useState<Comment[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    api<Comment[]>(`/api/certs/${certId}/comments`)
      .then((r) => {
        if (!alive) return;
        setList(r);
      })
      .catch((e) => alive && setError(msg(e)));
    return () => {
      alive = false;
    };
    // 펼칠 때 한 번
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [certId]);

  // 응답이 엇갈려 와도(보내고 바로 지우기) 가장 최근 목록에 이어서 바꾼다
  const update = (f: (xs: Comment[]) => Comment[]) => setList((prev) => f(prev ?? []));
  // 개수는 목록이 바뀐 뒤 목록에서 센다
  useEffect(() => {
    if (list) onCount(list.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  const body = text.trim();
  async function send(e: FormEvent) {
    e.preventDefault();
    if (!body || busy) return;
    setBusy(true);
    setError("");
    try {
      const c = await api<Comment>(`/api/certs/${certId}/comments`, { method: "POST", body: JSON.stringify({ body }) });
      update((xs) => [...xs, c]);
      setText("");
    } catch (e) {
      setError(msg(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError("");
    try {
      await api(`/api/comments/${id}`, { method: "DELETE" });
      update((xs) => xs.filter((c) => c.id !== id));
    } catch (e) {
      setError(msg(e));
    }
  }

  return (
    <section className="cheer-thread" aria-label="댓글">
      {list === null && !error && <p className="muted">불러오는 중이에요</p>}
      {list?.length === 0 && <p className="cheer-empty">첫 응원 댓글을 남겨 보세요</p>}
      {list && list.length > 0 && (
        <ul className="comments">
          {list.map((c) => (
            <li key={c.id} className="comment">
              <MemberHead spec={c.avatar} />
              <div className="comment-main">
                <p className="comment-meta">
                  <b>{c.nickname}</b>
                  <time dateTime={new Date(c.createdAt).toISOString()}>{timeAgo(c.createdAt)}</time>
                </p>
                <p className="comment-body">{c.body}</p>
              </div>
              {c.canDelete && (
                <button type="button" className="comment-del" aria-label={`${c.nickname} 님 댓글 지우기`} onClick={() => remove(c.id)}>
                  지우기
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <form className="comment-form" onSubmit={send}>
        <input
          type="text"
          value={text}
          maxLength={COMMENT_MAX}
          placeholder="응원 한마디"
          aria-label="댓글 쓰기"
          onChange={(e) => setText(e.target.value)}
        />
        <span className="comment-count" aria-live="polite">{`${text.length}/${COMMENT_MAX}`}</span>
        <button type="submit" className="comment-send" disabled={!body || busy}>
          보내기
        </button>
      </form>
    </section>
  );
}
