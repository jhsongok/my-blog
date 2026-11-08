# CLAUDE.md

이 파일은 이 저장소에서 작업하는 Claude Code에게 프로젝트 맥락과 규칙을 알려줍니다.

## 프로젝트 개요

`posts/` 폴더의 마크다운(`.md`) 파일을 읽어 브라우저에서 블로그 웹사이트로 렌더링하는 정적 사이트입니다.

- **순수 HTML / CSS / JavaScript만 사용합니다.** React, Vue, Svelte 같은 프레임워크나 Tailwind, Bootstrap 같은 CSS 프레임워크를 쓰지 않습니다.
- 번들러(Webpack, Vite 등)와 빌드 단계가 없습니다. 파일을 수정하고 새로고침하면 바로 반영됩니다.
- 외부 npm 의존성을 추가하지 않습니다. 마크다운 파서도 `js/markdown.js`에 직접 구현합니다.
- 예외적으로 글 목록 생성 스크립트(`scripts/build-index.mjs`)만 Node로 실행하며, 이것도 내장 모듈만 씁니다.
- 정적 호스팅(GitHub Pages, Netlify 등)에 그대로 올릴 수 있어야 합니다.

## 디렉터리 구조

```
my-blog/
├── index.html          # 단일 진입점 (SPA)
├── css/
│   └── style.css       # 전체 스타일 (CSS 변수 기반 테마)
├── js/
│   ├── app.js          # 라우팅, 글 목록/본문 로딩, 화면 렌더링
│   ├── markdown.js     # 마크다운 → HTML 변환기 (직접 구현)
│   └── theme.js        # 다크 모드 토글 및 저장
├── posts/
│   ├── index.json      # 글 목록 매니페스트 (스크립트로 생성)
│   └── *.md            # 블로그 글
└── scripts/
    └── build-index.mjs # posts/*.md의 front matter로 index.json 생성 (Node, 의존성 없음)
```

새 파일이 필요하면 이 구조를 따르고, 구조를 바꾸면 이 섹션도 함께 업데이트합니다.

## 로컬 실행

브라우저는 `file://` 경로에서 `fetch()`로 `.md` 파일을 읽지 못하므로 반드시 로컬 서버로 실행합니다.

```bash
python -m http.server 8000
```

또는

```bash
npx serve .
```

그 후 `http://localhost:8000` 접속.

## 동작 방식

1. `index.html`이 로드되면 `js/app.js`가 `posts/index.json`을 `fetch`해 글 목록을 가져옵니다.
2. 라우팅은 **해시 기반**입니다 (정적 호스팅에서 서버 설정 없이 동작하도록).
   - `#/` → 글 목록 (날짜 내림차순)
   - `#/post/<slug>` → `posts/<slug>.md`를 불러와 렌더링
   - `#/tag/<태그>` → 해당 태그 글 목록
3. 마크다운 본문은 `js/markdown.js`로 HTML 변환 후 `<article>`에 삽입합니다.
4. 존재하지 않는 slug나 fetch 실패 시 친절한 "글을 찾을 수 없습니다" 화면을 보여줍니다.

### 글 작성 형식

각 `.md` 파일은 YAML 형식의 front matter로 시작합니다.

```markdown
---
title: 첫 번째 글
date: 2026-11-08
tags: [일상, 개발]
description: 목록에 표시될 짧은 요약
---

본문 내용...
```

`posts/index.json`은 **직접 고치지 않고** 스크립트로 만듭니다. 글을 추가·수정·삭제한 뒤 실행합니다.

```bash
node scripts/build-index.mjs
```

- 모든 `posts/*.md`의 front matter를 읽어 날짜 내림차순으로 `index.json`을 다시 씁니다.
- front matter 파싱은 `js/markdown.js`의 `parseFrontMatter`를 그대로 재사용합니다 (브라우저와 같은 규칙).
- `title`이 없거나, `date`가 `YYYY-MM-DD`가 아니거나, 파일 이름이 규칙에 맞지 않으면 오류를 출력하고 `index.json`을 건드리지 않습니다.
- `draft: true`인 글은 목록에서 제외됩니다.

`slug`는 파일 이름(확장자 제외)이며, 영문 소문자·숫자·하이픈만 사용합니다.

### 마크다운 지원 범위 (`js/markdown.js`)

다음 문법을 지원해야 합니다.

