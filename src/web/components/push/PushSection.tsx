import { useEffect, useState } from "react";
import { api, ApiError } from "../../api";
import {
  currentSubscription, detectPushEnv, disablePush, enablePush, pushState, syncSubscription,
  type PushCategory, type PushPrefs, type PushState,
} from "../../push/client";
import "./push.css";

export const PREF_ROWS: { key: PushCategory; label: string; desc: string }[] = [
  { key: "cheer", label: "응원 · 댓글", desc: "내 기록에 응원이나 댓글이 달리면" },
  { key: "villa", label: "빌라 소식", desc: "새 이웃 입주 · 층 오름 · 펜트하우스 · 축하" },
  { key: "apply", label: "입주 신청 · 대결", desc: "입주 신청 · 승인 · 집값 대결 신청과 결과" },
  { key: "reminder", label: "운동 알림", desc: "밤 9시까지 인증하지 않았으면 한 번" },
];

export const DEFAULT_PREFS: PushPrefs = { cheer: true, villa: true, apply: true, reminder: true };

type Note = { ok?: string; err?: string };
type ViewProps = {
  state: PushState;
  prefs: PushPrefs;
  busy?: boolean;
  note?: Note;
  onEnable?: () => void;
  onDisable?: () => void;
  onToggle?: (key: PushCategory, value: boolean) => void;
  onTest?: () => void;
};

/** 아이폰: 홈 화면에 추가하는 방법 */
export function IosGuide() {
  return (
    <div className="push-guide" role="note" aria-label="아이폰 알림 켜는 방법">
      <p className="push-guide-title">아이폰은 홈 화면에 추가한 뒤 켤 수 있어요</p>
      <ol>
        <li>사파리 아래쪽 <b>공유 버튼</b>(네모에 위쪽 화살표)을 눌러요</li>
        <li><b>홈 화면에 추가</b>를 골라요</li>
        <li>홈 화면에 생긴 <b>오운완빌라</b>로 열고, 설정 → 휴대폰 알림에서 켜요</li>
      </ol>
      <p className="muted small">
        iOS 16.4 이상에서 돼요. <a href="#install">앱처럼 쓰기 안내 보기</a>
      </p>
    </div>
  );
}

/** 화면만 (상태는 밖에서 받는다. 테스트 · 미리 보기용) */
export function PushSectionView({ state, prefs, busy, note, onEnable, onDisable, onToggle, onTest }: ViewProps) {
  return (
    <section className="settings-section" id="push" data-push-state={state}>
      <h2>휴대폰 알림</h2>
      {state === "loading" && <p className="muted small">확인하는 중이에요</p>}
      {state === "preparing" && <p className="muted small">알림 준비 중이에요. 조금만 기다려 주세요.</p>}
      {state === "ios-guide" && <IosGuide />}
      {state === "unsupported" && (
        <p className="muted small">
          이 브라우저에서는 휴대폰 알림을 받을 수 없어요. 안드로이드는 크롬에서, 아이폰은 사파리에서 홈 화면에 추가한 뒤 열어 주세요.
        </p>
      )}
      {state === "denied" && (
        <p className="muted small">
          알림이 꺼져 있어요(차단됨). 휴대폰 설정 → 알림, 또는 브라우저의 사이트 설정에서 오운완빌라 알림을 허용한 뒤 다시 와 주세요.
        </p>
      )}
      {state === "off" && (
        <>
          <p className="muted small">응원 · 댓글, 빌라 소식, 저녁 운동 알림을 휴대폰으로 받아요. 밤 11시부터 아침 8시까지는 보내지 않아요.</p>
          <button className="btn" type="button" disabled={busy} onClick={onEnable}>이 기기에서 알림 켜기</button>
        </>
      )}
      {state === "on" && (
        <>
          <div className="push-on">
            <span>이 기기에서 알림을 받고 있어요</span>
            <button className="btn ghost small" type="button" disabled={busy} onClick={onDisable}>끄기</button>
          </div>
          <ul className="push-prefs" aria-label="받을 알림">
            {PREF_ROWS.map((r) => (
              <li key={r.key}>
                <label className="switch-row">
                  <span>
                    <b>{r.label}</b>
                    <span className="muted small">{r.desc}</span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    className={`switch${prefs[r.key] ? " on" : ""}`}
                    aria-checked={prefs[r.key]}
                    aria-label={r.label}
                    disabled={busy}
                    onClick={() => onToggle?.(r.key, !prefs[r.key])}
                  >
                    <span className="knob" />
                  </button>
                </label>
              </li>
            ))}
          </ul>
          <p className="muted small">밤 11시부터 아침 8시까지는 보내지 않고, 앱 안 알림으로만 남겨요.</p>
          <button className="btn ghost small" type="button" disabled={busy} onClick={onTest}>시험 알림 보내기</button>
        </>
      )}
      {note?.ok && <p className="ok" role="status">{note.ok}</p>}
      {note?.err && <p className="error" role="alert">{note.err}</p>}
    </section>
  );
}

