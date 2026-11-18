# 오운완빌라 1차(친구 빌라) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 친구 10명이 빌라 1개에 입주해 매일 오운완 인증 → 포인트 → 가구 → 층 · 펜트하우스 흐름을 실제로 쓸 수 있는 웹앱을 Cloudflare 무료 요금제에 배포한다.

**Architecture:** Cloudflare Worker 하나가 React 화면(정적 자산)과 `/api/*` 서버를 함께 서빙한다. 데이터는 D1, 사진은 R2(비공개, Worker가 권한 확인 후 전달), 자정 계산은 Cron Trigger. 게임 규칙(포인트 · 층 · 펜트하우스 · 하루 기준)은 `src/shared/rules/`의 순수 함수로 분리해 서버 · 화면 · 자정 작업이 같은 코드를 쓴다.

**Tech Stack:** TypeScript 5, Hono 4 (Worker 라우팅), React 18 + react-router-dom 6, Vite 5 + @cloudflare/vite-plugin, Cloudflare D1 · R2 · Cron Triggers, Vitest + @cloudflare/vitest-pool-workers, wrangler 3+.

**Spec:** `docs/superpowers/specs/2026-11-18-ownwan-villa-design.md` (승인 v2). Notion 사본 : https://app.notion.com/p/41c0c68e730681aba1fde9233e35b79d

## Global Constraints

