import { useEffect, useState } from "react";
import { api, ApiError } from "../../api";
import { KAKAO_NOTICE, KakaoSymbol, kakaoStartHref } from "./KakaoButton";
import "./kakao.css";

export type KakaoStatus = { configured: boolean; linked: boolean; hasPassword: boolean };

/**
 * 설정 → 카카오 연결. 세 가지 상태:
 * 1) 연결 안 됨: [카카오 연결하기]
 * 2) 연결됨(비밀번호도 있음): [연결 해제]
 * 3) 카카오로만 가입: 해제 버튼 없이 설명만
 */
export function KakaoSection({ status, notice, onChanged }: { status: KakaoStatus; notice?: string | null; onChanged: (s: KakaoStatus) => void }) {
  const [note, setNote] = useState<{ ok?: string; err?: string }>(notice ? KAKAO_NOTICE[notice] ?? {} : {});
  const [busy, setBusy] = useState(false);

  // 카카오에서 돌아오면 (/settings?kakao=..#kakao) 이 칸으로 내려온다
  useEffect(() => {
    if (location.hash === "#kakao") document.getElementById("kakao")?.scrollIntoView();
  }, []);

  async function unlink() {
    setBusy(true);
    setNote({});
    try {
      await api("/api/auth/kakao/link", { method: "DELETE" });
      onChanged({ ...status, linked: false });
      setNote({ ok: "카카오 연결을 해제했어요. 이제 아이디와 비밀번호로 로그인해 주세요" });
    } catch (e) {
      setNote({ err: e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요" });
    } finally {
      setBusy(false);
    }
  }

  const state = !status.hasPassword ? "kakao-only" : status.linked ? "linked" : "unlinked";
  return (
    <section className="settings-section" id="kakao" data-kakao-state={state}>
      <h2>카카오 연결</h2>
      {state === "kakao-only" && (
        <p className="muted small">
          카카오로 가입한 계정이라 카카오로 로그인해요. 비밀번호와 복구 코드는 따로 없고, 카카오로 다시 로그인하면 계정을 되찾을 수 있어요.
          연결은 해제할 수 없어요.
        </p>
      )}
      {state === "linked" && (
        <>
          <p className="muted small">카카오가 연결돼 있어요. 아이디 · 비밀번호와 카카오 둘 다로 로그인할 수 있어요.</p>
          <button className="btn ghost" type="button" disabled={busy} onClick={unlink}>연결 해제</button>
        </>
      )}
      {state === "unlinked" && (
        <>
          <p className="muted small">연결하면 다음부터 카카오로 바로 로그인할 수 있어요. 카카오에서는 회원번호만 받아요.</p>
          {status.configured ? (
            <a className="btn kakao" href={kakaoStartHref("link")}><KakaoSymbol />카카오 연결하기</a>
          ) : (
            <p className="muted small">카카오 로그인을 준비 중이에요.</p>
          )}
        </>
      )}
      {note.ok && <p className="ok" role="status">{note.ok}</p>}
      {note.err && <p className="error" role="alert">{note.err}</p>}
    </section>
  );
}
