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

## 빠른 시작

### 요구 사항

- Node.js ≥ 18
- pnpm ≥ 8 (권장)

### 설치 & 실행

```bash
pnpm i             # 루트에서 의존성 설치
```

### 게임 실행 방법

#### 🎮 **통합 Vite 런타임 (권장)**

모든 게임을 하나의 Vite 서버에서 실행하고 URL 경로로 구분합니다:

```bash
# 통합 런처 실행
run_unified.bat

# 또는 수동 실행
pnpm dev
```

**접속 주소:**
- 🏠 **런처**: `http://localhost:3000`
- 📖 **Text RPG**: `http://localhost:3000/text-rpg`
- 🏘️ **Village Sim**: `http://localhost:3000/village-sim`

#### 🎮 개별 게임 실행 (기존 방식)

**Windows 배치 파일:**
```bash
run_text.bat      # Text RPG만 실행
run_village.bat   # Village Sim만 실행
```

**pnpm 스크립트:**
```bash
pnpm dev:text      # 텍스트 RPG (http://localhost:5173)
pnpm dev:village   # 마을 시뮬레이션 (http://localhost:5175)
```

빌드:

```bash
pnpm build
```

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

## 스크립트

### 통합 런타임 (권장)
- `run_unified.bat` - 통합 Vite 서버 실행 (모든 게임 포함)
- `pnpm dev` - 통합 개발 서버 실행

### Windows 배치 파일 (개별 실행)
- `run_text.bat` - Text RPG만 실행
- `run_village.bat` - Village Sim만 실행

### pnpm 스크립트 (개별 실행)
- `pnpm dev:text` - 텍스트 RPG 개발 서버
- `pnpm dev:village` - 마을 시뮬레이션 개발 서버
- `pnpm build` - 모든 패키지 빌드

---

## 문제 해결

### 🚨 런처가 실행되지 않는 경우

1. **통합 런처 사용** (권장):
   ```bash
   run_unified.bat
   ```

2. **개별 게임 실행**:
   ```bash
   run_text.bat
   run_village.bat
   ```

### 🛑 게임 서버가 계속 실행되는 경우

터미널을 닫아도 게임 서버가 계속 실행되는 경우:

1. **빠른 종료**:
   ```bash
   kill_games.bat
   ```

2. **상세 정보와 함께 종료**:
   ```bash
   stop_all_games.bat
   ```

3. **수동으로 종료**:
   ```bash
   # Node.js 프로세스 종료
   taskkill /IM node.exe /F
   
   # CMD 창들 종료
   taskkill /IM cmd.exe /F
   ```

자세한 문제 해결 방법은 [TROUBLESHOOTING.md](TROUBLESHOOTING.md)를 참고하세요.

---

## 개발자 문서

자세한 개발 가이드, API 문서, 아키텍처 설명은 [개발자 매뉴얼](doc/manual.md)을 참고하세요.

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

**Q. 한글이 깨져요?**\
A. Windows에서 `chcp 65001` 명령어로 UTF-8 인코딩을 설정했습니다. 배치 파일을 사용하시면 한글이 정상적으로 표시됩니다.

**Q. 런처가 실행되지 않아요?**\
A. `run_unified.bat`를 실행해보세요. 모든 게임이 하나의 서버에서 실행됩니다.

**Q. 게임 서버가 계속 실행되어요?**\
A. `kill_games.bat`를 실행하면 모든 게임 서버가 종료됩니다.

**Q. 통합 런타임의 장점은?**\
A. 하나의 서버에서 모든 게임을 실행하므로 포트 충돌 없고, URL 경로로 게임을 구분하여 더 효율적입니다.

---

## 연락

아이디어/피드백 환영합니다. 이슈 탭에 남겨주세요.