- 무료 요금제만 사용. 유료 기능(Durable Objects 유료, Workers Paid 등) 사용 금지
- 받는 개인정보 : 아이디, 비밀번호(해시), 닉네임만. 이메일 · 전화번호 필드 금지
- 아이디 : 영문 소문자 · 숫자 4~16자 (`^[a-z0-9]{4,16}$`), 중복 불가
- 비밀번호 : 8자 이상. 닉네임 : 2~10자
- 가입 시 "만 14세 이상" · "이용약관 · 개인정보 처리방침 동의" 체크 필수
- 하루 = 한국 시간(Asia/Seoul, UTC+9) 00:00~23:59. 자정 작업 Cron : `0 15 * * *` (UTC)
- 포인트 : 사진 1번째 20P, 2번째 10P, 3번째 5P, 4번째 이후 0P / 루틴 글 하루 1회 10P / 하루 최대 45P
- 층 : 입주 시 1층. 연속 기록 7의 배수 달성일마다 +1층. 미인증일 연속 횟수(missRun)가 1, 8, 15…(missRun % 7 === 1)일 때 −1층. 최저 1층, 상한 없음
- 펜트하우스 : 빌라당 1명. 판정 = 층 내림차순 → 연속 기록 내림차순 → 그 층 도달 시각 오름차순. 자정에 재계산. 입주 · 나가기로 펜트하우스 주인이 바뀌어야 하면 즉시 재계산
- 빌라 정원 10명. 사용자는 활성 빌라 1곳에만 소속
- 빌라 이동 시 연속 기록 · 포인트 · 가구 · 캐릭터는 유지, 층만 1층에서 다시 시작
- 방장이 나가면 남은 입주민 중 `joined_at`이 가장 이른 사람이 방장. 마지막 1명이 나가면 빌라는 `dissolved_at` 기록
- 인증 사진 · 루틴은 같은 빌라 현재 입주민만 열람. R2 버킷은 공개하지 않는다
- 사진 : 브라우저에서 긴 변 1280px, JPEG 품질 0.8 시작, 150KB 이하가 될 때까지 품질을 0.1씩 낮춤(최저 0.5)
- 신고 3건이면 사진 자동 가림. 방장은 빌라 입주민 사진 삭제 가능. 운영자 열람 기능 없음
- 종목 : `gym` 헬스 / `pilates` 필라테스 / `running` 러닝 / `climbing` 클라이밍 / `jiujitsu` 주짓수. 이 외 추가 금지
- 디자인 : 화이트톤. 빌라 화면은 시안(https://claude.ai/artifact/QeQhRNtkvyJZkK6dnFyLV9)의 구성을 따른다
- 화면 문구는 한국어. 사용자 기준 표현(예: "오늘 오운완 인증하기", "불이 켜졌어요")
- 알림은 앱 안 배지만. 빌라 화면은 열 때 · 새로고침 때 갱신(실시간 아님)
- **[계획 단계 결정]** 이전 사진과 같은 사진(dHash 해밍거리 ≤ 5)은 저장하되 포인트 0, **오늘 인증으로도 치지 않는다** (같은 사진으로 연속 기록을 이어가는 것을 막기 위함). 화면 안내 : "전에 올린 사진과 같아요. 새 사진을 올려 주세요"
- **[계획 단계 결정]** dHash는 브라우저에서 계산해 함께 보낸다 (1차는 친구 대상이라 신뢰. 2차 전 서버 검증 재검토)
- **[계획 단계 결정]** 빌라를 옮긴 사람의 게시판 기록은 새 빌라 입주민에게 보인다 (게시판은 사람에게 붙음). 원래 빌라에서는 안 보인다

## Review Focus

1. **자정 경계 업로드** : 23:59:50 KST에 올린 사진은 그날 인증, 00:00:05 KST는 다음 날 인증이어야 한다 → Task 2 `kstDay` 테스트, Task 7 업로드 시각 기준 테스트
2. **자정 작업 중복 실행** : Cron이 재시도되어 같은 날을 두 번 처리해도 층 · 연속 기록이 두 번 바뀌면 안 된다 → Task 8 `settings.last_settled_day` 멱등 테스트
3. **9/10명일 때 두 명이 동시에 입주** : 11명이 되면 안 된다 → Task 5 정원 검사를 단일 SQL 문(INSERT … SELECT … WHERE count < 10)으로, 테스트로 고정
4. **방장 혼자 사는 빌라에서 방장이 복구 요청** : 승인해 줄 사람이 없다 → Task 4에서 "확인해 줄 입주민이 없어요. 복구 코드로만 되찾을 수 있어요" 안내, 테스트로 고정
5. **아이폰 HEIC · 디코딩 불가 사진** : 브라우저가 못 여는 사진을 고르면 앱이 멈추면 안 된다 → Task 7 `compressImage`가 디코딩 실패 시 `ImageDecodeError`를 던지고 화면은 "이 사진은 열 수 없어요. 다른 사진을 골라 주세요" 표시

---

## 파일 구조

```
ownwan-villa/
  package.json · tsconfig.json · vite.config.ts · vitest.config.ts · wrangler.jsonc
  migrations/0001_init.sql
  docs/superpowers/specs/2026-11-18-ownwan-villa-design.md
  docs/superpowers/plans/2026-11-18-ownwan-villa-phase1.md
  docs/launch-checklist.md
  src/shared/
    sports.ts          종목 enum · 라벨
    avatar.ts          캐릭터 팔레트 · 검증
    catalog.ts         가구 목록(임시) · 자리
    rules/day.ts       kstDay, prevDay
    rules/points.ts    photoPoints, routinePoints
    rules/floor.ts     settleDay
    rules/penthouse.ts pickPenthouse
  src/worker/
    index.ts           Hono app + scheduled 핸들러
    env.ts             Env 타입 (DB, PHOTOS, ASSETS)
    http.ts            에러 응답 · requireUser 미들웨어
    auth/password.ts · auth/session.ts · auth/routes.ts
    recovery/codes.ts · recovery/routes.ts
    villa/service.ts · villa/routes.ts
    profile/routes.ts  종목 · 캐릭터 · 닉네임
    cert/routes.ts     업로드 · 게시판 · 사진 전달
    cron/settle.ts     자정 정산
    shop/routes.ts
    report/routes.ts
    badges/routes.ts
  src/web/
    main.tsx · App.tsx · api.ts · theme.css
    image/compress.ts · image/dhash.ts
    pages/ Landing · Signup · RecoveryCode · Login · Recover · VillaNew · Join · Onboard · Villa · Room · Certify · Shop · Settings · Terms · Privacy
    components/ Building.tsx · RoomTile.tsx · RoomScene.tsx · Avatar.tsx · Board.tsx · Badge.tsx
  test/ (worker 테스트는 *.test.ts, 규칙 테스트는 src/shared/rules/*.test.ts 옆에)
```

## DB 스키마 (Task 1에서 생성, 이후 태스크는 이 이름을 쓴다)

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, nickname TEXT NOT NULL,
  password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL,
  sport TEXT, avatar TEXT NOT NULL DEFAULT '{}',
  points INTEGER NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0,
  miss_run INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0, locked_until INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE villas (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT NOT NULL,
  invite_token TEXT UNIQUE NOT NULL, penthouse_user_id TEXT,
  public INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, dissolved_at INTEGER
);
CREATE TABLE memberships (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, villa_id TEXT NOT NULL,
  floor INTEGER NOT NULL DEFAULT 1, floor_reached_at INTEGER NOT NULL,
  joined_at INTEGER NOT NULL, left_at INTEGER
);
CREATE UNIQUE INDEX one_active_villa ON memberships(user_id) WHERE left_at IS NULL;
CREATE TABLE certs (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, day TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('photo','routine')),
  r2_key TEXT, dhash TEXT, body TEXT,
  points INTEGER NOT NULL, duplicate INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
);
CREATE INDEX certs_user_day ON certs(user_id, day);
CREATE TABLE recovery_requests (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, approver_id TEXT NOT NULL,
  ticket_hash TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('pending','approved','cancelled','done')),
  approved_at INTEGER, created_at INTEGER NOT NULL
);
CREATE TABLE inventory (user_id TEXT NOT NULL, item_id TEXT NOT NULL, PRIMARY KEY (user_id, item_id));
CREATE TABLE placements (user_id TEXT NOT NULL, slot TEXT NOT NULL, item_id TEXT NOT NULL, PRIMARY KEY (user_id, slot));
CREATE TABLE reports (cert_id TEXT NOT NULL, reporter_id TEXT NOT NULL, PRIMARY KEY (cert_id, reporter_id));
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
```

시각은 모두 epoch ms(INTEGER). id는 `crypto.randomUUID()`.

---

### Task 1: 프로젝트 뼈대

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `wrangler.jsonc`, `migrations/0001_init.sql`, `src/worker/index.ts`, `src/worker/env.ts`, `src/worker/http.ts`, `src/web/main.tsx`, `src/web/App.tsx`, `src/web/theme.css`, `index.html`, `.gitignore`
- Test: `src/worker/index.test.ts`

**Interfaces:**
- Produces: `type Env = { DB: D1Database; PHOTOS: R2Bucket; ASSETS: Fetcher }` (`src/worker/env.ts`); `app: Hono<{ Bindings: Env; Variables: { userId: string } }>` default export에 `fetch`와 `scheduled`; `jsonError(c, status: number, message: string)` (`src/worker/http.ts`); `GET /api/health` → `{ ok: true }`

- [ ] **Step 1:** `wrangler.jsonc` 작성 : `main: src/worker/index.ts`, `assets: { not_found_handling: "single-page-application", run_worker_first: ["/api/*"] }`, D1 바인딩 `DB`(database_name `ownwan-villa`), R2 바인딩 `PHOTOS`(bucket `ownwan-villa-photos`), `triggers.crons: ["0 15 * * *"]`, `compatibility_date` 최근 날짜
- [ ] **Step 2:** `migrations/0001_init.sql`에 위 DB 스키마 그대로 작성
- [ ] **Step 3: 실패하는 테스트** `index.test.ts` : `SELF.fetch("http://x/api/health")` → status 200, body `{ ok: true }`
- [ ] **Step 4:** `npx vitest run src/worker/index.test.ts` → FAIL
- [ ] **Step 5:** Hono 앱에 `/api/health` 구현, `vitest.config.ts`에 `defineWorkersConfig` + 테스트 시작 시 `migrations/` 적용(`applyD1Migrations`)
- [ ] **Step 6:** `npx vitest run` → PASS. `npm run dev`로 브라우저에서 React "오운완빌라" 첫 화면이 뜨는지 확인
- [ ] **Step 7:** Commit `chore: 프로젝트 뼈대 (Worker + React + D1 + R2)`

### Task 2: 게임 규칙 엔진

**Files:**
- Create: `src/shared/rules/day.ts`, `points.ts`, `floor.ts`, `penthouse.ts`, `src/shared/sports.ts`
- Test: 같은 폴더 `*.test.ts`

**Interfaces:**
- Produces:
  - `kstDay(ms: number): string` → `"YYYY-MM-DD"` (KST), `prevDay(day: string): string`
  - `photoPoints(nth: number): number` (nth는 그날 중복 아닌 사진 순번, 1부터), `routinePoints(alreadyToday: boolean): number`
  - `type DayState = { streak: number; missRun: number; floor: number | null }` (floor null = 빌라 없음)
  - `settleDay(s: DayState, certified: boolean): { next: DayState; floorChanged: "up" | "down" | null }`
  - `type Contender = { userId: string; floor: number; streak: number; floorReachedAt: number }`, `pickPenthouse(cs: Contender[]): string | null`
  - `SPORTS = ["gym","pilates","running","climbing","jiujitsu"] as const`, `type Sport`, `SPORT_LABEL: Record<Sport,string>`

- [ ] **Step 1: 실패하는 테스트**
```ts
expect(kstDay(Date.UTC(2026,10,18,14,59,50))).toBe("2026-11-18") // 23:59:50 KST
expect(kstDay(Date.UTC(2026,10,18,15,0,5))).toBe("2026-11-19")   // 00:00:05 KST
expect(prevDay("2026-03-01")).toBe("2026-02-28")
expect([1,2,3,4,9].map(photoPoints)).toEqual([20,10,5,0,0])
expect(routinePoints(false)).toBe(10); expect(routinePoints(true)).toBe(0)
// 7일째 인증 → +1층
expect(settleDay({streak:6,missRun:0,floor:1}, true)).toEqual({next:{streak:7,missRun:0,floor:2},floorChanged:"up"})
// 연속 끊김 → 즉시 −1층
expect(settleDay({streak:10,missRun:0,floor:3}, false)).toEqual({next:{streak:0,missRun:1,floor:2},floorChanged:"down"})
// 계속 쉼 : missRun 2~7은 유지, 8에서 −1
expect(settleDay({streak:0,missRun:6,floor:2}, false).next.floor).toBe(2)
expect(settleDay({streak:0,missRun:7,floor:2}, false)).toEqual({next:{streak:0,missRun:8,floor:1},floorChanged:"down"})
// 최저 1층
expect(settleDay({streak:3,missRun:0,floor:1}, false).next.floor).toBe(1)
// 빌라 없음 : 층 없이 연속 기록만
expect(settleDay({streak:6,missRun:0,floor:null}, true).next).toEqual({streak:7,missRun:0,floor:null})
// 이사 후 연속 기록 20 → 21일째는 7의 배수 아님, 21일째 도달 시 +1
expect(settleDay({streak:20,missRun:0,floor:1}, true).next.floor).toBe(2)
// 펜트하우스
expect(pickPenthouse([])).toBeNull()
expect(pickPenthouse([{userId:"a",floor:5,streak:30,floorReachedAt:2},{userId:"b",floor:5,streak:30,floorReachedAt:1}])).toBe("b")
expect(pickPenthouse([{userId:"a",floor:5,streak:9,floorReachedAt:1},{userId:"b",floor:5,streak:30,floorReachedAt:9}])).toBe("b")
expect(pickPenthouse([{userId:"a",floor:6,streak:1,floorReachedAt:9},{userId:"b",floor:5,streak:99,floorReachedAt:1}])).toBe("a")
```
- [ ] **Step 2:** `npx vitest run src/shared/rules` → FAIL
- [ ] **Step 3:** 구현. `kstDay`는 `ms + 9*3600_000`을 UTC 날짜로 포맷. `settleDay` 규칙은 Global Constraints의 층 규칙 그대로 (`floorChanged` "down"은 실제로 층이 줄었을 때만, 1층에서 하락 시도는 null)
- [ ] **Step 4:** `npx vitest run src/shared/rules` → PASS
- [ ] **Step 5:** Commit `feat: 게임 규칙 엔진 (하루 기준, 포인트, 층, 펜트하우스)`

### Task 3: 회원가입 · 로그인

**Files:**
- Create: `src/worker/auth/password.ts`, `session.ts`, `routes.ts`, `src/worker/recovery/codes.ts`, `src/web/api.ts`, `src/web/pages/Landing.tsx`, `Signup.tsx`, `RecoveryCode.tsx`, `Login.tsx`
- Modify: `src/worker/index.ts` (라우트 연결), `src/worker/http.ts` (`requireUser`)
- Test: `src/worker/auth/auth.test.ts`

**Interfaces:**
- Produces:
  - `hashPassword(pw: string): Promise<string>` → `pbkdf2$100000$<saltB64>$<hashB64>` (PBKDF2-SHA256, salt 16바이트), `verifyPassword(pw: string, stored: string): Promise<boolean>` (상수 시간 비교)
  - `newRecoveryCode(): string` → `XXXX-XXXX-XXXX-XXXX` (문자집합 `ABCDEFGHJKMNPQRSTVWXYZ23456789`), `hashToken(s: string): Promise<string>` (SHA-256 hex, 대시 제거 · 대문자화 후)
  - `createSession(env, userId): Promise<string>` (32바이트 랜덤 토큰, DB에는 `hashToken` 저장, 30일), `requireUser` 미들웨어 → `c.get("userId")`, 쿠키 `sid` (HttpOnly, Secure, SameSite=Lax, Path=/)
  - `POST /api/signup {username,password,nickname,over14,agree}` → 201 `{ recoveryCode }` + 세션 쿠키
  - `POST /api/login {username,password}` → 200 `{ ok:true }` / 401 `"아이디 또는 비밀번호가 맞지 않아요"` / 423 `"로그인을 5번 실패해서 15분 동안 잠겼어요"`
  - `POST /api/logout`, `GET /api/me` → `{ id, username, nickname, sport, avatar, points, streak, villaId }`
  - `api.ts` : `api<T>(path: string, init?: RequestInit): Promise<T>` (에러 시 서버 message로 `ApiError` throw)

- [ ] **Step 1: 실패하는 테스트**
  - `signup_rejects_bad_username` : `"AB"`, `"has space"`, `"a".repeat(17)` → 400
  - `signup_requires_over14_and_agree` : 둘 중 하나 false → 400
  - `signup_rejects_duplicate_username` → 409 `"이미 쓰고 있는 아이디예요"`
  - `signup_returns_recovery_code_once` : 응답 `recoveryCode`가 `/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/`, DB `recovery_hash` ≠ 코드 원문, users 테이블에 email/phone 컬럼 없음
  - `login_locks_after_5_failures` : 5번 실패 후 맞는 비밀번호도 423, `locked_until` 경과(시간 주입) 후 200
  - `me_requires_session` : 쿠키 없이 401
- [ ] **Step 2:** `npx vitest run src/worker/auth` → FAIL
- [ ] **Step 3:** 구현. 실패 횟수는 `users.failed_logins`, 5회 도달 시 `locked_until = now + 15분`, 성공 시 0으로 초기화. 존재하지 않는 아이디도 같은 401 문구
- [ ] **Step 4:** `npx vitest run src/worker/auth` → PASS
- [ ] **Step 5:** 화면 : Landing(소개 + 가입 · 로그인 버튼), Signup(Global Constraints 필드 6개, 필드별 오류 문구), RecoveryCode(코드 표시, [복사] [이미지로 저장](canvas → PNG 다운로드), "복구 코드를 저장했어요" 체크해야 [다음] 활성, "이 화면을 닫으면 다시 볼 수 없어요"), Login. `npm run dev`에서 가입 → 코드 화면 → 로그인 수동 확인
- [ ] **Step 6:** 배포 미리보기(`wrangler dev --remote` 또는 Task 14 이후 실제 배포)에서 로그인 1회 CPU 시간이 무료 한도(10ms)를 넘는지 `wrangler tail`로 확인. 넘으면 반복 횟수를 낮추되 저장 형식에 반복 횟수가 들어 있어 기존 해시는 그대로 검증된다. 결과를 커밋 메시지에 기록
- [ ] **Step 7:** Commit `feat: 아이디 · 비밀번호 가입, 로그인, 복구 코드 발급`

### Task 4: 계정 복구

**Files:**
- Create: `src/worker/recovery/routes.ts`, `src/web/pages/Recover.tsx`
- Modify: `src/worker/auth/routes.ts` (로그인 성공 시 진행 중 요청 취소), `src/web/pages/Settings.tsx`는 Task 13에서 재발급 버튼 연결
- Test: `src/worker/recovery/recovery.test.ts`

**Interfaces:**
- Consumes: `hashToken`, `newRecoveryCode`, `hashPassword`, `createSession`
- Produces:
  - `POST /api/recover/code {username, code, newPassword}` → 200 `{ recoveryCode }` (새 코드, 기존 폐기, 세션 발급) / 400 `"아이디 또는 복구 코드가 맞지 않아요"`
  - `POST /api/recovery-code/reissue` (로그인 필요) → `{ recoveryCode }`
  - `POST /api/recover/request {username}` → 201 `{ ticket }` (요청 번호, 원문은 이때만) / 409 `"확인해 줄 입주민이 없어요. 복구 코드로만 되찾을 수 있어요"` / 400 빌라 없음 `"빌라에 살고 있어야 방장 확인을 쓸 수 있어요"`
  - `GET /api/recover/pending` (로그인 필요) → 내가 승인할 요청 목록 `[{id, nickname, createdAt}]`
  - `POST /api/recover/:id/approve` (승인자만)
  - `POST /api/recover/complete {username, ticket, newPassword}` → 200 `{ recoveryCode }` / 425 `"승인 후 24시간이 지나야 바꿀 수 있어요"`
  - `approverFor(env, userId): Promise<string | null>` : 요청자가 방장이 아니면 방장, 방장이면 남은 입주민 중 `joined_at` 가장 이른 사람, 없으면 null

- [ ] **Step 1: 실패하는 테스트**
  - `recover_with_code_rotates_code` : 성공 후 옛 코드로 재시도 400
  - `request_goes_to_owner` / `owner_request_goes_to_oldest_member`
  - `owner_alone_cannot_request` → 409 (Review Focus 4)
  - `complete_before_24h_fails` → 425, 시간 24h 경과 후 200
  - `login_cancels_pending_request` : 요청 후 원래 사용자가 로그인 → status `cancelled`, complete 시 400
  - `only_approver_can_approve` : 다른 입주민 403
- [ ] **Step 2:** `npx vitest run src/worker/recovery` → FAIL
- [ ] **Step 3:** 구현 (현재 시각은 `Date.now()` 대신 주입 가능한 `now()` 헬퍼 사용)
- [ ] **Step 4:** `npx vitest run src/worker/recovery` → PASS
- [ ] **Step 5:** Recover 화면 : [복구 코드로 되찾기] / [복구 코드도 없어요] 두 갈래. 요청 번호 화면에 "방장에게 직접 연락해서 승인해 달라고 말해 주세요. 승인 24시간 뒤에 비밀번호를 바꿀 수 있어요"
- [ ] **Step 6:** Commit `feat: 복구 코드 · 방장 확인 계정 복구`

### Task 5: 빌라

**Files:**
- Create: `src/worker/villa/service.ts`, `routes.ts`, `src/web/pages/VillaNew.tsx`, `Join.tsx`
- Test: `src/worker/villa/villa.test.ts`

**Interfaces:**
- Consumes: `pickPenthouse`, `requireUser`
- Produces:
  - `recomputePenthouse(env, villaId): Promise<string | null>` (활성 입주민 Contender로 `pickPenthouse`, `villas.penthouse_user_id` 갱신)
  - `POST /api/villas {name}` → 201 `{ id, inviteToken }` (만든 사람 = 방장, 1층 입주, 펜트하우스 = 본인). 이미 빌라에 살면 409 `"지금 빌라를 먼저 나가야 해요"`. 이름 1~20자
  - `PATCH /api/villas/:id {name}` (방장만)
  - `POST /api/villas/:id/invite/rotate` (방장만) → `{ inviteToken }`
  - `GET /api/invite/:token` → `{ villaName, memberCount }` (로그인 불필요, 입주 전 미리보기)
  - `POST /api/invite/:token/join` → 200 / 409 `"빌라가 꽉 찼어요"` / 409 빌라 소속 중
  - `POST /api/villas/leave` → 방장 승계, 펜트하우스 재계산, 마지막 1명이면 `dissolved_at`
  - `GET /api/villas/mine` → `{ id, name, ownerId, penthouseUserId, members: [{userId,nickname,sport,avatar,floor,streak,certifiedToday,placements}] }`

- [ ] **Step 1: 실패하는 테스트**
  - `create_makes_owner_and_penthouse`
  - `join_rejects_11th_member` : 10명 후 11번째 409
  - `concurrent_joins_never_exceed_10` : 9명 상태에서 `Promise.all`로 2명 동시 join → 활성 입주민 정확히 10명 (Review Focus 3)
  - `leave_keeps_streak_points_resets_floor` : 층 5 · 연속 20 · 포인트 300인 사람이 나가 다른 빌라 입주 → 층 1, 연속 20, 포인트 300, inventory 유지
  - `owner_leave_passes_to_earliest_joined`
  - `last_leave_dissolves`
  - `penthouse_recomputed_on_leave` : 펜트하우스 주인이 나가면 다음 순위로
  - `rename_owner_only` : 비방장 403
- [ ] **Step 2:** `npx vitest run src/worker/villa` → FAIL
- [ ] **Step 3:** 구현. 입주는 `INSERT INTO memberships … SELECT … WHERE (SELECT COUNT(*) FROM memberships WHERE villa_id=? AND left_at IS NULL) < 10` 한 문장, `changes === 0`이면 409. `one_active_villa` 인덱스 위반은 409로 변환. `certifiedToday`는 `certs`에 오늘(`kstDay(now)`) duplicate=0 photo가 있는지
- [ ] **Step 4:** `npx vitest run src/worker/villa` → PASS
- [ ] **Step 5:** 화면 : VillaNew(빌라 이름 입력 → 초대 링크 복사), Join(`/join/:token` 미리보기 → 로그인 안 했으면 가입으로 보내고 돌아오기 → 입주)
- [ ] **Step 6:** Commit `feat: 빌라 만들기 · 초대 입주 · 나가기 · 방장 승계`

### Task 6: 종목 · 캐릭터

**Files:**
- Create: `src/shared/avatar.ts`, `src/worker/profile/routes.ts`, `src/web/pages/Onboard.tsx`, `src/web/components/Avatar.tsx`
- Test: `src/worker/profile/profile.test.ts`, `src/shared/avatar.test.ts`

**Interfaces:**
- Produces:
  - `AVATAR_OPTIONS = { skin: string[4], hair: ["short","long","bun","buzz"], shirt: string[8] }`, `type AvatarSpec = { skin: number; hair: string; shirt: number }`, `parseAvatar(x: unknown): AvatarSpec | null`
  - `PATCH /api/me {sport?, avatar?, nickname?}` → 잘못된 종목 · 아바타 400
  - `<Avatar spec={AvatarSpec} size={number} pose?: "idle"|"sleep" />` (SVG)

- [ ] **Step 1: 실패하는 테스트** : `parseAvatar({skin:9,...})` null, 정상 값 통과 / `PATCH /api/me {sport:"yoga"}` 400, `{sport:"climbing"}` 200
- [ ] **Step 2:** 실행 → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** 실행 → PASS
- [ ] **Step 5:** Onboard 화면 : "어떤 운동을 하시나요?" 카드 5개(필수) → 캐릭터 꾸미기(미리보기 즉시 반영) → 빌라로. 빌라 입주 직후 `sport`가 없으면 자동으로 이 화면
- [ ] **Step 6:** Commit `feat: 종목 선택 · 캐릭터 꾸미기`

### Task 7: 오운완 인증

**Files:**
- Create: `src/web/image/compress.ts`, `src/web/image/dhash.ts`, `src/worker/cert/routes.ts`, `src/web/pages/Certify.tsx`
- Test: `src/worker/cert/cert.test.ts`, `src/web/image/dhash.test.ts`

**Interfaces:**
- Consumes: `kstDay`, `photoPoints`, `routinePoints`
- Produces:
  - `compressImage(file: File): Promise<Blob>` (Global Constraints 압축 규칙, 실패 시 `throw new ImageDecodeError()`)
  - `dhashFromGray(gray: Uint8Array /* 9x8 */): string` (16자 hex), `dhashFromBlob(b: Blob): Promise<string>`, `hamming(a: string, b: string): number`
  - `POST /api/certs/photo` multipart `{file, dhash}` → `{ certId, points, duplicate, certifiedToday }` / 413 파일 300KB 초과 / 415 JPEG 아님
  - `POST /api/certs/routine {body}` (1~1000자) → `{ certId, points }`
  - `GET /api/users/:id/board?before=<ms>&limit=20` → `[{id, kind, day, body?, photoUrl?, hidden, createdAt}]` (같은 빌라 현재 입주민만, 아니면 403)
  - `GET /api/photos/:certId` → R2 이미지 스트림 (같은 빌라 현재 입주민만, hidden이면 404)

- [ ] **Step 1: 실패하는 테스트**
  - `dhash` : 같은 배열 → 같은 hash, 한 픽셀 차이 → hamming ≤ 2
  - `points_decrease_per_photo` : 같은 날 서로 다른 dhash 4장 → points `[20,10,5,0]`
  - `duplicate_photo_no_points_no_cert` : 이전 사진과 hamming 3 → `duplicate:true, points:0`, 그날 다른 사진 없으면 `certifiedToday:false`
  - `routine_once_per_day_points` : 두 번째 루틴 points 0
  - `day_boundary_uses_upload_time` : 시각 주입 23:59:50 KST → day 그날, 00:00:05 → 다음 날 (Review Focus 1)
  - `board_forbidden_to_other_villa` : 다른 빌라 사용자 403, `photos` 403
  - `board_visible_after_move` : 사용자가 B 빌라로 옮기면 B 입주민 200, A 입주민 403
- [ ] **Step 2:** `npx vitest run src/worker/cert src/web/image` → FAIL
- [ ] **Step 3:** 구현. 중복 판정은 그 사용자의 기존 photo cert 전체 dhash와 비교. R2 키 `photos/<userId>/<certId>.jpg`. 포인트는 `users.points`에 즉시 가산. `nth`는 그날 duplicate=0 photo 개수 + 1
- [ ] **Step 4:** 실행 → PASS
- [ ] **Step 5:** Certify 화면 : 사진 선택(여러 장) → 압축 · 해시 → 업로드 진행 표시 → "불이 켜졌어요. +20P" / 중복 안내 / `ImageDecodeError`면 "이 사진은 열 수 없어요. 다른 사진을 골라 주세요" (Review Focus 5). 루틴 글 입력칸(선택, "루틴을 적으면 +10P")
- [ ] **Step 6:** Commit `feat: 오운완 사진 · 루틴 인증과 포인트`

### Task 8: 자정 정산

**Files:**
- Create: `src/worker/cron/settle.ts`
- Modify: `src/worker/index.ts` (`scheduled`에서 `settle(env, kstDay(Date.now() - 60_000))` 호출 → 방금 끝난 날)
- Test: `src/worker/cron/settle.test.ts`

**Interfaces:**
- Consumes: `settleDay`, `recomputePenthouse`
- Produces: `settle(env: Env, day: string): Promise<{ settled: boolean }>` — `settings.last_settled_day >= day`면 아무것도 안 하고 `{settled:false}`

- [ ] **Step 1: 실패하는 테스트**
  - `settles_all_users` : 인증한 사용자 streak+1, 안 한 사용자 streak 0 · 층 −1
  - `idempotent` : 같은 day로 두 번 호출 → 두 번째 `{settled:false}`, 값 변화 없음 (Review Focus 2)
  - `floor_up_sets_floor_reached_at`
  - `penthouse_recomputed_for_each_villa`
  - `user_without_villa_keeps_streak`
  - `duplicate_only_day_counts_as_missed`
- [ ] **Step 2:** 실행 → FAIL
- [ ] **Step 3:** 구현. 모든 사용자를 읽어 `settleDay` 적용, 변경분을 `env.DB.batch()`로 한 번에 기록(D1 무료 한도 고려 : 10명 규모라 한 batch), 마지막에 `last_settled_day = day`
- [ ] **Step 4:** 실행 → PASS
- [ ] **Step 5:** Commit `feat: 자정 정산 (연속 기록 · 층 · 펜트하우스)`

### Task 9: 빌라 화면

**Files:**
- Create: `src/web/pages/Villa.tsx`, `src/web/components/Building.tsx`, `RoomTile.tsx`, `RoomScene.tsx`
- Test: `src/web/components/Building.test.tsx` (vitest + @testing-library/react, jsdom 환경 별도 project)

**Interfaces:**
- Consumes: `GET /api/villas/mine`, `<Avatar>`, `SPORT_LABEL`
- Produces: `layoutFloors(members): Array<{ floor: number | "PH"; members: Member[] } | { gap: [number, number] }>` (`Building.tsx`에서 export)

- [ ] **Step 1: 실패하는 테스트** : `layoutFloors` — 펜트하우스 주인은 PH 행 1개에만, 나머지는 층 내림차순, 빈 층 연속 구간은 `{gap:[9,11]}` 하나로 접힘, 1층에 빈방 자리 수 = 10 − 입주민 수
- [ ] **Step 2:** 실행 → FAIL
- [ ] **Step 3:** 구현. 시안의 구성(PH 금색 테두리, 층 라벨, 불 켜짐 방 = 노란 배경 + 종목별 운동 애니메이션, 꺼진 방 = 어두운 배경 + 자는 캐릭터, `prefers-reduced-motion` 존중)을 React 컴포넌트로 옮긴다. 상단 : 빌라 이름, `입주 n/10명`, `오늘 완료 n명`, 내 방이 꺼져 있으면 [오늘 오운완 인증하기] 버튼
- [ ] **Step 4:** 실행 → PASS, `npm run dev`에서 시드 데이터로 시안과 같은 모습인지 확인 (모바일 폭 390px 포함)
- [ ] **Step 5:** Commit `feat: 빌라 화면`

### Task 10: 방 상세 · 게시판

**Files:**
- Create: `src/web/pages/Room.tsx`, `src/web/components/Board.tsx`
- Test: `src/web/components/Board.test.tsx`

**Interfaces:**
- Consumes: `GET /api/users/:id/board`, `GET /api/photos/:certId`, `placements`(Task 11 전에는 빈 배열)
- Produces: `/room/:userId` 화면

- [ ] **Step 1: 실패하는 테스트** : `Board`에 사진 2 · 루틴 1 전달 → 폴라로이드 2개 · 메모지 1개, 최근순, 방 화면 모드에서는 최대 6개, hidden 사진은 "가려진 사진" 자리표시
- [ ] **Step 2:** 실행 → FAIL
- [ ] **Step 3:** 구현. 방 = 왼쪽 벽 게시판(고정) + 오른쪽 · 뒷벽 2자리 + 바닥 3자리 + 캐릭터. 게시판 누르면 전체 기록(날짜별 묶음, 20개씩 더 보기)
- [ ] **Step 4:** 실행 → PASS
- [ ] **Step 5:** Commit `feat: 방 상세와 왼쪽 벽 게시판`

### Task 11: 가구 상점 · 배치

**Files:**
- Create: `src/shared/catalog.ts`, `src/worker/shop/routes.ts`, `src/web/pages/Shop.tsx`
- Test: `src/worker/shop/shop.test.ts`

**Interfaces:**
- Produces:
  - `type Slot = "floor1"|"floor2"|"floor3"|"wall1"|"wall2"`, `type Item = { id: string; name: string; sport: Sport | "common"; slotType: "floor"|"wall"; price: number }`, `CATALOG: Item[]` — **임시 목록**, 종목별 3개 + 공용 2개, 가격 60~200P. 파일 상단 주석 `// 기획자 확정 전 임시 목록`
  - `POST /api/shop/buy {itemId}` → `{ points }` / 400 `"포인트가 모자라요"` / 409 이미 보유
  - `PUT /api/placements {slot, itemId|null}` → slotType 불일치 400, 미보유 400
