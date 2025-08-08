# Nemonori

**JavaScript 기반 게임 모노레포**입니다. 공통 커널/룰(액션·이펙트)과 장르 모듈을 분리해, 텍스트 RPG 같은 프로토타입을 **하루 단위로** 만들 수 있게 설계했습니다.

> 타입스크립트 없이 **순수 JS(ESM)** 로 동작합니다.

---

## 특징 (Why Nemonori)

- **코어/모듈 아키텍처**: `core-kernel`(루프·RNG·버스) + `core-rules`(Effect 적용기) + 장르 모듈(`narrative` 등)
- **결정론 RNG & 리플레이 친화**: `seed + actions[]`만으로 상태 재현 가능
- **데이터 지향**: 스토리/규칙을 JSON으로 선언 → 코드 수정 없이 실험
- **즉시 실행**: Vite 개발 서버, 브라우저에서 바로 플레이
- **확장 전제**: 추후 `tbs`(턴제), `econ-sim`(경영) 모듈 추가 예정

---

## 레포 구조

```
packages/
  core-kernel/      # 커널(루프, RNG, 이벤트 버스, 저장 훅)
  core-rules/       # 이펙트/공식/로그 적용기
  narrative/        # 대화/선택지/플래그 기반 내러티브 모듈

games/
  text-rpg/         # 예시 게임(React + Vite)
```

> 모든 패키지는 **ESM + JavaScript**. 템플릿/게임은 공용 모듈을 가져와 조립합니다.

---

## 빠른 시작

### 요구 사항

- Node.js ≥ 18
- pnpm ≥ 8 (권장)

### 설치 & 실행

```bash
pnpm i             # 루트에서 의존성 설치
pnpm dev:text      # 텍스트 RPG 개발 서버 실행 (http://localhost:5173)
```

빌드:

```bash
pnpm -r build
```

---

## 핵심 패키지 개요

### `@nori/core-kernel`

- 시드 기반 RNG, 이벤트 버스, 전역 `state`/`log`
- `dispatch(modId, action, payload)` → 각 모듈의 액션 실행 → 반환된 **Effect[]**를 적용
- `save()`/`load()`: 상태 저장/복원 기능 제공

### `@nori/core-rules`

- Effect 타입: `resource.add`, `flag.set`, `hp.damage`, `log` 등
- 공식(Formula) 유틸(F.hitChance 등)과 공통 로깅

### `@nori/narrative`

- 노드/선택지/조건(req)/플래그 기반 내러티브
- 액션: `start`, `choose({index})`

---

## 예시 게임: Text RPG

실행 후, 상단 KPI(골드/현재 노드)와 선택지 버튼으로 진행합니다. 스토리는 `games/text-rpg/src/story.json`에서 정의합니다.

간단한 스니펫:

```json
{
  "start": "intro",
  "nodes": {
    "intro": {
      "text": "해가 저무는 숲 입구…",
      "choices": [
        { "text": "주점으로 간다", "goto": "tavern",
          "effects": [{"type":"resource.add","k":"gold","v":5}] },
        { "text": "숲으로 들어간다", "goto": "forest" }
      ]
    }
  }
}
```

> `req: { key, v }`로 선택지 활성화 조건을 걸 수 있습니다.

---

## 개발 가이드

### 새로운 게임 추가

1. `games/<your-game>/` 디렉토리 생성
2. Vite 템플릿 복제 (`games/text-rpg/` 참고)
3. 공통 패키지 임포트:
   ```js
   import { createKernel } from '@nori/core-kernel'
   import { createNarrative } from '@nori/narrative'
   ```

### 공통 규칙 확장

`packages/core-rules/src/index.js`의 Effect/Formula에 타입 추가 후 모듈에서 사용:

```js
// 새로운 Effect 타입 추가
case 'custom.effect': {
  // 구현
  break;
}
```

### 상태 저장/복원

```js
const saveData = kernel.save()  // { v: 1, seed, state }
kernel.load(saveData)           // 상태 복원
```

> 로컬 저장은 추후 `indexedDB` 유틸로 제공 예정

---

## 스크립트

- `pnpm dev:text` - 텍스트 RPG 개발 서버
- `pnpm build` - 모든 패키지 빌드
- `run_text.bat` - Windows에서 텍스트 RPG 실행 (Chrome 자동 열기)

---

## 기여(Contributing)

1. 이슈로 제안/버그 리포트
2. 브랜치 생성 → 변경 → PR
3. 스타일: ESM + JS, 간결한 함수, 한국어/영어 주석 환영

---

## 라이선스

- 코드: MIT
- 스토리/에셋: 각 파일의 헤더 또는 `assets/CREDITS.md` 참고(추가 예정)

---

## FAQ

**Q. TypeScript가 아닌 이유?**\
A. 초기엔 "빨리 많이 만들기"가 목표라 JS로 마찰을 최소화했습니다. 타입 안정성 필요 시 패키지별로 점진적 TS 도입을 검토합니다.

**Q. 멀티플레이/백엔드는?**\
A. 현재는 오프라인/싱글 전제. 지표 확인 후 Cloudflare/Supabase 등 가벼운 백엔드를 붙일 수 있습니다.

**Q. 다른 게임 장르는?**\
A. `tbs`(턴제 전략), `econ-sim`(경영 시뮬) 모듈을 순차적으로 추가할 예정입니다.

---

## 연락

아이디어/피드백 환영합니다. 이슈 탭에 남겨주세요.

