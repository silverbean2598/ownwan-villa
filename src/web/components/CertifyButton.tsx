import { Link } from "react-router-dom";

/** 오늘 인증 전에는 큰 인증 버튼, 인증한 뒤에도 사진을 더 올릴 수 있게 보조 버튼 */
export function CertifyButton({ certifiedToday }: { certifiedToday: boolean }) {
  return certifiedToday ? (
    <Link className="btn ghost cert-more" to="/certify">추가 인증하기</Link>
  ) : (
    <Link className="btn primary" to="/certify">오늘 오운완 인증하기</Link>
  );
}