const msg = (e: unknown) => (e instanceof ApiError ? e.message : "문제가 생겼어요. 잠시 후 다시 해 주세요");

/** 설정 → 휴대폰 알림. 서버 키 · 이 기기 지원 여부 · 권한 · 구독을 보고 상태를 정한다 */
export function PushSection({ onAuthLost }: { onAuthLost?: () => void }) {
  const [state, setState] = useState<PushState>("loading");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<Note>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      let key: string | null = null;
      try {
        key = (await api<{ publicKey: string | null }>("/api/push/key")).publicKey ?? null;
      } catch {
        key = null;
      }
      const env = detectPushEnv();
      let sub: PushSubscription | null = null;
      if (key && env.supported) sub = await currentSubscription().catch(() => null);
      const s = pushState(env, key, !!sub);
      if (s === "on" && sub) {
        // 서버에도 지금 계정으로 있게 (실패해도 화면은 그대로)
        void syncSubscription(sub).catch(() => {});
        try {
          const r = await api<{ prefs: PushPrefs }>("/api/push/prefs");
          if (alive) setPrefs({ ...DEFAULT_PREFS, ...r.prefs });
        } catch {
          // 기본값(모두 켜짐)으로 보여 준다
        }
      }
      if (!alive) return;
      setPublicKey(key);
      setState(s);
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function guard(fn: () => Promise<void>) {
    setBusy(true);
    setNote({});
    try {
      await fn();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return onAuthLost?.();
      setNote({ err: msg(e) });
    } finally {
      setBusy(false);
    }
  }

  const onEnable = () =>
    guard(async () => {
      if (!publicKey) return;
      const r = await enablePush(publicKey);
      if (r === "denied") return setState("denied");
      if (r === "dismissed") return setNote({ err: "알림을 허용해야 받을 수 있어요" });
      const p = await api<{ prefs: PushPrefs }>("/api/push/prefs").catch(() => ({ prefs: DEFAULT_PREFS }));
      setPrefs({ ...DEFAULT_PREFS, ...p.prefs });
      setState("on");
      setNote({ ok: "알림을 켰어요" });
    });

  const onDisable = () =>
    guard(async () => {
      await disablePush();
      setState("off");
      setNote({ ok: "이 기기에서 알림을 껐어요" });
    });

  const onToggle = (key: PushCategory, value: boolean) =>
    guard(async () => {
      const r = await api<{ prefs: PushPrefs }>("/api/push/prefs", { method: "PUT", body: JSON.stringify({ [key]: value }) });
      setPrefs({ ...DEFAULT_PREFS, ...r.prefs });
    });

  const onTest = () =>
    guard(async () => {
      await api("/api/push/test", { method: "POST" });
      setNote({ ok: "시험 알림을 보냈어요. 잠시 뒤 휴대폰을 확인해 주세요" });
    });

  return <PushSectionView state={state} prefs={prefs} busy={busy} note={note} onEnable={onEnable} onDisable={onDisable} onToggle={onToggle} onTest={onTest} />;
}
