import { lazy, Suspense, useState } from "react";
import { createPortal } from "react-dom";
import type { ShareCard } from "./make";
import "./share.css";

// 그리는 코드는 눌렀을 때만 받는다 (첫 화면을 가볍게)
const ShareSheet = lazy(() => import("./ShareSheet"));

type Props = { card: ShareCard; label?: string; className?: string };

/** [이미지로 저장 · 공유하기] 버튼 → 미리보기 창 */
export function ShareButton({ card, label = "이미지로 저장 · 공유하기", className = "" }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn ghost share-open ${className}`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {label}
      </button>
      {/* 창은 body 에 붙인다 (버튼이 놓인 줄의 .btn 스타일이 창 안 버튼에 번지지 않게) */}
      {open &&
        createPortal(
        <Suspense
          fallback={
            <div className="share-backdrop">
              <div className="share-sheet" role="dialog" aria-modal="true" aria-label="이미지로 저장 · 공유하기">
                <p className="share-loading" role="status">준비하고 있어요</p>
              </div>
            </div>
          }
        >
          <ShareSheet card={card} onClose={() => setOpen(false)} />
        </Suspense>,
        document.body,
      )}
    </>
  );
}
