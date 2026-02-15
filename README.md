# Nemonori Arcade 개발 지침

JavaScript 기반 미니게임을 큐레이션해서 제공하는 Next.js(App Router) 프로젝트입니다.
핵심 목표는 다음 두 가지입니다.

- 게임 개수를 수백 개까지 늘려도 유지보수가 쉬운 구조
- 각 게임/페이지의 스타일이 서로 간섭하지 않는 독립 구조

## 1) 실행 방법

```bash
npm install
npm run dev
```

브라우저: `http://localhost:3000`

## 2) 기술 스택

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS v4 (`app/globals.css`에서 `@import "tailwindcss"`)
- CSS Modules (페이지/게임별 독립 스타일)

## 3) 디렉터리 규칙

- `app/page.tsx`: 메인 큐레이션 페이지
- `app/page.module.css`: 메인 페이지 전용 스타일
- `app/games/data.ts`: 게임 메타데이터 카탈로그(단일 소스)
- `app/games/[slug]/page.tsx`: 게임 상세 동적 라우트
- `app/games/[slug]/page.module.css`: 상세 페이지 전용 스타일
- `app/games/_components/*`: 실제 게임 컴포넌트 및 게임별 스타일
- `app/lib/save-protocol.ts`: localStorage 저장 프로토콜 유틸
- `app/saves/page.tsx`: 세이브 데이터 조회/관리 페이지

## 4) 게임 추가 표준 절차

1. 게임 컴포넌트 생성
- 위치: `app/games/_components/NewGame.tsx`
- 클라이언트 상호작용이 있으면 파일 상단에 `"use client"` 선언

2. 게임 스타일 생성
- 위치: `app/games/_components/NewGame.module.css`
- 전역 클래스/태그 셀렉터 대신 모듈 클래스 사용

3. 카탈로그 등록
- 파일: `app/games/data.ts`
- `GameComponentKey` 유니온에 키 추가
- `gameCatalog`에 `slug/title/summary/tags/difficulty/estPlayMinutes/accent/component` 추가

4. 라우트 매핑 연결
- 파일: `app/games/[slug]/page.tsx`
- `gameViewByComponent`에 새 컴포넌트 매핑 추가

## 5) 스타일링 원칙 (독립성)

- 페이지 단위 스타일은 `*.module.css`로 분리
- 게임 단위 스타일은 각 게임 컴포넌트 옆 `*.module.css`에만 정의
- `app/globals.css`에는 리셋/테마 토큰 같은 최소 공통 규칙만 둠
- 게임 전용 색상/레이아웃은 전역이 아닌 게임 모듈 내부에서 선언

## 6) 코딩 컨벤션

- TypeScript 타입 우선 (`GameDefinition`, `GameComponentKey` 유지)
- 라우팅 키(`slug`, `component`)는 데이터와 매핑에서 동일하게 유지
- 상태 로직은 컴포넌트 내부에 캡슐화하고 외부 공유 상태 최소화
- 필요 없는 복잡한 추상화보다 명확한 데이터 기반 구조 우선

## 6-1) localStorage 저장 프로토콜

- 프로토콜 버전: `nemonori.save.v1`
- 키 규칙: `nemonori.arcade:game:{slug}:save`
- 저장 포맷(Envelope): `protocol`, `gameSlug`, `gameTitle`, `updatedAt`, `data`
- 충돌 방지 원칙: 반드시 `slug` 기반 키를 사용하고, 직접 `localStorage.setItem`을 호출하지 않고 `app/lib/save-protocol.ts` 유틸만 사용
- 관리 페이지: `/saves`에서 전체 저장 데이터 조회/개별 삭제/전체 삭제 지원

## 6-2) 한국어 인코딩(UTF-8) 지침

- 모든 소스 파일(`.ts`, `.tsx`, `.css`, `.md`)은 `UTF-8`로 저장
- 인코딩 문제 재발 방지를 위해 `UTF-8 with BOM`/로컬 코드페이지(CP949 등) 혼용 금지
- 증상 예시: 한글이 `?` 또는 깨진 문자로 보이거나, 패치 도구가 문맥 매칭을 못함
- 권장 대응:
1. 문제가 난 파일을 `UTF-8`로 다시 저장
2. 터미널 재확인 후 빌드/린트 재실행

PowerShell에서 인코딩 고정 저장 예시:

```powershell
# BOM 없는 UTF-8로 안전하게 재저장
$path = "app/games/data.ts"
$text = Get-Content -Raw -Path $path
[System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($false))
```

이번 작업에서 적용한 방식:
- 깨짐이 발생한 파일 내용을 정상 문자열로 재작성하고 UTF-8로 재저장
- 이후 `npx eslint app --max-warnings=0` 및 `npm run build`로 정상 동작 검증

## 7) 품질 확인

앱 영역만 빠르게 검증:

```bash
npx eslint app --max-warnings=0
npm run build
```

참고: 현재 저장소의 `legacy/`에는 별도 린트 이슈가 있을 수 있으므로,
신규 앱 작업 검증은 우선 `app` 범위로 확인합니다.

## 8) 확장 가이드 (수백 개 게임 대비)

- `app/games/data.ts`를 기준으로 카드 렌더링/검색/태그 필터를 유지
- 필요 시 다음 순서로 확장
1. 정렬/고급 필터
2. 페이지네이션 또는 무한스크롤
3. 카탈로그를 JSON/DB/API로 외부화
4. 추천/큐레이션 섹션 분리(신규, 인기, 에디터 추천)

## 9) 커밋 권장 단위

- `feat(catalog): ...` 카탈로그/목록 UX 변경
- `feat(game): ...` 개별 게임 추가/수정
- `style(page): ...` 페이지 스타일 수정
- `refactor(game): ...` 게임 로직 리팩터링(동작 변경 없음)
- `docs: ...` 문서 업데이트