- [ ] **Step 1: 실패하는 테스트** : 포인트 부족 400 · 구매 시 차감 · 중복 구매 409 · 벽 가구를 바닥 자리에 400 · 미보유 배치 400 · 다른 종목 가구 구매 가능(상점은 내 종목 + 공용을 먼저 보여 줄 뿐)
- [ ] **Step 2:** 실행 → FAIL
- [ ] **Step 3:** 구현 + 가구 SVG(종목별 3개 + 공용 2개)를 `RoomScene`에 연결
- [ ] **Step 4:** 실행 → PASS
- [ ] **Step 5:** Commit `feat: 가구 상점과 배치 (임시 가구 목록)`

### Task 12: 신고

**Files:**
- Create: `src/worker/report/routes.ts`
- Modify: `src/web/components/Board.tsx` (사진 메뉴에 [신고] · 방장에게 [삭제])
- Test: `src/worker/report/report.test.ts`

**Interfaces:**
- Produces: `POST /api/certs/:id/report` → `{ hidden }` (같은 빌라 입주민만, 본인 사진 신고 400, 같은 사람 중복 신고 무시), `DELETE /api/certs/:id` (방장 또는 작성자) → R2 객체 삭제 + 행 삭제. 포인트는 회수하지 않는다
- [ ] **Step 1: 실패하는 테스트** : 3명 신고 시 hidden=1 · 같은 사람 2번은 1건 · 다른 빌라 403 · 방장 삭제 시 R2 객체 없음 · 일반 입주민이 남의 사진 삭제 403
- [ ] **Step 2:** 실행 → FAIL
- [ ] **Step 3:** 구현
- [ ] **Step 4:** 실행 → PASS
- [ ] **Step 5:** Commit `feat: 사진 신고와 방장 삭제`

