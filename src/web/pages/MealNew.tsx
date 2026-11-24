import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { loadMyVillas, pickVilla } from "../villa/current";
import type { MyVilla } from "../../shared/villa";
import { compressImage, ImageDecodeError } from "../image/compress";
import { dhashFromBlob } from "../image/dhash";
import { defaultMealType, MEAL_LABEL, MEAL_MEMO_MAX, MEAL_TYPES, type MealType } from "../../shared/meals";
import { MEAL_DAILY_CAP, MEAL_POINTS } from "../../shared/rules/points";
import "../components/meals.css";

const GENERIC = "문제가 생겼어요. 잠시 후 다시 해 주세요";

type UploadResult = { mealId: string; points: number; duplicate: boolean; villaIds: string[] };

/** 올린 뒤 식당 화면에 보여 줄 한 줄 */
export function uploadNote(r: Pick<UploadResult, "points" | "duplicate">): string {
  if (r.duplicate) return "올렸어요. 전에 올린 사진과 같아서 포인트는 없어요";
  if (r.points === 0) return "올렸어요. 오늘 받을 수 있는 식단 포인트는 다 받았어요";
  return `올렸어요 +${r.points}P`;
}

function previewUrl(blob: Blob): string | null {
  try {
    return typeof URL.createObjectURL === "function" ? URL.createObjectURL(blob) : null;
  } catch {
    return null;
  }
}

/**
 * 식단 올리기(/meals/new) · 고치기(/meals/:id/edit) [확정 — 기획자 결정, 2026-11-24]
 * 끼니(지금 시각으로 기본값) · 사진 1장(필수) · 메모 한 줄(40자, 선택) · 올릴 아파트(기본 모두, 1곳이면 숨김).
 * 고치기에서는 끼니 · 사진 · 메모만 바꾼다(올린 아파트는 그대로).
 */
