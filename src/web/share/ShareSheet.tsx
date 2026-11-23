import { useEffect, useRef, useState } from "react";
import { createMaker, type ShareCard, type ShareImage } from "./make";
import { isIOS, saveImage, shareImage } from "./deliver";
import "./share.css";

const TITLE: Record<ShareCard["kind"], string> = { cert: "오늘 인증 카드", room: "내 방", villa: "우리 아파트 전체" };
const ALT: Record<ShareCard["kind"], string> = {
  cert: "오늘 오운완 인증 카드 미리보기",
  room: "내 방 이미지 미리보기",
  villa: "우리 아파트 전체 이미지 미리보기",
};
// 만드는 동안 자리 잡기용 비율 (가로 / 세로)
const RATIO: Record<ShareCard["kind"], string> = { cert: "9 / 16", room: "1 / 1", villa: "3 / 5" };

type Props = { card: ShareCard; onClose: () => void; /** 시험용: 이미지 만들기 함수 */ make?: ReturnType<typeof createMaker> };

/** 미리보기 창: 이미지를 만들어 보여 주고 [이미지 저장] · [공유하기]. 인증 카드는 "내 인증 사진 넣기"(처음에는 꺼짐) */
export default function ShareSheet({ card, onClose, make }: Props) {
  // 연 때의 내용으로 한 번만 만든다 (부모가 다시 그려져도 다시 만들지 않게)
  const [maker] = useState(() => make ?? createMaker(card));
  const [photo, setPhoto] = useState(false);
  const [img, setImg] = useState<(ShareImage & { url: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [longpress, setLongpress] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let alive = true;
    let url = "";
    setLoading(true);
    setError("");
    setNotice("");
    maker({ photo })
      .then((r) => {
        if (!alive) return;
        url = URL.createObjectURL(r.blob);
        setImg({ ...r, url });
      })
      .catch(() => alive && setError("이미지를 만들지 못했어요. 잠시 후 다시 해 주세요"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [maker, photo]);

  function onSave() {
    if (!img) return;
    const r = saveImage(img.blob, img.filename);
    if (r === "longpress") setLongpress(true);
    else setNotice("이미지를 저장했어요");
  }

  async function onShare() {
    if (!img) return;
    const r = await shareImage(img.blob, img.filename);
    if (r === "shared") setNotice("공유했어요");
    else if (r === "downloaded") setNotice("이 기기에서는 바로 공유가 안 돼서 이미지를 저장했어요");
    else if (r === "longpress") setLongpress(true);
  }

  const ios = isIOS();
  return (
    <div className="share-backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-title">
        <div className="share-head">
          <h2 id="share-title">{TITLE[card.kind]} 이미지</h2>
          <button ref={closeRef} type="button" className="share-close" onClick={onClose}>닫기</button>
        </div>
        <div className={`share-preview k-${card.kind}`} aria-busy={loading}>
          {img && <img src={img.url} alt={ALT[card.kind]} className={loading ? "dim" : undefined} />}
          {!img && !error && <div className="share-ph" style={{ aspectRatio: RATIO[card.kind] }} />}
          {loading && (
            <p className="share-loading" role="status">
              <span className="share-spin" aria-hidden="true" />
              이미지를 만들고 있어요
            </p>
          )}
          {error && <p className="error share-error" role="alert">{error}</p>}
        </div>
        {card.kind === "cert" && (
          <label className="share-toggle">
            <input type="checkbox" role="switch" checked={photo} disabled={loading} onChange={(e) => setPhoto(e.target.checked)} />
            <span>
              <b>내 인증 사진 넣기</b>
              <small>{img?.photoMissing && photo ? "오늘 올린 내 사진이 없어서 캐릭터만 넣었어요" : "오늘 올린 내 사진만 들어가요"}</small>
            </span>
          </label>
        )}
        {longpress && (
          <p className="share-hint" role="status">
            위 이미지를 <b>길게 눌러</b> 저장하세요
          </p>
        )}
        <div className="share-actions">
          <button type="button" className="btn ghost" disabled={!img || loading} onClick={onSave}>
            이미지 저장
          </button>
          <button type="button" className="btn" disabled={!img || loading} onClick={() => void onShare()}>
            공유하기
          </button>
        </div>
        {notice && <p className="share-notice" role="status">{notice}</p>}
        {!ios && !longpress && <p className="share-foot muted">인스타그램 스토리 · 카카오톡으로 보낼 수 있어요</p>}
      </div>
    </div>
  );
}
