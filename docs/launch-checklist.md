# 오픈 점검표

## 0. 현재 배포 구성
- Worker `ownwan-villa`, D1 `ownwan-villa` (id `b90c5080-894b-4ccb-9f75-0441d23cdb72`), 크론 `0 15 * * *` (매일 00:00 KST 정산).
- 사진은 D1(`photo_blobs`)에 저장 (`PHOTO_STORAGE = "d1"`). R2는 아직 쓰지 않는다.
- 배포: `npm run deploy` (`vite build && wrangler deploy`). 새 마이그레이션이 있으면 먼저 `npx wrangler d1 migrations apply ownwan-villa --remote`.
- CI 배포: GitHub 저장소 Settings > Secrets and variables > Actions에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`를 추가해야 main 푸시 때 자동 배포된다. 추가하기 전에는 Claude 세션에서 직접 배포한다. PR에서는 테스트만 돈다.

## 1. 휴대폰 2대 점검 스크립트
1. 폰 A: 가입 → 복구 코드 확인(저장) → 빌라 만들기.
2. 폰 B: 초대 링크로 입주 → 종목 · 캐릭터 고르기.
3. 사진 인증: 아이폰(Safari)과 안드로이드(Chrome)에서 각각 촬영/선택해 업로드. 앨범에서 고른 HEIC 사진도 올라가는지 확인.
4. 불 켜짐 확인: 인증 직후 내 방과 빌라 외관에 불이 켜지는지.
5. 상점에서 구매 → 방에 배치.
6. 상대 글 신고, 방장 삭제 확인.
7. 나가기 → 같은 초대 링크로 재입주.
8. 다음 날 자정 정산: `npx wrangler tail ownwan-villa`로 00:00 KST(15:00 UTC) 크론 로그를 보고 연속일수 · 층 결과를 확인.

## 2. 아이폰 Safari 캐릭터 관절 확인 (눈으로)
필라테스 · 주짓수 · 태권도 종목 캐릭터의 애니메이션에서 팔다리 관절이 끊기거나 튀지 않는지, 회전 중심이 몸에 붙어 있는지 아이폰 Safari에서 확인한다(SVG transform-origin 차이가 잘 나는 곳).

## 3. 로그인 CPU 시간
`npx wrangler tail ownwan-villa --format json`으로 로그인 요청의 CPU 시간을 본다. 무료 한도(요청당 10ms)를 계속 넘으면 `src/worker/auth/password.ts`의 PBKDF2 반복 횟수를 낮춘다. 해시에 반복 횟수가 같이 저장되어 있어 기존 해시는 그대로 유효하다.

## 4. 딥링크 새로고침
주소창에서 직접 열고 새로고침해도 앱이 뜨는지: `/villa`, `/room/<id>`, `/join/<토큰>` (SPA 폴백). `/api/...`는 JSON으로 응답해야 한다.

## 5. 사용량 알림 (Cloudflare 대시보드)
- Notifications > Add: Workers 요청 수 사용량 알림(무료 한도 일 10만 요청의 70~80%), D1 사용량(저장량 · 읽기/쓰기 행 수) 알림.
- 사진을 D1에 두는 동안은 D1 저장량이 곧 사진 저장량이다(무료 5GB 한도, 사진 1장 약 300KB). Storage 알림을 꼭 켠다.
- R2로 옮긴 뒤에는 R2 저장량(무료 10GB) 알림도 추가한다.

## 6. R2로 전환하기 (나중에)
1. 대시보드 R2에서 R2를 활성화(결제 수단 필요)하고 버킷 `ownwan-villa-photos`를 만든다 (공개 액세스는 켜지 않는다).
2. `wrangler.jsonc`의 `r2_buckets` 주석을 풀고 `PHOTO_STORAGE`를 `"r2"`로 바꾼다.
3. 기존 사진 복사: 전환 전에 D1에 있던 사진은 `photo_blobs`에 남아 있고 R2 모드에서는 읽히지 않는다. 일회성으로 `certs.r2_key`(= R2 키)를 그대로 써서 복사한다. 공개 주소 없이 로컬에서만 실행한다.
   ```
   npx wrangler d1 execute ownwan-villa --remote --json \
     --command "SELECT c.r2_key, hex(b.data) AS h, b.content_type FROM photo_blobs b JOIN certs c ON c.id = b.cert_id"
   ```
   결과의 `h`를 바이너리로 풀어 `npx wrangler r2 object put ownwan-villa-photos/<r2_key> --file <파일> --content-type image/jpeg --remote`로 올린다(건수가 많으면 이 과정을 스크립트로 반복). 모두 올린 뒤 `npm run deploy`.
4. 확인 후 `DELETE FROM photo_blobs;`로 D1 쪽을 비운다. 전환 직후 새 사진은 R2에만 쌓인다.
