import type { ReactNode } from "react";

export type BoardItemData = {
  id: string;
  kind: "photo" | "routine";
  day: string;
  hidden: boolean;
  createdAt: number;
  body?: string;
  photoUrl?: string;
};

export const ROOM_BOARD_LIMIT = 6;

/** id에서 -4~4도 사이의 고정된 기울기를 만든다(렌더마다 바뀌지 않게). */
export function tiltFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return (h % 9) - 4;
}

const md = (day: string) => {
  const [, m, d] = day.split("-").map(Number);
  return { m, d };
};

export function groupByDay(items: BoardItemData[]): { day: string; heading: string; items: BoardItemData[] }[] {
  const out: { day: string; heading: string; items: BoardItemData[] }[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.day === it.day) last.items.push(it);
    else {
      const { m, d } = md(it.day);
      out.push({ day: it.day, heading: `${m}월 ${d}일`, items: [it] });
    }
  }
  return out;
}

type ItemProps = { item: BoardItemData; renderPhotoActions?: (item: BoardItemData) => ReactNode };

export function BoardItem({ item, renderPhotoActions }: ItemProps) {
  const { m, d } = md(item.day);
  const style = { transform: `rotate(${tiltFor(item.id)}deg)` };
  const date = <span className="cap">{`${m}/${d}`}</span>;
  if (item.kind === "photo") {
    return (
      <figure className={`polaroid${item.hidden ? " hidden" : ""}`} style={style}>
        {item.hidden || !item.photoUrl ? (
          <div className="ph-hidden">가려진 사진</div>
        ) : (
          <img src={item.photoUrl} alt={`${m}월 ${d}일 오운완 인증 사진`} loading="lazy" />
        )}
        <figcaption>{date}</figcaption>
        {renderPhotoActions?.(item)}
      </figure>
    );
  }
  const text = item.body ?? "";
  return (
    <div className={`sticky${item.hidden ? " hidden" : ""}`} style={style}>
      {item.hidden ? <p>가려진 기록</p> : <p>{text.length > 60 ? text.slice(0, 60) + "…" : text}</p>}
      {date}
    </div>
  );
}

type Props = {
  items: BoardItemData[];
  limit?: number;
  renderPhotoActions?: (item: BoardItemData) => ReactNode;
};

/** 방 왼쪽 벽 게시판. 최근 limit개(기본 6)만 보여준다. */
export function Board({ items, limit = ROOM_BOARD_LIMIT, renderPhotoActions }: Props) {
  const shown = items.slice(0, limit);
  return (
    <div className="board">
      {shown.length === 0 ? (
        <p className="board-empty">아직 붙인 기록이 없어요</p>
      ) : (
        shown.map((it) => <BoardItem key={it.id} item={it} renderPhotoActions={renderPhotoActions} />)
      )}
    </div>
  );
}
