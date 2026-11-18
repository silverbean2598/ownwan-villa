import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { compressImage, ImageDecodeError } from "../image/compress";
import { dhashFromBlob } from "../image/dhash";
import { pokeEvents } from "../events/poke";

type Item = { name: string; status: "working" | "done" | "error"; message: string };
type PhotoResult = { certId: string; points: number; duplicate: boolean; certifiedToday: boolean };

const GENERIC = "문제가 생겼어요. 잠시 후 다시 해 주세요";

function photoMessage(r: PhotoResult) {
  if (r.duplicate) return "전에 올린 사진과 같아요. 새 사진을 올려 주세요";
  if (r.points === 0) return "올렸어요. 오늘 받을 수 있는 사진 포인트는 다 받았어요";
  // "불이 켜졌어요" 는 첫 인증 토스트(EventCenter)가 보여 준다. 여기서는 사진마다 결과만
  return `올렸어요 +${r.points}P`;
}

async function uploadOne(file: File): Promise<Pick<Item, "status" | "message">> {
  try {
    const blob = await compressImage(file);
    const dhash = await dhashFromBlob(blob);
    const fd = new FormData();
    fd.set("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
    fd.set("dhash", dhash);
    const res = await fetch("/api/certs/photo", { method: "POST", body: fd });
    const data = (await res.json().catch(() => null)) as (PhotoResult & { error?: string }) | null;
    if (res.status === 401) throw new ApiError(401, "");
    if (!res.ok || !data) return { status: "error", message: data?.error ?? GENERIC };
    return { status: data.duplicate ? "error" : "done", message: photoMessage(data) };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (e instanceof ImageDecodeError) return { status: "error", message: "이 사진은 열 수 없어요. 다른 사진을 골라 주세요" };
    return { status: "error", message: GENERIC };
  }
}

export function Certify() {
  const nav = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [routine, setRoutine] = useState("");
  const [routineMsg, setRoutineMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const toLogin = () => nav("/login?next=/certify", { replace: true });

  useEffect(() => {
    api("/api/me").catch((e) => {
      if (e instanceof ApiError && e.status === 401) toLogin();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    const base = items.length;
    setItems((prev) => [...prev, ...list.map((f) => ({ name: f.name, status: "working" as const, message: "올리는 중이에요" }))]);
    setBusy(true);
    try {
      // 순서대로 올려야 1번째 사진부터 포인트가 매겨진다
      for (let i = 0; i < list.length; i++) {
        const r = await uploadOne(list[i]);
        setItems((prev) => prev.map((it, j) => (j === base + i ? { ...it, ...r } : it)));
        if (r.status === "done") pokeEvents();
      }
    } catch {
      toLogin();
    } finally {
      setBusy(false);
    }
  }

  async function submitRoutine(e: FormEvent) {
    e.preventDefault();
    const body = routine.trim();
    if (!body) return;
    setBusy(true);
    try {
      const r = await api<{ points: number }>("/api/certs/routine", { method: "POST", body: JSON.stringify({ body }) });
      setRoutine("");
      setRoutineMsg({ text: r.points > 0 ? `루틴을 올렸어요. +${r.points}P` : "루틴을 올렸어요", error: false });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return toLogin();
      setRoutineMsg({ text: e instanceof ApiError ? e.message : GENERIC, error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <h1>오늘 오운완 인증하기</h1>
      <div className="field">
        <label htmlFor="photos">사진</label>
        <input
          id="photos"
          type="file"
          multiple
          accept="image/jpeg,image/png,image/heic,image/*"
          disabled={busy}
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
        <button className="btn" type="submit" disabled={busy || !routine.trim()}>루틴 올리기</button>
      </form>
      <p style={{ marginTop: 20 }}>
        <Link to="/villa">빌라로 돌아가기</Link>
      </p>
    </main>
  );
}
