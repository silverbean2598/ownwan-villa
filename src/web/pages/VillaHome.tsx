import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

// 임시 화면: 종목이 없으면 온보딩으로 보낸다 (빌라 화면은 이후 태스크에서 구현)
export function VillaHome() {
  const nav = useNavigate();
  useEffect(() => {
    api<{ sport: string | null }>("/api/me")
      .then((me) => {
        if (!me.sport) nav("/onboard", { replace: true });
      })
      .catch(() => {});
  }, [nav]);
  return <main className="page"><p className="muted">빌라 화면 준비 중</p></main>;
}
