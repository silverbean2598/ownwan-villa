import { Link } from "react-router-dom";

type Props = {
  /** 오늘 이 빌라에 인증을 올렸다 (이 빌라에서 내 방 불이 켜졌다) */
  certifiedToday: boolean;
  /** 오늘 다른 빌라에는 올렸지만 이 빌라에는 아직 (빌라 여러 곳에 살 때) */
  certifiedElsewhere?: boolean;
  /** 어느 빌라 화면에서 눌렀는지 (인증 화면에서 이 빌라부터 보여 준다) */
  villaId?: string;
};

/** 오늘 인증 전에는 큰 인증 버튼, 인증한 뒤에도 사진을 더 올릴 수 있게 보조 버튼, 다른 빌라에만 올렸으면 [이 빌라에도 올리기] */
export function CertifyButton({ certifiedToday, certifiedElsewhere = false, villaId }: Props) {
  const to = villaId ? `/certify?villa=${encodeURIComponent(villaId)}` : "/certify";
  if (certifiedToday) return <Link className="btn ghost cert-more" to={to}>추가 인증하기</Link>;
  if (certifiedElsewhere) return <Link className="btn primary" to={to}>이 빌라에도 올리기</Link>;
  return <Link className="btn primary" to={to}>오늘 오운완 인증하기</Link>;
}
