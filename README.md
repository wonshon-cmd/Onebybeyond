# One to Beyond

[onetobeyond.org](https://onetobeyond.org) — 코트디부아르에서 보내는 기도편지 사이트.

- 호스팅: **Netlify** (`site/` 폴더를 그대로 올림)
- 데이터·로그인·사진: **Supabase** (무료 요금제)
- 도메인: Squarespace (A `@` → `75.2.60.5`, CNAME `www` → Netlify 주소)

## 구조

```
site/                     ← Netlify에 올리는 폴더 전체
  index.html, app.js      ← 방문자 화면
  render.js               ← 소식지 화면 그리기 (방문자 화면과 관리자 미리보기가 함께 씀)
  sb.js                   ← Supabase 연결
  community.js            ← 마음 나눔 (Google 로그인, 공개/비공개)
  config.js               ← Supabase 주소와 공개 키 (여기만 채우면 연결됨)
  content.json            ← Supabase 연결 전·장애 시 보여줄 기본 소식지
  style.css               ← 승인된 Off-white Editorial Letter 디자인
  site.css                ← 추가 스타일
  admin/                  ← 관리자 화면 (onetobeyond.org/admin)
  _headers                ← Netlify 보안 헤더
supabase/
  schema.sql              ← 데이터베이스 표와 권한 규칙
  seed.sql                ← 첫 번째 소식지 넣기
  functions/send-newsletter/index.ts ← 이메일 발송 함수
design-package/           ← 받은 인계 패키지 원본 (배포 안 함)
```

## 기능

| 기능 | 상태 |
|---|---|
| 표지 → 본문 스크롤, 목차, 소식지 선택, 글자 크기 | 동작 |
| 이야기 끝 하트, 기도제목 ✧ 아멘 ↔ ✓ 함께 기도했어요 | 동작 (방문자 각자 브라우저에 기억) |
| 공유 (휴대폰 공유 창 / 링크 복사) | 동작 |
| 사진 갤러리, 이야기별 사진, 유튜브 미리보기 | 동작 |
| 새 소식 받기 (이메일 구독 신청) | Supabase 연결 후 |
| 마음 나눔 (Google 로그인, 공개/비공개) | Supabase + Google 설정 후 |
| 관리자: 접속 코드 로그인, 소식지 작성·편집·서식, 초안/공개 분리, 미리보기, 사진 업로드, 순서·첫 화면 선택 | Supabase 연결 후 |
| 관리자: 주소록, 그룹, 새 구독자, 수신자 선택 | Supabase 연결 후 |
| 이메일 발송 | Supabase + Resend 설정 후 |
| 카카오톡 | 공유 창으로 직접 보내기 (자동 일괄 발송은 비즈메시지 계약 필요 — 미연결) |
| 후원/결제 | 넣지 않음 |

## Supabase 연결 (한 번만)

1. **SQL Editor** → New query → `supabase/schema.sql` 전체 붙여넣기 → **Run**
2. 다시 New query → `supabase/seed.sql` 붙여넣기 → **Run** (첫 번째 소식지가 들어갑니다)
3. **Authentication → Users → Add user → Create new user**
   - Email: `admin@onetobeyond.org` / Password: **관리자 접속 코드** / **Auto Confirm User** 체크
   - 이 비밀번호가 곧 `onetobeyond.org/admin` 접속 코드입니다. 코드는 관리자 화면 ‘설정’에서 바꿀 수 있어요.
4. **Authentication → URL Configuration**: Site URL `https://onetobeyond.org`, Redirect URLs에 `https://onetobeyond.org/**`
5. **Authentication → Sign In / Providers → Email**: ‘Confirm email’은 켜 둔 채로 두세요.
6. **Project Settings → API**의 `Project URL`과 `anon public` 키를 `site/config.js`에 넣고 Netlify에 다시 올립니다.
   (`anon` 키는 공개용입니다. `service_role` 키는 절대 넣지 마세요.)

## 마음 나눔 Google 로그인 켜기

1. https://console.cloud.google.com → 새 프로젝트 → **APIs & Services → OAuth consent screen** (External, 앱 이름 `One to Beyond`) → Publish
2. **Credentials → Create credentials → OAuth client ID → Web application**
   - Authorized redirect URI: `https://<프로젝트ID>.supabase.co/auth/v1/callback` (Supabase의 Google 설정 화면에 정확한 주소가 나옵니다)
3. Client ID / Secret을 Supabase **Authentication → Providers → Google**에 넣고 Enable

비공개 글은 쓴 사람과 `admins` 표에 있는 이메일(관리자 화면 ‘설정’)만 볼 수 있어요.

## 이메일 발송 켜기

1. https://resend.com 가입 → **Domains → Add domain** `onetobeyond.org` → 안내되는 DNS 레코드를 Squarespace에 추가
   - 이때 Squarespace의 **Email Security** 묶음(`v=spf1 -all`, DMARC `p=reject`)이 발송을 막으므로 Resend 안내에 맞게 바꿔야 합니다.
2. Resend **API Keys** → 키 만들기
3. Supabase **Edge Functions → Deploy a new function → Via editor** → 이름 `send-newsletter` → `supabase/functions/send-newsletter/index.ts` 내용 붙여넣기 → Deploy
4. Supabase **Edge Functions → Secrets**: `RESEND_API_KEY` = 키, `MAIL_FROM` = `One to Beyond <letters@onetobeyond.org>`

## 배포 (Netlify)

`site/` 폴더를 https://app.netlify.com 의 프로젝트 **Deploys** 화면에 끌어다 놓으면 새 버전이 올라갑니다.

## 로컬에서 미리 보기

```
cd site && python3 -m http.server 8000
```
http://localhost:8000 (관리자: http://localhost:8000/admin/)
