-- 카카오 로그인 · 가입 [확정 — 기획자 결정, 2026-11-19]
-- 카카오에서는 회원번호(id)만 받는다. 이메일 · 전화번호 · 프로필 · 카카오 토큰은 저장하지 않는다.
-- 카카오로만 가입한 계정은 users 표를 고치지 않고 표현한다:
--   username      = 'kakao_' + 무작위 hex (가입 아이디 규칙 [a-z0-9]{4,16} 에 '_'가 없어 직접 만든 아이디와 겹치지 않고, 화면에 보여 주지 않는다)
--   password_hash = '!kakao-only' (pbkdf2 형식이 아니라 어떤 비밀번호로도 맞지 않는다)
--   recovery_hash = '!kakao-only' (SHA-256 hex 와 같아질 수 없다)
CREATE TABLE user_identities (
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_user_id)
);
-- 한 계정에는 카카오 계정 하나만 연결한다
CREATE UNIQUE INDEX user_identities_user_provider ON user_identities(user_id, provider);

-- 카카오 로그인 시작 때 만든 state (한 번만 쓰고 10분 뒤 만료). 원문은 쿠키에만 있고 여기에는 해시만 둔다
CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('login','link')),
  user_id TEXT,
  next TEXT,
  expires_at INTEGER NOT NULL
);

-- 처음 온 카카오 회원번호: 닉네임을 정할 때까지 10분 동안만 들고 있는다 (토큰 원문은 쿠키에만)
CREATE TABLE kakao_pending (
  token_hash TEXT PRIMARY KEY,
  kakao_id TEXT NOT NULL,
  next TEXT,
  expires_at INTEGER NOT NULL
);
