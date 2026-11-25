import { Link } from "react-router-dom";
import { LEGAL, PENDING, operatorLine } from "../legal";

export function Privacy() {
  return (
    <main className="page legal">
      <h1>개인정보 처리방침</h1>
      <p className="muted">{operatorLine()}</p>
      <h2>받는 정보</h2>
      <ul>
        <li>아이디</li>
        <li>비밀번호 (암호화해서 저장해요)</li>
        <li>닉네임</li>
        <li>카카오 회원번호 (카카오로 로그인할 때만)</li>
        <li>운동 기록: 종목, 인증 날짜, 연속 일수, 층</li>
        <li>인증 사진 · 루틴 글</li>
        <li>식단 사진 · 식단 글</li>
        <li>댓글 · 응원</li>
        <li>휴대폰 알림 주소 (휴대폰 알림을 켠 기기만)</li>
      </ul>
      <p>이메일, 전화번호, 위치는 받지 않아요. 광고나 분석 도구도 쓰지 않아요.</p>
      <p>카카오 로그인 시 카카오 회원번호만 받고, 이메일·전화번호·프로필은 받지 않아요. 카카오 회원번호는 로그인할 때 내 계정을 찾는 데만 써요.</p>
      <p>휴대폰 알림을 켜면 브라우저가 만든 그 기기의 알림 주소와 암호화 키만 저장해요. 알림을 보내는 데만 쓰고, 알림을 끄거나 로그아웃 · 탈퇴하면 지워요.</p>
      <h2>쓰는 곳</h2>
      <p>받은 정보는 오운완아파트 기능(인증, 층 · 펜트하우스, 꾸미기, 알림)에만 써요. 다른 회사에 팔거나 넘기지 않아요.</p>
      <p>서비스는 Cloudflare 서버에서 돌아가고, 정보도 그곳에 저장돼요.</p>
      <h2>열람</h2>
      <p>인증 사진, 루틴, 식단, 댓글은 같은 아파트에 사는 사람만 볼 수 있어요.</p>
      <h2>보관 기간과 삭제</h2>
      <p>탈퇴하면 위 정보를 바로 삭제해요. <Link to="/account-delete">계정 삭제 방법</Link></p>
      <h2>개인정보 보호책임자</h2>
      <p>
        {LEGAL.operatorName ?? PENDING} ·{" "}
        {LEGAL.contactEmail ? <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a> : `문의 이메일 ${PENDING}`}
      </p>
      <p><Link to="/">처음으로</Link></p>
    </main>
  );
}