### Task 13: 알림 배지 · 설정 · 약관

**Files:**
- Create: `src/worker/badges/routes.ts`, `src/web/components/Badge.tsx`, `src/web/pages/Settings.tsx`, `Terms.tsx`, `Privacy.tsx`
- Test: `src/worker/badges/badges.test.ts`

**Interfaces:**
- Produces: `GET /api/badges` → `{ recoveryApprovals: number }`; 설정 화면 항목 : 닉네임, 종목, 캐릭터, 비밀번호 변경(`POST /api/me/password {current, next}`), 복구 코드 재발급, 빌라 이름(방장), 초대 링크 재생성(방장), 빌라 나가기(확인 화면 "층은 1층부터 다시 시작해요"), 로그아웃, 탈퇴(`DELETE /api/me` : 계정 · 사진 · 루틴 · R2 객체 즉시 삭제, 빌라에서 나가기 처리)
- [ ] **Step 1: 실패하는 테스트** : 승인 대기 2건 → `recoveryApprovals: 2` · 비밀번호 변경 시 현재 비밀번호 틀리면 400 · 탈퇴 후 R2에 해당 사용자 객체 0개, 빌라 방장 승계됨
- [ ] **Step 2:** 실행 → FAIL
- [ ] **Step 3:** 구현. Terms · Privacy는 "운영자 명의 · 시행일은 2차 공개 전 확정" 자리표시 문구와 수집 항목(아이디, 비밀번호 해시, 닉네임, 인증 사진 · 루틴) · 보관 기간(탈퇴 시 즉시 삭제)만 우선 기재
- [ ] **Step 4:** 실행 → PASS
- [ ] **Step 5:** Commit `feat: 알림 배지, 설정, 탈퇴, 약관 자리`

