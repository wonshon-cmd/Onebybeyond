# Onebybeyond

[onetobeyond.org](https://onetobeyond.org) 웹사이트 소스입니다.

## 구조

```
site/                ← 웹사이트에 올라가는 파일 전부 (이 폴더가 그대로 배포됨)
  index.html         ← 페이지 뼈대
  content.json       ← 편지 글·기도제목·사진 경로 (글 수정은 여기서)
  style.css          ← 승인된 디자인 (Off-white Editorial Letter)
  site.css           ← 공개용으로 추가한 작은 스타일
  app.js             ← 화면 그리기, 하트/아멘/공유/사진/목차
  assets/            ← 로고, 파비콘, 사진
  404.html, CNAME
design-package/      ← 받은 인계 패키지 원본 (배포되지 않음)
  reference/approved-design.html  ← 디자인 최우선 기준
  admin.html         ← 관리자 기능 참고 데모
  AI-HANDOFF-KO.txt, DESIGN-SYSTEM.md, README-KO.md
.github/workflows/deploy.yml  ← main 브랜치에 push 하면 GitHub Pages로 자동 배포
```

## 현재 공개 버전에서 되는 것 / 안 되는 것

| 기능 | 상태 |
|------|------|
| 표지 → 본문 한 페이지 스크롤, 목차, 소식지 선택, 글자 크기 | 동작 |
| 이야기 끝 하트, 기도제목 아멘 토글 | 동작 — 단, **방문자 본인 브라우저에만 저장** (모두가 함께 보는 숫자 아님) |
| 공유 (휴대폰 공유 메뉴 / 링크 복사) | 동작 |
| 사진 갤러리 크게 보기 | 동작 |
| 유튜브 ‘무명’ 미리보기 + YouTube로 이동 | 동작 |
| 마음 나눔 (Google 로그인 후 이름과 함께 글 남기기, 공개/비공개 선택) | 코드 완료 — **아래 Supabase 설정 후 켜짐**. 설정 전에는 "준비 중"으로 표시 |
| 관리자 편집, 연락처·발송 | **아직 없음** |
| 후원/결제 | 넣지 않음 (요청사항) |

## 로컬에서 미리 보기
```
cd site && python3 -m http.server 8000
```
브라우저에서 http://localhost:8000 (파일을 더블클릭해서 열면 content.json을 못 읽어요)

## 처음 한 번만 해야 하는 설정

### 1. GitHub Pages 켜기
GitHub 저장소 → **Settings → Pages**
- **Source**: `GitHub Actions` 선택
- **Custom domain**: `onetobeyond.org` 입력 후 Save
- DNS 확인이 끝나면 **Enforce HTTPS** 체크

### 2. 도메인 DNS 설정 (Squarespace)

1. https://account.squarespace.com/domains 로그인 → `onetobeyond.org` 선택
2. 왼쪽 메뉴 **DNS** → **DNS Settings**
3. **Squarespace Defaults** 묶음이 있으면 오른쪽 휴지통으로 삭제 (Squarespace 사이트를 안 쓰므로)
4. **Domain Forwarding**(도메인 포워딩)이 켜져 있으면 끄기
5. **Custom records** → **Add record** 로 아래 9개 추가 (Host 칸에 `@` 그대로 입력)

Squarespace에서 이메일(Google Workspace 등)을 쓰고 있다면 MX/TXT 레코드는 지우지 마세요.

| Type  | Host / Name | Value                    |
|-------|-------------|--------------------------|
| A     | `@`         | `185.199.108.153`        |
| A     | `@`         | `185.199.109.153`        |
| A     | `@`         | `185.199.110.153`        |
| A     | `@`         | `185.199.111.153`        |
| AAAA  | `@`         | `2606:50c0:8000::153`    |
| AAAA  | `@`         | `2606:50c0:8001::153`    |
| AAAA  | `@`         | `2606:50c0:8002::153`    |
| AAAA  | `@`         | `2606:50c0:8003::153`    |
| CNAME | `www`       | `wonshon-cmd.github.io`  |

기존에 `@` 에 걸려있는 기본 A 레코드(주차 페이지 등)는 삭제하세요.
DNS 반영에는 몇 분~최대 48시간 걸릴 수 있습니다.

## 업데이트 방법
`site/` 안의 파일을 수정해서 `main` 에 push 하면 1~2분 안에 자동으로 반영됩니다.

## 마음 나눔(댓글) 켜기 — Supabase + Google 로그인

방문자는 Google로 로그인해야 글을 남길 수 있고, 글마다 **공개**(모두에게 보임) 또는 **비공개**(쓴 사람과 관리자만 보임)를 고릅니다.
비공개 여부는 브라우저가 아니라 데이터베이스 규칙(RLS)이 막기 때문에, 다른 사람이 비공개 글을 몰래 볼 수 없습니다.

### 1. Supabase 프로젝트 만들기
1. https://supabase.com 가입 → **New project** (지역: 가까운 곳, 비밀번호는 따로 보관)
2. 왼쪽 **SQL Editor** → `supabase/schema.sql` 내용을 전부 붙여넣고 **Run**
3. 같은 곳에서 관리자(비공개 글을 볼 사람) Google 이메일 등록:
   ```sql
   insert into public.admins (email) values ('관리자이메일@gmail.com');
   ```

### 2. Google 로그인 연결
1. https://console.cloud.google.com → 새 프로젝트
2. **APIs & Services → OAuth consent screen**: External, 앱 이름 `One to Beyond`, 이메일 입력 → 저장 후 **Publish app**
3. **Credentials → Create credentials → OAuth client ID** → Web application
   - Authorized redirect URIs: `https://<프로젝트ID>.supabase.co/auth/v1/callback`
     (Supabase → Authentication → Providers → Google 화면에 정확한 주소가 나옵니다)
4. 만들어진 **Client ID / Client secret**을 Supabase → **Authentication → Providers → Google**에 붙여넣고 Enable
5. Supabase → **Authentication → URL Configuration**
   - Site URL: `https://onetobeyond.org`
   - Redirect URLs: `https://onetobeyond.org/**` 추가

### 3. 사이트에 연결
Supabase → **Project Settings → API**의 `Project URL`과 `anon public` 키를 `site/config.js`에 넣고 `main`에 반영합니다.
(anon 키는 공개해도 되는 키입니다. `service_role` 키는 절대 넣지 마세요.)
