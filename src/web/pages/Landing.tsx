import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { HeroVilla } from "../components/landing/HeroVilla";
import { FurnitureArt, LightUpArt, PenthouseArt } from "../components/landing/StepArt";
import "../components/landing/landing.css";

type Me = { villaId: string | null } | null;

const STEPS = [
  { title: "운동 사진을 올리면 내 방 불이 켜져요", body: "오늘 운동한 사진 한 장이면 끝. 안 올린 친구 방은 깜깜해요.", Art: LightUpArt },
  { title: "포인트로 운동 가구를 사서 방을 꾸며요", body: "인증할 때마다 포인트가 쌓여요. 덤벨 랙, 리포머, 샌드백까지.", Art: FurnitureArt },
  { title: "7일 연속이면 한 층 올라가요", body: "가장 높이 올라간 1등은 꼭대기 펜트하우스에 살아요.", Art: PenthouseArt },
];

export function LandingView({ me }: { me: Me }) {
  const cta = me ? (
    me.villaId ? (
      <Link className="btn" to="/villa">내 빌라로</Link>
    ) : (
      <Link className="btn" to="/villa/new">빌라 만들기</Link>
    )
  ) : (
    <>
      <Link className="btn" to="/signup">가입하고 입주하기</Link>
      <Link className="btn ghost" to="/login">로그인</Link>
    </>
  );

  return (
    <main className="lp">
      <section className="lp-hero">
        <div className="lp-copy">
          <h1>오운완빌라</h1>
          <p className="lp-tagline">친구들과 한 빌라에 살면서<br />매일 오운완해요</p>
        </div>
        <HeroVilla />
        <div className="lp-cta">{cta}</div>
      </section>

      <section className="lp-how" aria-labelledby="lp-how-title">
        <h2 id="lp-how-title">이렇게 놀아요</h2>
        <ol className="lp-steps">
          {STEPS.map(({ title, body, Art }, i) => (
            <li className="lp-step" key={title}>
              <Art />
              <div className="lp-step-text">
                <span className="lp-num">{i + 1}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <footer className="lp-foot">
        <Link to="/terms">이용약관</Link>
        <Link to="/privacy">개인정보 처리방침</Link>
      </footer>
    </main>
  );
}

export function Landing() {
  const [me, setMe] = useState<Me>(null);
  useEffect(() => {
    api<{ villaId: string | null }>("/api/me").then(setMe, () => setMe(null));
  }, []);
  return <LandingView me={me} />;
}
