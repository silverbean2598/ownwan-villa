import { useState } from "react";
import {
  CARD_STATES, isDismissed, kakaoExternalHref, rememberDismiss, useInstall,
  type InstallEnv, type InstallState, type InstallStore,
} from "../../install/install";
import "./install.css";

/** 사파리 공유 버튼 모양 (네모에 위쪽 화살표) */
export function ShareIcon() {
  return (
    <svg className="share-icon" width="16" height="18" viewBox="0 0 16 18" aria-hidden="true">
      <path d="M8 1.5v10M4.6 4.6 8 1.2l3.4 3.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.2 7.2H3.4c-.8 0-1.4.6-1.4 1.4v6.8c0 .8.6 1.4 1.4 1.4h9.2c.8 0 1.4-.6 1.4-1.4V8.6c0-.8-.6-1.4-1.4-1.4h-1.8" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

type BodyProps = {
  state: InstallState;
  env: InstallEnv;
  busy?: boolean;
  onInstall?: () => void;
  /** 카카오톡에서 바깥 브라우저로 열 주소 (기본: 지금 주소) */
  href?: string;
};

/** 상태마다 보여 줄 안내 · 버튼 (빌라 카드와 설정이 함께 쓴다) */
function InstallBody({ state, env, busy, onInstall, href }: BodyProps) {
  switch (state) {
    case "installed":
      return env.standalone ? (
        <p className="install-text">홈 화면 앱으로 쓰고 있어요. 주소창 없이 바로 열려요.</p>
      ) : (
        <p className="install-text">홈 화면에 추가했어요. 다음부터는 홈 화면의 <b>오운완빌라</b>로 열어 주세요.</p>
      );
    case "prompt":
      return (
        <>
          <p className="install-text">홈 화면에 추가하면 주소창 없이 앱처럼 바로 열려요.</p>
          <button type="button" className="btn install-btn" disabled={busy} onClick={onInstall}>홈 화면에 추가</button>
        </>
      );
    case "ios-guide":
      return (
        <p className="install-text install-steps">
          사파리 아래쪽 <span className="install-key"><ShareIcon />공유 버튼</span> → <span className="install-key">홈 화면에 추가</span>를 눌러요
        </p>
      );
    case "kakao":
      return (
        <>
          <p className="install-text">카카오톡 안에서는 홈 화면에 추가할 수 없어요. {env.ios ? "Safari" : "다른 브라우저"}로 열어서 추가해 주세요.</p>
          <a className="btn ghost install-btn" href={kakaoExternalHref(href ?? location.href)}>
            {env.ios ? "Safari로 열기" : "다른 브라우저로 열기"}
          </a>
        </>
      );
    case "inapp":
      return (
        <p className="install-text">
          이 앱 안에서는 홈 화면에 추가할 수 없어요. 오른쪽 위 메뉴(⋯)에서 <b>{env.ios ? "Safari로 열기" : "다른 브라우저로 열기"}</b>를 눌러 주세요.
        </p>
      );
    case "manual":
      return (
        <p className="install-text">
          브라우저 메뉴(⋮)에서 <b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 눌러 주세요. 안드로이드는 크롬, 아이폰은 사파리에서 가장 잘 돼요.
        </p>
      );
  }
}

/* ── 빌라 화면 카드 ── */

type CardViewProps = BodyProps & { onClose?: () => void };

/** 화면만 (테스트 · 미리 보기용) */
export function InstallCardView({ onClose, ...body }: CardViewProps) {
  return (
    <aside className="install-card" data-install-state={body.state} aria-label="앱처럼 쓰기">
      <img className="install-icon" src="/icon-192.png" alt="" width={40} height={40} />
      <div className="install-main">
        <p className="install-title">앱처럼 쓰기</p>
        <InstallBody {...body} />
      </div>
      <button type="button" className="install-close" aria-label="앱처럼 쓰기 안내 닫기" onClick={onClose}>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
    </aside>
  );
}

type Deps = { store?: InstallStore; env?: InstallEnv; now?: () => number; storage?: Pick<Storage, "getItem" | "setItem"> | null };

/** 빌라 화면 위쪽의 작은 카드. 닫으면 14일 동안 다시 보이지 않는다 */
export function InstallCard({ store, env, now = Date.now, storage }: Deps) {
  const { state, env: e, prompt } = useInstall(store, env);
  const [hidden, setHidden] = useState(() => isDismissed(now(), storage));
  const [busy, setBusy] = useState(false);
  if (hidden || !CARD_STATES.includes(state)) return null;

  const close = () => {
    rememberDismiss(now(), storage);
    setHidden(true);
  };
  const onInstall = async () => {
    setBusy(true);
    const r = await prompt();
    setBusy(false);
    // 설치 창을 닫았으면 한동안 다시 권하지 않는다 (설치했으면 상태가 installed 로 바뀌어 저절로 사라진다)
    if (r === "dismissed") close();
  };
  return <InstallCardView state={state} env={e} busy={busy} onInstall={onInstall} onClose={close} />;
}

/* ── 설정 → 앱처럼 쓰기 (늘 보인다) ── */

export const INSTALL_LABEL: Record<"ready" | "done" | "guide", string> = {
  ready: "설치 가능",
  done: "이미 설치됨",
  guide: "이 브라우저는 안내만",
};

export function installKind(state: InstallState): keyof typeof INSTALL_LABEL {
  return state === "installed" ? "done" : state === "prompt" ? "ready" : "guide";
}

export function InstallSectionView(props: BodyProps) {
  const kind = installKind(props.state);
  return (
    <section className="settings-section" id="install" data-install-state={props.state} data-install-kind={kind}>
      <h2 className="install-h2">
        앱처럼 쓰기 <span className={`install-pill ${kind}`}>{INSTALL_LABEL[kind]}</span>
      </h2>
      <InstallBody {...props} />
      {kind !== "done" && <p className="muted small install-foot">설치해도 저장 공간은 거의 쓰지 않고, 언제든 홈 화면에서 지울 수 있어요.</p>}
    </section>
  );
}

export function InstallSection({ store, env }: Pick<Deps, "store" | "env">) {
  const { state, env: e, prompt } = useInstall(store, env);
  const [busy, setBusy] = useState(false);
  const onInstall = async () => {
    setBusy(true);
    await prompt();
    setBusy(false);
  };
  return <InstallSectionView state={state} env={e} busy={busy} onInstall={onInstall} />;
}
