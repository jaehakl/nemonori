# Nemonori Arcade

게임 목록, 게임 등록·라우팅, 브라우저 세이브 관리를 제공하는 Next.js 프레임워크입니다.
현재 등록된 게임은 없습니다. 새 게임을 등록하면 목록과 상세 라우트가 함께 연결됩니다.

## 실행과 검사

Node.js 24 이상과 npm을 사용합니다. 별도 백엔드나 필수 환경 변수는 없습니다.

```bash
npm ci
npm run dev
```

개발 주소는 `http://localhost:3000`입니다. 프로덕션 실행은 `npm run build` 후 `npm start`를 사용합니다.

```bash
npm run check:environment
npm run lint
npm run typecheck
npm test
npm run build
npm audit
```

`typecheck`는 Next 라우트 타입을 먼저 생성합니다. `next-env.d.ts`, `.next`, 로그와 TypeScript 캐시는 자동 생성되며 Git에서 제외됩니다.
CI는 Node 24에서 같은 검사를 실행합니다. 게임 로더와 저장소 테스트에는 Node 내장 테스트 러너를 사용합니다.

## 구조

| 영역 | 책임 |
| --- | --- |
| `app/page.tsx` | 게임 목록, 검색, 태그 필터, 빈 목록 안내 |
| `app/games/data.ts` | 게임 메타데이터와 비동기 로더의 단일 등록부 |
| `app/games/[slug]/page.tsx` | 상세 페이지와 metadata, 미등록 게임의 404 처리 |
| `app/games/_components/GameHost.tsx` | 클라이언트 전용 로드, 취소, 오류 안내와 재시도 |
| `app/lib/save-protocol.ts` | 저장값 검증, 오류 결과, 저장·삭제·조회 |
| `app/lib/save-store.ts` | 안정적인 세이브 스냅샷과 변경 구독 |
| `app/lib/use-game-saves.ts` | 서버 렌더링과 호환되는 React 구독 |
| `app/saves/page.tsx` | 정상·손상 세이브 관리 |
| `code_serializer.py` | 별도 Python 표준 라이브러리 기반 소스 내보내기 도구 |

화면과 게임의 스타일은 CSS Modules로 격리합니다. 전역 CSS에는 공통 테마와 기본 글꼴만 둡니다.
Phaser, Babylon.js 등은 게임이 실제로 필요할 때 추가합니다.

## 새 게임 등록

1. 클라이언트 React 컴포넌트를 만들고 default export합니다. 게임별 스타일은 인접한 CSS Module에 둡니다.
2. `app/games/data.ts`의 `defineGameCatalog` 배열에 메타데이터와 literal 동적 import를 함께 등록합니다.

```tsx
export const gameCatalog = defineGameCatalog([
  {
    slug: "new-game",
    title: "새 게임",
    summary: "게임 설명",
    tags: ["puzzle"],
    difficulty: "Easy",
    estPlayMinutes: 5,
    accent: "#0f766e",
    load: () => import("./_components/new-game/NewGame"),
  },
]);
```

slug는 소문자 영문·숫자와 단어 사이의 하이픈만 사용하며 중복을 허용하지 않습니다.
메타데이터와 구현을 별도로 매핑하지 않습니다. 등록부와 서버 렌더링은 게임 모듈을 실행하지 않습니다.
GameHost는 마운트 후 로더를 호출하므로 서버와 브라우저의 첫 화면이 같은 로딩 상태로 시작합니다.

## 저장 계약

- 프로토콜: `nemonori.save.v1`
- 키: `nemonori.arcade:game:{slug}:save`
- Envelope: `protocol`, `gameSlug`, `gameTitle`, `updatedAt`, `data`
- 기존 브라우저 세이브는 게임 삭제 후에도 보관됩니다. 등록되지 않은 게임의 실행 링크는 표시하지 않습니다.

저장 API는 성공 시 `{ ok: true, value }`, 실패 시 `{ ok: false, error, partial? }`를 반환합니다.
오류 코드는 `storage-unavailable`, `quota-exceeded`, `invalid-data`, `storage-error`입니다.
조회 실패와 빈 목록을 구분하고, 일괄 삭제 실패에는 이미 삭제된 키와 실패한 키를 `partial`로 제공합니다.

