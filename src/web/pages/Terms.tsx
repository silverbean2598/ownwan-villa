import { Link } from "react-router-dom";

export function Terms() {
  return (
    <main className="page legal">
      <h1>이용약관</h1>
      <p className="muted">운영자: 운영자 명의는 2차 공개 전 확정해요 · 시행일: 2차 공개 전 확정해요</p>
      <h2>서비스</h2>
      <p>오운완아파트는 친구들과 한 아파트에 살며 매일 운동을 인증하는 서비스예요.</p>
      <h2>이용 조건</h2>
      <p>만 14세 이상만 가입할 수 있어요. 다른 사람이 불편한 사진이나 글은 올리지 않아요.</p>
      <h2>탈퇴</h2>
      <p>설정에서 언제든 탈퇴할 수 있어요. 탈퇴하면 계정과 기록이 바로 삭제돼요.</p>
      <p className="muted">정식 약관은 2차 공개 전에 확정돼요.</p>
      <p><Link to="/">처음으로</Link></p>
    </main>
  );
}
