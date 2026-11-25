import { Link } from "react-router-dom";
import { operatorLine } from "../legal";

export function Terms() {
  return (
    <main className="page legal">
      <h1>이용약관</h1>
      <p className="muted">{operatorLine()}</p>
      <h2>서비스</h2>
      <p>오운완아파트는 친구들과 한 아파트에 살며 매일 운동을 인증하는 서비스예요.</p>
      <h2>이용 조건</h2>
      <p>만 14세 이상만 가입할 수 있어요. 다른 사람이 불편한 사진이나 글은 올리지 않아요.</p>
      <h2>탈퇴</h2>
      <p>설정에서 언제든 탈퇴할 수 있어요. 탈퇴하면 계정과 기록이 바로 삭제돼요. <Link to="/account-delete">계정 삭제 방법</Link></p>
      <p><Link to="/">처음으로</Link></p>
    </main>
  );
}
