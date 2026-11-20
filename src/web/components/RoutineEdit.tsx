import { useState, type FormEvent } from "react";

export const ROUTINE_MAX = 1000;

type Props = {
  /** 지금 저장된 글. 이것과 같으면 저장할 게 없다 */
  original: string;
  /** 처음 보여 줄 글 (보통 original, 저장에 실패하면 고치던 글) */
  initial?: string;
  /** 저장에 실패했을 때 안내 */
  error?: string;
  onSave: (text: string) => void;
  onCancel: () => void;
};

/**
 * 루틴 수정 중 상태: 글 상자 + 글자 수(n/1000) + [취소] [저장].
 * 게시판 한 줄을 다 차지하도록 그린다(댓글 칸과 같은 자리). 저장은 앞뒤 공백을 뺀 글이 1~1000자일 때만 된다
 */
export function RoutineEditor({ original, initial = original, error, onSave, onCancel }: Props) {
  const [text, setText] = useState(initial);
  const body = text.trim();
  const changed = body !== original.trim();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (!body || body.length > ROUTINE_MAX) return;
    onSave(text);
  }
  return (
    <form className="routine-edit" aria-label="루틴 고치기" onSubmit={submit}>
      <label htmlFor="routine-edit-text">루틴 고치기</label>
      <textarea
        id="routine-edit-text"
        rows={4}
        maxLength={ROUTINE_MAX}
        value={text}
        autoFocus
        onChange={(e) => setText(e.target.value)}
      />
      <p className="routine-edit-count" aria-live="polite">
        {body.length}/{ROUTINE_MAX}
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="routine-edit-row">
        <button type="button" className="btn ghost" onClick={onCancel}>취소</button>
        <button type="submit" className="btn" disabled={!body || !changed}>저장</button>
      </div>
    </form>
  );
}