게임 코드는 직접 `localStorage.setItem`을 호출하지 않고 공통 유틸을 사용합니다.
게임 데이터는 유한한 숫자, 문자열, boolean, null, 배열, 일반 객체로 구성합니다.
함수, undefined, BigInt, 날짜 객체, 순환 참조 등 JSON에서 손실되는 값은 거부합니다.
수정 가능한 객체를 저장해도 반환되는 Envelope는 저장 당시의 독립된 스냅샷입니다.

```ts
import { loadGameSave, saveGameSave } from "@/app/lib/save-protocol";

type SaveData = { version: 1; bestScore: number };

function isSaveData(value: unknown): value is SaveData {
  return value !== null && typeof value === "object"
    && "version" in value && value.version === 1
    && "bestScore" in value && typeof value.bestScore === "number"
    && Number.isFinite(value.bestScore);
}

// 호출은 클라이언트 마운트 후에 수행합니다.
const loaded = loadGameSave("new-game", isSaveData);
if (!loaded.ok) {
  // loaded.error.message를 사용자에게 표시합니다.
} else if (loaded.value) {
  // loaded.value.data는 검증된 SaveData입니다.
}

const saved = saveGameSave("new-game", "새 게임", { version: 1, bestScore: 100 });
if (!saved.ok) {
  // 저장 실패를 표시합니다. 성공했다고 안내하거나 기존 데이터를 지우지 않습니다.
}
```

검증함수가 없는 로드는 `unknown` 데이터를 반환합니다. 타입을 지정하려면 검증함수를 전달해야 합니다.
게임별 데이터 버전과 이관은 해당 게임이 소유하고, 공통 Envelope와 키는 유지합니다.
손상된 세이브는 읽기만으로 변경하지 않습니다. `/saves`에서 원본 확인과 명시적 삭제를 지원합니다.
삭제는 실제 저장 키를 기준으로 하며 다른 앱의 데이터는 보존합니다. 전체 삭제는 확인 후 실행합니다.

React 화면에서는 `useGameSaves`를 사용합니다. 이 훅은 고정된 서버 로딩 스냅샷으로 hydration을 시작하고,
같은 탭의 저장·삭제와 다른 탭의 storage 이벤트를 반영합니다. 직접 저장소를 수정한 외부 도구의 결과는 새로고침으로 반영합니다.

## 게임의 수명주기

- 브라우저 엔진, 오디오, worker 등은 effect에서 초기화합니다. 모듈 최상위에서 window나 엔진을 실행하지 않습니다.
- 비동기 초기화는 페이지 이탈·재시작을 확인하고, 취소되거나 일부 초기화가 실패하면 생성된 자원도 정리합니다.
- cleanup에서 timer, listener, engine, AudioContext, worker를 해제합니다. 정리 과정에서 새 자원을 생성하지 않습니다.
- 상태 updater는 순수하게 유지합니다. 보상 지급이나 다른 상태 변경을 updater 안에서 실행하지 않습니다.
- 타이머는 표시용 상태 변경 때문에 재시작되지 않도록 설계합니다.
- GameHost는 import 실패와 React 렌더 오류를 처리합니다. 게임 내부의 비동기 오류와 이벤트 처리 오류는 게임이 처리해야 합니다.

## 환경 파일과 인코딩

실제 환경 값은 로컬 `.env.local` 또는 배포 환경에서 관리합니다. `.env.example`에는 주석과 빈 값만 넣습니다.
`npm run check:environment`와 CI는 환경 파일이 Git에 추적되거나 예제에 값이 들어가면 실패합니다.
검사 출력에는 파일 이름만 사용합니다. 환경 값, 설정 객체, 비밀값이 포함된 diff를 로그에 출력하지 않습니다.

모든 소스와 문서는 BOM 없는 UTF-8로 저장합니다. Git의 텍스트 규칙은 소스 파일의 LF 줄바꿈을 유지합니다.
자격 증명 이력 정리 후 다른 작업본은 새로 clone하거나 정리된 이력으로 재구성해야 합니다.
기존 작업본의 옛 이력을 merge하여 다시 게시하면 삭제했던 자격 증명 이력이 복원될 수 있습니다.
