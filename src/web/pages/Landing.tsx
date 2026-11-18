import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export function Landing() {
  const [me, setMe] = useState<{ villaId: string | null } | null>(null);
  useEffect(() => {
    api<{ villaId: string | null }>("/api/me").then(setMe, () => setMe(null));
  }, []);

  return (
    <main className="page">
      <h1>오운완빌라</h1>
      <p className="muted">친구들과 한 빌라에 입주해서, 매일 운동을 인증하고 함께 층을 올려요.</p>
      <div className="row" style={{ flexDirection: "column", marginTop: 32 }}>
        {me ? (
          me.villaId ? (
            <Link className="btn" to="/villa">내 빌라로</Link>
          ) : (
            <Link className="btn" to="/villa/new">빌라 만들기</Link>
          )
        ) : (
          <>
            <Link className="btn" to="/signup">가입하기</Link>
            <Link className="btn ghost" to="/login">로그인</Link>
          </>
        )}
      </div>
    </main>
  );
}
