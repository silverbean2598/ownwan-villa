#!/usr/bin/env node
// 휴대폰 푸시 알림용 VAPID 키 쌍을 새로 만든다 (Node 18+ 의 WebCrypto 만 쓴다).
// 사용: node scripts/gen-vapid.mjs
// 출력한 두 값을 GitHub 저장소 Settings → Secrets and variables → Actions 에
// VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY 로 넣는다. 비밀키는 저장소 · 채팅 · 이슈에 붙이지 않는다.
// 키를 바꾸면 이미 켠 기기는 다음에 설정 화면을 열 때 새 키로 다시 구독한다 (그 전까지는 알림이 가지 않는다).

const { subtle } = globalThis.crypto;

const b64url = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const kp = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const publicKey = b64url(await subtle.exportKey("raw", kp.publicKey)); // 65바이트 (0x04 | x | y)
const privateKey = (await subtle.exportKey("jwk", kp.privateKey)).d; // 32바이트 d (이미 base64url)

process.stdout.write(`VAPID_PUBLIC_KEY=${publicKey}\nVAPID_PRIVATE_KEY=${privateKey}\n`);
process.stderr.write(
  "\n위 두 줄을 GitHub Actions secret 으로 넣어 주세요 (이름은 = 앞, 값은 = 뒤).\n" +
    "로컬 개발에서 쓰려면 .dev.vars 파일에 그대로 붙여 넣으면 돼요 (.dev.vars 는 커밋하지 않아요).\n",
);
