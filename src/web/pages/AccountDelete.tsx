import { Link } from "react-router-dom";
import { LEGAL, PENDING } from "../legal";

/** 계정 삭제 안내. 로그인 없이 열린다 (Play 스토어 "계정 삭제 URL") */
export function AccountDelete() {
  return (
    <main className="page legal">
      <h1>오운완아파트 계정 삭제</h1>
      <h2>앱에서 삭제하기</h2>
      <ol>
        <li>오운완아파트에 로그인해요.</li>
        <li>설정 → 맨 아래 <b>탈퇴</b>를 눌러요.</li>
        <li>확인 칸에 아이디(카카오로 가입했다면 닉네임)를 입력하고 탈퇴를 눌러요.</li>
      </ol>
      <p><Link to="/settings">설정으로 가기</Link></p>
      <h2>삭제되는 정보</h2>
      <p>탈퇴하면 아래 정보가 바로 삭제되고 되돌릴 수 없어요. 따로 보관하는 기간은 없어요.</p>
      <ul>
        <li>계정 (아이디, 비밀번호, 닉네임, 카카오 회원번호)</li>
        <li>운동 인증 사진 · 루틴 글, 식단 사진 · 글</li>
        <li>댓글 · 응원, 포인트 · 가구 · 캐릭터 꾸미기</li>
        <li>휴대폰 알림 주소</li>
      </ul>
      <h2>로그인할 수 없다면</h2>
      <p>
        아이디와 함께 삭제를 요청해 주세요:{" "}
        {LEGAL.contactEmail ? <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a> : `문의 이메일은 ${PENDING}`}
      </p>
      <p><Link to="/privacy">개인정보 처리방침</Link> · <Link to="/">처음으로</Link></p>
    </main>
  );
}
