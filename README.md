# 오운완빌라

같이 오운완하는 사람들이 빌라에 입주해 매일 운동을 인증하고, 포인트로 방을 꾸미고, 꾸준할수록 높은 층으로 올라가 펜트하우스를 차지하는 웹앱.

Cloudflare Worker 하나가 React(Vite) 화면과 Hono API(`/api/*`)를 함께 서빙한다. 데이터는 D1, 사진은 D1(나중에 R2로 전환 가능).

## 로컬 개발
```
npm ci
npx wrangler d1 migrations apply ownwan-villa --local   # 로컬 D1 테이블 만들기 (마이그레이션이 늘면 다시)
npm run dev     # 로컬 개발 서버 (D1은 로컬 시뮬레이션)
npm test        # 전체 테스트
```

## 배포
`npm run deploy` (빌드 후 `wrangler deploy`). 마이그레이션은 `npx wrangler d1 migrations apply ownwan-villa --remote`. 자세한 절차와 점검은 `docs/launch-checklist.md`.

## 문서
- 설계 문서 : `docs/superpowers/specs/2026-11-18-ownwan-villa-design.md`
- 1차 개발 계획 : `docs/superpowers/plans/2026-11-18-ownwan-villa-phase1.md`
- 오픈 점검표 : `docs/launch-checklist.md`
