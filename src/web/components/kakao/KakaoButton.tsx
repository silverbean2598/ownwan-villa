import "./kakao.css";

/** 카카오 말풍선 심볼 */
export function KakaoSymbol() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#000"
        d="M9 1.5C4.58 1.5 1 4.3 1 7.75c0 2.22 1.48 4.17 3.72 5.28l-.95 3.45c-.08.3.26.54.52.37l4.1-2.72c.2.02.4.03.61.03 4.42 0 8-2.8 8-6.25S13.42 1.5 9 1.5z"
      />
    </svg>
  );
}

/** 카카오 로그인 시작 링크 (서버가 카카오로 보내 준다). next 는 로그인 뒤 갈 같은 사이트 경로 */
export function kakaoStartHref(mode: "login" | "link", next?: string | null) {
  const q = new URLSearchParams({ mode });
  if (next) q.set("next", next);
  return `/api/auth/kakao/start?${q}`;
}

export function KakaoButton({ next, label = "카카오로 시작하기" }: { next?: string | null; label?: string }) {
  return (
    <a className="btn kakao" href={kakaoStartHref("login", next)}>
      <KakaoSymbol />
      {label}
    </a>
  );
}

/** 카카오에서 돌아올 때 붙는 ?kakao= 코드 → 안내 문구 */
export const KAKAO_NOTICE: Record<string, { ok?: string; err?: string }> = {
  unconfigured: { err: "카카오 로그인을 준비 중이에요. 조금만 기다려 주세요" },
  state: { err: "확인 시간이 지났어요. 카카오로 다시 시작해 주세요" },
  cancelled: { err: "카카오 로그인을 취소했어요" },
  failed: { err: "카카오에서 정보를 받지 못했어요. 잠시 후 다시 해 주세요" },
  busy: { err: "지금 카카오 로그인이 몰려 있어요. 잠시 후 다시 해 주세요" },
  link_mismatch: { err: "다른 계정으로 로그인되어 있어요. 다시 시도해 주세요" },
  linked: { ok: "카카오를 연결했어요. 이제 카카오로도 로그인할 수 있어요" },
  linked_other: { err: "이 카카오 계정은 다른 오운완아파트 계정에 연결돼 있어요" },
  already_has: { err: "이미 다른 카카오 계정이 연결돼 있어요. 연결을 해제한 뒤 다시 해 주세요" },
};
