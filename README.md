# Onebybeyond

[onebybeyond.org](https://onebybeyond.org) 웹사이트 소스입니다.

## 구조

```
site/            ← 웹사이트에 올라가는 파일 전부 (이 폴더가 그대로 배포됨)
  index.html     ← 메인 페이지
  404.html       ← 없는 주소로 들어왔을 때 페이지
  assets/        ← 이미지, CSS, JS 등
  CNAME          ← 커스텀 도메인 (onebybeyond.org)
.github/workflows/deploy.yml  ← main 브랜치에 push 하면 GitHub Pages로 자동 배포
```

## 처음 한 번만 해야 하는 설정

### 1. GitHub Pages 켜기
GitHub 저장소 → **Settings → Pages**
- **Source**: `GitHub Actions` 선택
- **Custom domain**: `onebybeyond.org` 입력 후 Save
- DNS 확인이 끝나면 **Enforce HTTPS** 체크

### 2. 도메인 DNS 설정 (도메인 산 곳의 DNS 관리 화면에서)

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
