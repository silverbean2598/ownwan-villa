import { Link } from "react-router-dom";

export function Privacy() {
  return (
    <main className="page legal">
      <h1>개인정보 처리방침</h1>
      <p className="muted">운영자: 운영자 명의는 2차 공개 전 확정해요 · 시행일: 2차 공개 전 확정해요</p>
      <h2>받는 정보</h2>
      <ul>
        <li>아이디</li>
        <li>비밀번호 (암호화해서 저장해요)</li>
        <li>닉네임</li>
        <li>인증 사진 · 루틴 글</li>
      </ul>
      <p>이메일과 전화번호는 받지 않아요.</p>
      <h2>보관 기간</h2>
      <p>탈퇴하면 위 정보를 바로 삭제해요.</p>
      <h2>열람</h2>
      <p>인증 사진과 루틴은 같은 빌라에 사는 사람만 볼 수 있어요.</p>
      <p className="muted">정식 처리방침은 2차 공개 전에 확정돼요.</p>
      <p><Link to="/">처음으로</Link></p>
    </main>
  );
}
