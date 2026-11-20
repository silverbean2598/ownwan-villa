import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { VillaPicks, AddToVillas } from "../components/VillaPicks";
import { loadMyVillas, pickVilla, villaPath } from "../villa/current";
import type { MyVilla } from "../../shared/villa";
import { compressImage, ImageDecodeError } from "../image/compress";
import { dhashFromBlob } from "../image/dhash";
import { pokeEvents } from "../events/poke";
import { ShareButton } from "../share/ShareButton";

type Item = { name: string; status: "working" | "done" | "error"; message: string; code?: number };
type PhotoResult = { certId: string; points: number; duplicate: boolean; certifiedToday: boolean };

const GENERIC = "문제가 생겼어요. 잠시 후 다시 해 주세요";

function photoMessage(r: PhotoResult) {
  if (r.duplicate) return "전에 올린 사진과 같아요. 새 사진을 올려 주세요";
  if (r.points === 0) return "올렸어요. 오늘 받을 수 있는 사진 포인트는 다 받았어요";
  // "불이 켜졌어요" 는 첫 인증 토스트(EventCenter)가 보여 준다. 여기서는 사진마다 결과만
  return `올렸어요 +${r.points}P`;
}

async function uploadOne(file: File, villaIds: string[] | null): Promise<Pick<Item, "status" | "message" | "code">> {
  try {
    const blob = await compressImage(file);
    const dhash = await dhashFromBlob(blob);
    const fd = new FormData();
    fd.set("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
    fd.set("dhash", dhash);
    // 고른 빌라에만 올린다 (빌라 목록을 못 불러왔으면 보내지 않는다 → 서버가 사는 빌라 모두에 올린다)
    if (villaIds) fd.set("villaIds", JSON.stringify(villaIds));
    const res = await fetch("/api/certs/photo", { method: "POST", body: fd });
    const data = (await res.json().catch(() => null)) as (PhotoResult & { error?: string }) | null;
    if (res.status === 401) throw new ApiError(401, "");
    if (!res.ok || !data) return { status: "error", message: data?.error ?? GENERIC, code: res.status };
    return { status: data.duplicate ? "error" : "done", message: photoMessage(data) };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof ImageDecodeError) return { status: "error", message: "이 사진은 열 수 없어요. 다른 사진을 골라 주세요" };
    return { status: "error", message: GENERIC };
  }
}