### Task 14: 배포 · 오픈 점검

**Files:**
- Create: `docs/launch-checklist.md`, `.github/workflows/deploy.yml`
- Modify: `README.md`

- [ ] **Step 1:** 기획자 Cloudflare 계정에서 D1(`ownwan-villa`) · R2(`ownwan-villa-photos`) 생성, `wrangler.jsonc`에 database_id 기입, `wrangler d1 migrations apply ownwan-villa --remote`
- [ ] **Step 2:** `.github/workflows/deploy.yml` : main 푸시 시 `npm ci && npx vitest run && npx wrangler deploy` (시크릿 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`)
- [ ] **Step 3:** 배포 후 `https://ownwan-villa.<계정>.workers.dev`에서 점검표 실행 : 휴대폰 2대로 가입 → 복구 코드 → 빌라 만들기 → 초대 링크 입주 → 종목 · 캐릭터 → 사진 인증(아이폰 · 안드로이드 각각) → 불 켜짐 확인 → 상점 구매 · 배치 → 신고 → 나가기 · 재입주 → 다음 날 자정 정산 결과 확인(`wrangler tail`)
- [ ] **Step 4:** Cloudflare 대시보드에서 사용량 알림 설정(R2 저장량, Workers 요청 수) 방법을 `launch-checklist.md`에 기록
- [ ] **Step 5:** Commit `chore: 배포 파이프라인과 오픈 점검표`

---

## Spec 대비 1차 범위 밖 (2차)

빈방 모집 · 입주 신청, 도시 지도 · 공개 설정(`villas.public` 컬럼만 미리 둠), 사진 저장량 90% 업로드 차단, 가구 추가. 집값 대결 · 아파트 · 후원은 다음 버전.
