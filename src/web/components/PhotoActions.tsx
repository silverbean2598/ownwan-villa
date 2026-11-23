import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { api, ApiError } from "../api";
import type { BoardItemData } from "./Board";

type Pending = { id: string; action: "report" | "delete" };

const ASK = {
  report: "이 사진을 신고할까요? 3명이 신고하면 사진이 가려져요.",
  delete: "이 사진을 지울까요? 지운 사진은 되돌릴 수 없어요.",
} as const;
const DONE = { report: "신고했어요", delete: "지웠어요" } as const;

const stop = (e: MouseEvent) => {
  // 게시판이 링크 안에 있어도 메뉴 조작에서는 이동하지 않는다
  e.preventDefault();
  e.stopPropagation();
};

type Opts = {
  /** 게시판 주인(사진 작성자) */
  ownerId: string;
  meId: string;
  /** 내가 지금 아파트의 방장인지 */
  iAmVillaOwner: boolean;
  onDone: () => void;
};

/** 게시판 사진의 ⋯ 메뉴(신고·삭제)와 확인 창, 완료 안내. dialog를 페이지에 한 번 그려 준다. */
export function usePhotoActions({ ownerId, meId, iAmVillaOwner, onDone }: Opts) {
  const [menu, setMenu] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const mine = ownerId === meId;
  const canDelete = mine || iAmVillaOwner;

  const render = (item: BoardItemData): ReactNode => {
    // 가려진 사진은 신고할 수 없고, 지울 수 있는 사람에게만 메뉴를 보여 준다
    const canReport = !mine && !item.hidden;
    if (!canReport && !canDelete) return null;
    return (
    <div className="photo-menu">
      <button
        type="button"
        className="photo-menu-btn"
        aria-label="사진 메뉴"
        aria-expanded={menu === item.id}
        onClick={(e) => {
          stop(e);
          setMenu(menu === item.id ? null : item.id);
        }}
      >
        ⋯
      </button>
      {menu === item.id && (
        <div className="photo-menu-list" role="menu">
          {canReport && (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                stop(e);
                setMenu(null);
                setError("");
                setPending({ id: item.id, action: "report" });
              }}
            >
              신고하기
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                stop(e);
                setMenu(null);
                setError("");
                setPending({ id: item.id, action: "delete" });
              }}
            >
              삭제하기
            </button>
          )}
        </div>
      )}
    </div>
    );
  };

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    setError("");
    try {
      if (pending.action === "report") await api(`/api/certs/${pending.id}/report`, { method: "POST" });
      else await api(`/api/certs/${pending.id}`, { method: "DELETE" });
      setToast(DONE[pending.action]);
      setPending(null);
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");
    } finally {
      setBusy(false);
    }
  }

  const dialog = (
    <>
      {pending && (
        <section className="confirm" role="dialog" aria-label={pending.action === "report" ? "신고하기" : "삭제하기"}>
          <p>{ASK[pending.action]}</p>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="confirm-row">
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setPending(null)}>취소</button>
            <button type="button" className="btn primary" disabled={busy} onClick={confirm}>
              {pending.action === "report" ? "신고하기" : "삭제하기"}
            </button>
          </div>
        </section>
      )}
      {toast && <div className="action-toast" role="status">{toast}</div>}
    </>
  );

  return { render, dialog };
}