- 제목 `#` ~ `######`, 문단, 줄바꿈
- **굵게**, *기울임*, ~~취소선~~, `인라인 코드`
- 링크 `[text](url)`, 이미지 `![alt](src)`
- 순서 있는/없는 목록 (중첩 포함), 인용문 `>`
- 코드 블록 ```` ```lang ```` (언어 클래스 `language-xxx` 부여), 수평선 `---`
- 표 (GFM 스타일)

**보안:** 변환 전에 원문의 `<`, `>`, `&`를 이스케이프하고, 링크/이미지 URL에서 `javascript:` 스킴을 차단합니다. `innerHTML`에 넣기 전에 반드시 이 처리를 거칩니다.

## 디자인 원칙

목표는 **깔끔하고 읽기 좋은** 블로그입니다. 장식보다 가독성을 우선합니다.

### 타이포그래피
- 본문 폰트: 시스템 폰트 스택 + 한글 폰트
  `-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", "Segoe UI", sans-serif`
- 코드 폰트: `"JetBrains Mono", "D2Coding", Consolas, monospace`
- 본문 크기 `1.0625rem`(17px) 전후, 줄 간격 `1.75`, 한글 가독성을 위해 `word-break: keep-all`
- 본문 최대 너비 약 `720px` (한 줄 40~45자 내외), 가운데 정렬
- 제목 간 위계가 분명하도록 크기·여백을 충분히

### 색상과 테마
- 모든 색은 `:root`의 **CSS 변수**로 정의하고, 컴포넌트에서는 변수만 사용합니다. 하드코딩된 색상값을 쓰지 않습니다.
  - 예: `--bg`, `--surface`, `--text`, `--text-muted`, `--border`, `--accent`, `--code-bg`
- 배경은 순백/순흑 대신 살짝 톤을 준 색을 사용해 눈의 피로를 줄입니다.
- 텍스트 대비는 WCAG AA(4.5:1) 이상을 유지합니다.

### 다크 모드
- 기본값은 OS 설정(`prefers-color-scheme`)을 따릅니다.
- 헤더의 토글 버튼으로 라이트/다크를 수동 전환할 수 있고, 선택은 `localStorage`에 저장합니다 (`localStorage` 접근은 `try/catch`로 감쌉니다).
- 수동 선택은 `<html data-theme="light|dark">` 속성으로 적용하고, CSS는 다음 패턴을 따릅니다.

```css
:root { /* 라이트 변수 */ }
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { /* 다크 변수 */ }
}
:root[data-theme="dark"] { /* 다크 변수 */ }
```

- 페이지 로드 시 깜빡임(FOUC)을 막기 위해 테마 적용 스크립트는 `<head>`에서 가장 먼저, 동기적으로 실행합니다.
- 코드 블록, 인용문, 표, 테두리 등 모든 요소가 양쪽 테마에서 잘 보이는지 확인합니다.

### 반응형 / 모바일
- **모바일 우선**으로 작성하고 `min-width` 미디어 쿼리로 확장합니다.
- `<meta name="viewport" content="width=device-width, initial-scale=1">` 필수.
- 좌우 여백 최소 `16px`, 가로 스크롤이 생기지 않아야 합니다.
  - 긴 코드 블록과 표는 해당 요소 안에서만 가로 스크롤 (`overflow-x: auto`).
  - 이미지는 `max-width: 100%; height: auto;`.
- 터치 대상(버튼, 링크)은 최소 `44×44px`.
- 확인 기준 너비: 360px, 768px, 1280px.

### 접근성
- 시맨틱 태그 사용: `<header>`, `<nav>`, `<main>`, `<article>`, `<footer>`
- 테마 토글 버튼에 `aria-label` 제공, 키보드로 조작 가능
- 포커스 표시(`:focus-visible`)를 제거하지 않습니다.
- `prefers-reduced-motion`을 존중해 전환 애니메이션을 줄입니다.

## 코딩 규칙

- JavaScript: ES2020+ 문법, `const`/`let` 사용 (`var` 금지), 세미콜론 사용, 들여쓰기 2칸
- 파일 간 공유는 `<script type="module">`과 `import`/`export`로 합니다.
- 전역 변수를 만들지 않습니다.
- DOM에 사용자 콘텐츠(글 제목, 태그 등)를 넣을 때는 `textContent`를 사용하고, `innerHTML`은 `markdown.js`가 이스케이프한 결과에만 사용합니다.
- CSS: 클래스 이름은 소문자-하이픈(kebab-case), `!important` 지양, 매직 넘버 대신 CSS 변수 활용
- 주석과 UI 문구는 한국어로 작성합니다.

## 작업 시 체크리스트

변경 후 다음을 확인합니다.

1. 로컬 서버에서 목록 → 글 → 뒤로가기 흐름이 정상 동작하는가
2. 라이트/다크 모드 모두에서 모든 요소가 읽기 좋은가
3. 모바일 너비(360px)에서 가로 스크롤이 없는가
4. 브라우저 콘솔에 에러가 없는가
5. 글을 추가·수정했다면 `node scripts/build-index.mjs`를 실행했는가