export function Certify() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const from = params.get("villa");
  const [items, setItems] = useState<Item[]>([]);
  const [routine, setRoutine] = useState("");
  const [routineMsg, setRoutineMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // 내가 사는 빌라와 올릴 빌라. null = 아직 못 불러옴
  const [villas, setVillas] = useState<MyVilla[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

  const toLogin = () => nav("/login?next=/certify", { replace: true });

  const reloadVillas = useCallback(async () => {
    const list = await loadMyVillas();
    setVillas(list);
    return list;
  }, []);

  useEffect(() => {
    api("/api/me").catch((e) => {
      if (e instanceof ApiError && e.status === 401) toLogin();
    });
    // 처음에는 사는 빌라 모두에 체크
    reloadVillas().then((list) => setPicked(list.map((v) => v.id)), () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 고른 빌라가 바뀌었을 수 있을 때(그 사이 나갔거나 내보내짐 → 400 · 403 · 409): 목록을 다시 받고 남은 빌라만 체크로 둔다 */
  async function refreshPicks() {
    const list = await reloadVillas().catch(() => null);
    if (!list) return;
    setPicked((p) => {
      const kept = p.filter((id) => list.some((v) => v.id === id));
      return kept.length ? kept : list.map((v) => v.id);
    });
  }
  const pickStale = (code?: number) => code === 400 || code === 403 || code === 409;

  /** 올릴 빌라 id. 빌라 목록을 못 불러왔으면 null (서버가 사는 빌라 모두에 올린다) */
  const targets = villas ? villas.filter((v) => picked.includes(v.id)).map((v) => v.id) : null;
  const noPick = !!villas && villas.length > 0 && targets!.length === 0;

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0 || noPick) return;
    const list = Array.from(files);
    const base = items.length;
    setItems((prev) => [...prev, ...list.map((f) => ({ name: f.name, status: "working" as const, message: "올리는 중이에요" }))]);
    setBusy(true);
    try {
      // 순서대로 올려야 1번째 사진부터 포인트가 매겨진다
      for (let i = 0; i < list.length; i++) {
        const r = await uploadOne(list[i], targets);
        setItems((prev) => prev.map((it, j) => (j === base + i ? { ...it, ...r } : it)));
        if (r.status === "done") pokeEvents();
        // 고른 빌라가 더는 내 빌라가 아니면 남은 사진은 올리지 않고 다시 고르게 한다
        if (r.status === "error" && (r.code === 403 || r.code === 409)) {
          await refreshPicks();
          setItems((prev) => prev.map((it, j) => (j > base + i && it.status === "working" ? { ...it, status: "error", message: "빌라를 다시 골라 올려 주세요" } : it)));
          return;
        }
      }
      await reloadVillas().catch(() => {});
    } catch {
      toLogin();
    } finally {
      setBusy(false);
    }
  }

  async function submitRoutine(e: FormEvent) {
    e.preventDefault();
    const body = routine.trim();
    if (!body || noPick) return;
    setBusy(true);
    try {
      const r = await api<{ points: number }>("/api/certs/routine", {
        method: "POST",
        body: JSON.stringify({ body, ...(targets ? { villaIds: targets } : {}) }),
      });
      setRoutine("");
      setRoutineMsg({ text: r.points > 0 ? `루틴을 올렸어요. +${r.points}P` : "루틴을 올렸어요", error: false });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return toLogin();
      setRoutineMsg({ text: e instanceof ApiError ? e.message : GENERIC, error: true });
      if (e instanceof ApiError && pickStale(e.status)) await refreshPicks();
    } finally {
      setBusy(false);
    }
  }

  const back = villas?.length ? villaPath(pickVilla(villas, from)!) : "/villa";
  // 인증에 성공했으면(사진을 올렸거나 루틴을 올림) 오늘 인증 카드를 이미지로 남기게 한다. 층 · 이름은 이 화면을 연 빌라(올린 빌라 중)
  const certified = items.some((it) => it.status === "done") || (!!routineMsg && !routineMsg.error);
  const shareVilla = from && (!targets || targets.includes(from)) ? from : (targets?.[0] ?? from);

  return (
    <main className="page">
      <h1>오늘 오운완 인증하기</h1>
      {villas && <VillaPicks villas={villas} picked={picked} onChange={setPicked} disabled={busy} />}
      <div className="field">
        <label htmlFor="photos">사진</label>
        <input
          id="photos"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/heic,image/*"
          disabled={busy || noPick}
          onChange={(e) => {
            void onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {items.map((it, i) => (
          <li key={i} role={it.status === "error" ? "alert" : "status"}>
            <span className="muted">{it.name}</span>
            <p className={it.status === "error" ? "error" : undefined}>{it.message}</p>
          </li>
        ))}
      </ul>
      {villas && (
        <AddToVillas
          villas={villas}
          focusId={from}
          onAdded={async () => {
            await reloadVillas().catch(() => {});
            pokeEvents();
          }}
          onAuthLost={toLogin}
        />
      )}
      {certified && (
        <section className="share-cta" aria-label="오늘 인증 카드">
          <p>
            <b>오늘 오운완!</b> 인증 카드를 이미지로 남겨 보세요
          </p>
          <ShareButton card={{ kind: "cert", villaId: shareVilla }} />
        </section>
      )}
      <form onSubmit={submitRoutine}>
        <div className="field">
          <label htmlFor="routine">오늘 루틴</label>
          <textarea id="routine" rows={4} maxLength={1000} value={routine} onChange={(e) => setRoutine(e.target.value)} />
          <p className="muted">루틴을 적으면 +10P</p>
        </div>
        {routineMsg && (
          <p className={routineMsg.error ? "error" : undefined} role={routineMsg.error ? "alert" : "status"}>
            {routineMsg.text}
          </p>
        )}
        <button className="btn" type="submit" disabled={busy || noPick || !routine.trim()}>루틴 올리기</button>
      </form>
      <p style={{ marginTop: 20 }}>
        <Link to={back}>빌라로 돌아가기</Link>
      </p>
    </main>
  );
}
