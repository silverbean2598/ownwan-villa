# 안드로이드 앱 (플레이스토어, TWA)

오운완아파트 웹앱을 그대로 감싸는 안드로이드 앱이다 (Trusted Web Activity). 앱 안 화면은 사이트 그대로라 **웹을 배포하면 앱도 바로 바뀐다.** 앱을 다시 올려야 하는 건 이름 · 아이콘 · 주소 · 패키지 설정이 바뀔 때뿐이다.

## 구성
| 항목 | 값 |
| --- | --- |
| 패키지 이름 | `com.ownwanvilla.app` (바꿀 수 없음) |
| 여는 주소 | `android/twa-manifest.json` 의 `host` (지금 `ownwan-villa.silverbin2598.workers.dev`) |
| 앱 프로젝트 | `android/` (Bubblewrap 1.27 로 생성) |
| 사이트 연결 파일 | `public/.well-known/assetlinks.json` |
| 빌드 | GitHub Actions `android` 워크플로 |

## 서명 키 두 가지
- **업로드 키**: 우리가 가진 키. Play Console 에 AAB 를 올릴 때 쓴다. GitHub Secret `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_UPLOAD_KEYSTORE_PASSWORD` 에 들어 있다. 원본 파일은 기획자가 따로 보관한다. 저장소에는 절대 커밋하지 않는다 (`android/.gitignore`).
- **앱 서명 키**: Google 이 보관하는 키 (Play 앱 서명). 사용자 휴대폰에 설치되는 앱은 이 키로 서명된다.

`assetlinks.json` 에는 **두 키의 SHA-256 지문이 모두** 있어야 한다. 앱 서명 키 지문은 Play Console → 앱 → 테스트 및 출시 → 설정 → 앱 무결성 → 앱 서명 에서 복사해 `sha256_cert_fingerprints` 에 추가하고, `android/twa-manifest.json` 의 `fingerprints` 에도 같이 적는다 (테스트 `src/shared/assetlinks.test.ts` 가 둘을 맞춰 본다). 빠지면 앱 위쪽에 주소창이 보인다.

## AAB 만들기
1. GitHub 저장소 Actions → **android** → Run workflow.
2. 처음 올릴 때는 버전 코드 칸을 비워 둔다 (1). 다음부터는 올릴 때마다 1씩 올려 적는다 (2, 3, …). 버전 이름은 1.0.1 처럼.
3. 끝나면 실행 화면 아래 Artifacts 의 `ownwan-villa-aab` 를 내려받아 압축을 풀고 `.aab` 를 Play Console 에 올린다 (7일 뒤 지워짐).
4. 버전 코드를 올렸다면 같은 값을 `android/app/build.gradle` 의 `versionCode` 와 `android/twa-manifest.json` 의 `appVersionCode` 에도 커밋해 둔다.

## 주소(도메인)를 바꿀 때
1. `android/twa-manifest.json` 의 `host`, `iconUrl`, `maskableIconUrl`, `webManifestUrl`, `fullScopeUrl` 을 새 주소로.
2. 같은 값을 `android/app/build.gradle` 의 `hostName` · `webManifestUrl`, `android/app/src/main/res/values/strings.xml` 의 `site` 에도 반영한다 (또는 `npx @bubblewrap/cli update --skipVersionUpgrade` 로 다시 생성).
3. 새 주소에서도 `/.well-known/assetlinks.json` 이 열리는지 확인하고, 버전 코드를 올려 새 AAB 를 올린다.
4. 카카오 콘솔의 사이트 도메인 · Redirect URI 도 새 주소로.

## 확인
- `https://<주소>/.well-known/assetlinks.json` 이 JSON 으로 열리는지.
- Google 확인 도구: `https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://<주소>&relation=delegate_permission/common.handle_all_urls`
- 내부 테스트로 설치해서 위쪽에 주소창이 안 보이면 연결 성공.
