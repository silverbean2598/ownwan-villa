# 오픈 점검표

## 0. 현재 배포 구성
- Worker `ownwan-villa`, D1 `ownwan-villa` (id `b90c5080-894b-4ccb-9f75-0441d23cdb72`), 크론 `0 15 * * *` (매일 00:00 KST 정산).
- 사진은 D1(`photo_blobs_b64`, base64 TEXT)에 저장 (`PHOTO_STORAGE = "d1"`). R2는 아직 쓰지 않는다. `PHOTO_STORAGE`를 `"r2"`로 바꾸고 `PHOTOS` 바인딩을 빠뜨리면 사진 요청이 에러로 실패한다(조용히 D1에 쌓이지 않는다).
- `observability`가 켜져 있어 대시보드 Workers & Pages → ownwan-villa → Logs(Workers Logs)에서 요청별 CPU 시간을 볼 수 있다.
- 배포: `npm run deploy` (`vite build && wrangler deploy`). 새 마이그레이션이 있으면 먼저 `npx wrangler d1 migrations apply ownwan-villa --remote`.
- 배포는 GitHub Actions로 한다 (Claude 세션/샌드박스 프록시에서는 정적 파일 업로드가 막혀 로컬 배포가 되지 않는다).
  1. GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret 으로 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` 두 개를 추가한다.
  2. 저장소 Actions 탭 → "deploy" → Run workflow 로 수동 배포(브랜치 선택 가능). main 푸시 때도 자동 배포되고, PR에서는 테스트만 돈다.
  3. 워크플로는 테스트 → 원격 D1 마이그레이션 → workers.dev 서브도메인 확인(없으면 `ownwan-villa` 등록) → 배포 순서로 돈다.

## 1. 초대 전 필수: 로그인 · 가입 CPU 시간 (테스트 계정으로)
친구를 초대하기 **전에** 테스트 계정으로 확인한다. 비밀번호 해시(PBKDF2)가 무료 한도(요청당 CPU 10ms)를 넘을 수 있다.
1. 배포된 주소에서 테스트 계정으로 가입 1번, 로그아웃 후 로그인 3~5번.
2. 대시보드 Workers Logs(또는 `npx wrangler tail ownwan-villa --format json`)에서 `/api/signup`, `/api/login` 요청의 CPU 시간을 본다.
3. 계속 10ms를 넘으면 `src/worker/auth/password.ts`의 `ITERATIONS`를 낮춰 배포한다. 해시에 반복 횟수가 같이 저장되어 있어 기존 해시는 그대로 유효하고, 로그인에 성공하면 새 반복 횟수로 자동으로 다시 저장된다(rehash-on-login).
   - 2026-11-18 실측(PBKDF2 100000회): 가입 p50 34ms / 최대 56ms, 로그인 p50 26ms CPU. 무료 한도 10ms 초과.
   - 조치: `ITERATIONS`를 20000으로 낮춤. 예상 CPU는 약 5~8ms. 기존 100000회 해시는 그대로 검증되고 다음 로그인 때 20000회로 다시 저장된다. 가입 · 비밀번호 변경 · 복구는 처음부터 20000회로 해시한다.
   - Workers 유료 플랜으로 옮기면 CPU 한도가 늘어나므로 반복 횟수를 다시 올리는 것이 알맞다.
4. 확인이 끝나면 테스트 계정은 설정 → 탈퇴로 지운다.

## 1-1. 휴대폰 2대 점검 스크립트
1. 폰 A: 가입 → 복구 코드 확인(저장) → 빌라 만들기.
2. 폰 B: 초대 링크로 입주 → 종목 · 캐릭터 고르기.
3. 사진 인증: 아이폰(Safari)과 안드로이드(Chrome)에서 각각 촬영/선택해 업로드. 앨범에서 고른 HEIC 사진도 올라가는지 확인.
4. 불 켜짐 확인: 인증 직후 내 방과 빌라 외관에 불이 켜지는지.
5. 상점에서 구매 → 방에 배치.
6. 상대 글 신고, 방장 삭제 확인.
7. 나가기 → 같은 초대 링크로 재입주.
8. 다음 날 자정 정산: `npx wrangler tail ownwan-villa`로 00:00 KST(15:00 UTC) 크론 로그를 보고 연속일수 · 층 결과를 확인. 정산이 실패하면 `settle <날짜> failed` 에러 로그가 남고 실행이 실패로 표시된다. 크론이 하루 이틀 빠져도 다음 실행이 밀린 날을 오래된 순서로 한 번에 최대 7일까지 정산한다.

## 2. 아이폰 Safari 캐릭터 관절 확인 (눈으로)
필라테스 · 주짓수 · 태권도 종목 캐릭터의 애니메이션에서 팔다리 관절이 끊기거나 튀지 않는지, 회전 중심이 몸에 붙어 있는지 아이폰 Safari에서 확인한다(SVG transform-origin 차이가 잘 나는 곳).

## 3. 사진 요청 CPU 시간
같은 Workers Logs에서 `/api/certs/photo`(올리기)와 `/api/photos/<id>`(보기)의 CPU 시간도 본다. D1에는 base64 TEXT로 저장해 숫자 배열 변환 비용을 없앴지만, 계속 10ms를 넘으면 6번(R2 전환)을 앞당긴다.

## 4. 딥링크 새로고침
주소창에서 직접 열고 새로고침해도 앱이 뜨는지: `/villa`, `/room/<id>`, `/join/<토큰>` (SPA 폴백). `/api/...`는 JSON으로 응답해야 한다.

## 5. 사용량 알림 (Cloudflare 대시보드)
- Notifications > Add: Workers 요청 수 사용량 알림(무료 한도 일 10만 요청의 70~80%), D1 사용량(저장량 · 읽기/쓰기 행 수) 알림.
- 사진을 D1에 두는 동안은 D1 저장량이 곧 사진 저장량이다. 무료 요금제에서 **D1 데이터베이스 하나는 500MB까지**다(5GB는 계정 전체 합계라 이 DB 하나에는 해당하지 않는다). 사진 1장은 약 150KB(base64로 약 200KB)라 대략 **2,500~3,000장**이면 찬다.
- **DB가 꽉 차면 사진뿐 아니라 가입 · 인증 · 정산 등 모든 쓰기가 실패한다.** D1 저장량 알림을 **약 400MB**에 걸고, 그 전에 6번(R2 전환)을 계획한다. 현재 크기는 `npx wrangler d1 info ownwan-villa`로도 볼 수 있다.
- R2로 옮긴 뒤에는 R2 저장량(무료 10GB) 알림도 추가한다.

## 6. R2로 전환하기 (나중에)
1. 대시보드 R2에서 R2를 활성화(결제 수단 필요)하고 버킷 `ownwan-villa-photos`를 만든다 (공개 액세스는 켜지 않는다).
2. `wrangler.jsonc`의 `r2_buckets` 주석을 풀고 `PHOTO_STORAGE`를 `"r2"`로 바꾼다.
3. 기존 사진 복사: 전환 전에 D1에 있던 사진은 `photo_blobs_b64`에 남아 있고 R2 모드에서는 읽히지 않는다. 일회성으로 `certs.r2_key`(= R2 키)를 그대로 써서 복사한다. 공개 주소 없이 로컬에서만 실행한다. 지운 기록(`deleted = 1`)은 사진 파일이 이미 없으므로 대상이 아니다.
   ```
   npx wrangler d1 execute ownwan-villa --remote --json \
     --command "SELECT c.r2_key, b.data AS b64, b.content_type FROM photo_blobs_b64 b JOIN certs c ON c.id = b.cert_id"
   ```
   결과의 `b64`를 바이너리로 풀어(`base64 -d`) `npx wrangler r2 object put ownwan-villa-photos/<r2_key> --file <파일> --content-type image/jpeg --remote`로 올린다(건수가 많으면 이 과정을 스크립트로 반복). 모두 올린 뒤 `npm run deploy`.
4. 확인 후 `DELETE FROM photo_blobs_b64;`로 D1 쪽을 비운다. 전환 직후 새 사진은 R2에만 쌓인다.