export function MealNew() {
  const nav = useNavigate();
  const { id: editId } = useParams();
  const [params] = useSearchParams();
  const editing = !!editId;
  const [mealType, setMealType] = useState<MealType>(() => defaultMealType(Date.now()));
  const [memo, setMemo] = useState("");
  const [photo, setPhoto] = useState<{ blob: Blob; dhash: string; url: string | null } | null>(null);
  const [current, setCurrent] = useState<{ photoUrl: string; day: string } | null>(null);
  const [villas, setVillas] = useState<MyVilla[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [err, setErr] = useState("");
  /** 오늘 식단으로 더 받을 수 있는 포인트 (못 불러오면 null → 안내만) */
  const [pointsLeft, setPointsLeft] = useState<number | null>(null);

  const toLogin = () => nav(`/login?next=${encodeURIComponent(editing ? `/meals/${editId}/edit` : "/meals/new")}`, { replace: true });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (editing) {
          const m = await api<{ mealType: MealType; memo: string | null; photoUrl: string; day: string; mine: boolean }>(`/api/meals/${editId}`);
          if (!alive) return;
          if (!m.mine) return setErr("내가 올린 식단만 고칠 수 있어요");
          setMealType(m.mealType);
          setMemo(m.memo ?? "");
          setCurrent({ photoUrl: m.photoUrl, day: m.day });
        } else {
          const list = await loadMyVillas();
          if (!alive) return;
          setVillas(list);
          setPicked(list.map((v) => v.id));
          if (list.length) {
            const r = await api<{ pointsLeftToday?: number }>(`/api/meals?villa=${encodeURIComponent(list[0].id)}`).catch(() => null);
            if (alive && typeof r?.pointsLeftToday === "number") setPointsLeft(r.pointsLeftToday);
          }
        }
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return toLogin();
        if (alive) setErr(e instanceof ApiError ? e.message : GENERIC);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setErr("");
    setPreparing(true);
    try {
      const blob = await compressImage(file);
      const dhash = await dhashFromBlob(blob);
      if (photo?.url) URL.revokeObjectURL(photo.url);
      setPhoto({ blob, dhash, url: previewUrl(blob) });
    } catch (e) {
      setErr(e instanceof ImageDecodeError ? "이 사진은 열 수 없어요. 다른 사진을 골라 주세요" : GENERIC);
    } finally {
      setPreparing(false);
    }
  }

  const noVilla = !editing && !!villas && villas.length === 0;
  const noPick = !editing && !!villas && villas.length > 0 && picked.length === 0;
  const canSubmit = !busy && !preparing && !noVilla && !noPick && (editing ? !!current : !!photo) && Array.from(memo.trim()).length <= MEAL_MEMO_MAX;
  const backVilla = villas ? pickVilla(villas, params.get("villa")) : params.get("villa");
  const back = editing ? `/meals${current ? `?day=${current.day}` : ""}` : `/meals${backVilla ? `?villa=${encodeURIComponent(backVilla)}` : ""}`;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErr("");
    const fd = new FormData();
    fd.set("mealType", mealType);
    fd.set("memo", memo.trim());
    if (photo) {
      fd.set("file", new File([photo.blob], "meal.jpg", { type: "image/jpeg" }));
      fd.set("dhash", photo.dhash);
    }
    if (!editing && villas) fd.set("villaIds", JSON.stringify(villas.filter((v) => picked.includes(v.id)).map((v) => v.id)));
    try {
      const res = await fetch(editing ? `/api/meals/${editId}` : "/api/meals", { method: editing ? "PATCH" : "POST", body: fd });
      const data = (await res.json().catch(() => null)) as (UploadResult & { error?: string }) | null;
      if (res.status === 401) return toLogin();
      if (!res.ok || !data) {
        setErr(data?.error ?? GENERIC);
        // 그 사이 아파트에서 나갔으면 목록을 다시 받는다
        if (!editing && (res.status === 403 || res.status === 409)) {
          const list = await loadMyVillas().catch(() => null);
          if (list) {
            setVillas(list);
            setPicked((p) => {
              const kept = p.filter((id) => list.some((v) => v.id === id));
              return kept.length ? kept : list.map((v) => v.id);
            });
          }
        }
        return;
      }
      nav(back, { state: { note: editing ? "식단을 고쳤어요" : uploadNote(data) } });
    } catch {
      setErr("인터넷 연결이 불안정해요. 연결을 확인하고 다시 해 주세요");
    } finally {
      setBusy(false);
    }
  }

  const shownPhoto = photo?.url ?? (photo ? null : current?.photoUrl ?? null);
  const memoLen = Array.from(memo).length;

  return (
    <main className="page meals-new">
      <Link className="meals-back" to={back}>← 식당으로</Link>
      <h1>{editing ? "식단 고치기" : "식단 올리기"}</h1>
      {!editing && <p className="meals-sub">{pointsSubtitle(pointsLeft)}</p>}
      {noVilla && <p className="muted">아파트에 입주하면 식단을 올릴 수 있어요.</p>}
      <form onSubmit={submit}>
        <p className="meal-field-label" id="meal-type-label">끼니</p>
        <div className="meal-chips" role="radiogroup" aria-labelledby="meal-type-label">
          {MEAL_TYPES.map((t) => (
            <button key={t} type="button" role="radio" className="meal-chip" aria-checked={mealType === t} onClick={() => setMealType(t)}>
              {MEAL_LABEL[t]}
            </button>
          ))}
        </div>
        <p className="meal-field-label">사진</p>
        <label className={`meal-drop${shownPhoto ? " has-photo" : ""}`} htmlFor="meal-photo">
          {shownPhoto ? (
            <img src={shownPhoto} alt="고른 사진" />
          ) : (
            <>
              <span className="meal-drop-cam" aria-hidden="true">📷</span>
              <span>{preparing ? "사진을 준비하는 중이에요" : photo ? "사진을 골랐어요" : "눌러서 사진 찍기 · 앨범에서 고르기"}</span>
            </>
          )}
          <input
            id="meal-photo"
            className="sr-only"
            type="file"
            accept="image/jpeg,image/png,image/heic,image/*"
            aria-label="사진"
            disabled={busy || preparing}
            onChange={(e) => {
              void onFile(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <label className="meal-field-label" htmlFor="meal-memo">
          메모 <span className="meal-optional">(선택)</span>
        </label>
        <div className="meal-memo-box">
          <input
            id="meal-memo"
            type="text"
            value={memo}
            maxLength={MEAL_MEMO_MAX}
            placeholder="예: 닭가슴살 샐러드"
            onChange={(e) => setMemo(e.target.value)}
          />
          <span className="meal-memo-count" aria-live="polite">{`${memoLen}/${MEAL_MEMO_MAX}`}</span>
        </div>
        {!editing && villas && villas.length > 1 && (
          <fieldset className="meal-villas" disabled={busy}>
            <legend className="meal-field-label">올릴 아파트</legend>
            {villas.map((v) => {
              const checked = picked.includes(v.id);
              return (
                <label key={v.id} className="meal-villa">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setPicked(checked ? picked.filter((x) => x !== v.id) : [...picked, v.id])}
                  />
                  <span>{v.name}</span>
                </label>
              );
            })}
            {noPick && <p className="error">올릴 아파트를 하나 이상 골라 주세요</p>}
          </fieldset>
        )}
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn meal-submit" type="submit" disabled={!canSubmit}>
          {busy ? (editing ? "고치는 중이에요" : "올리는 중이에요") : editing ? "고치기" : "올리기"}
        </button>
        {!editing && !photo && <p className="meal-submit-note">사진을 고르면 올릴 수 있어요</p>}
      </form>
    </main>
  );
}

/** 올리기 화면 부제: 하루 3개까지 5P씩, 오늘 남은 포인트 */
export function pointsSubtitle(left: number | null): string {
  const base = `하루 ${MEAL_DAILY_CAP / MEAL_POINTS}개까지 ${MEAL_POINTS}P씩 받아요`;
  if (left === null) return base;
  return left > 0 ? `${base} (오늘 남은 포인트 ${left}P)` : `${base} (오늘 포인트는 다 받았어요)`;
}
