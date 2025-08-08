# Text RPG

**Nemonori** 프레임워크를 사용한 텍스트 기반 RPG 데모 게임입니다. React + Vite로 구현되었으며, JSON 기반 스토리 시스템을 통해 쉽게 확장할 수 있습니다.

<img width="741" height="394" alt="195358" src="https://github.com/user-attachments/assets/c3569a23-28aa-495c-943f-eafa2502997c" />

---

## 🎮 게임 특징

- **텍스트 기반 내러티브**: 선택지와 스토리 노드로 구성된 인터랙티브 스토리
- **리소스 시스템**: 골드 획득/소모, 플래그 기반 조건부 선택지
- **실시간 로그**: 게임 진행 상황을 실시간으로 확인
- **반응형 UI**: 다크 테마의 모던한 인터페이스

---

## 🚀 실행 방법

### 개발 모드
```bash
# 루트 디렉토리에서
pnpm dev:text

# 또는 직접 실행
cd games/text-rpg
pnpm dev
```

### Windows에서 빠른 실행
```bash
# 루트 디렉토리에서
run_text.bat
```

브라우저에서 `http://localhost:5173`으로 접속하면 게임을 플레이할 수 있습니다.

---

## 🎯 게임 플레이

### 기본 조작
- **선택지 클릭**: 스토리 진행
- **Restart 버튼**: 게임 재시작
- **상단 KPI**: 현재 골드와 노드 정보 확인

### 게임 요소
- **💰 Gold**: 게임 내 화폐 (획득/소모)
- **📍 Node**: 현재 스토리 위치
- **Flags**: 게임 상태 플래그 (조건부 선택지 활성화)
- **Log**: 게임 진행 기록

---

## 📖 스토리 시스템

### 스토리 구조 (`src/story.json`)

```json
{
  "start": "intro",
  "nodes": {
    "intro": {
      "text": "해가 저무는 숲 입구...",
      "choices": [
        {
          "text": "주점으로 간다",
          "goto": "tavern",
          "effects": [
            {"type": "resource.add", "k": "gold", "v": 5}
          ]
        }
      ]
    }
  }
}
```

### 노드 구성 요소

- **`text`**: 표시될 스토리 텍스트
- **`choices`**: 선택지 배열
  - `text`: 선택지 텍스트
  - `goto`: 이동할 노드 ID
  - `effects`: 선택 시 적용될 효과들
  - `req`: 선택지 활성화 조건 (선택사항)

### 효과 타입

- **`resource.add`**: 리소스 추가/감소
  ```json
  {"type": "resource.add", "k": "gold", "v": 5}
  ```
- **`flag.set`**: 플래그 설정
  ```json
  {"type": "flag.set", "key": "has_contract", "v": true}
  ```
- **`log`**: 로그 메시지 추가
  ```json
  {"type": "log", "msg": "주인은 첫 잔을 공짜로 내어준다."}
  ```

### 조건부 선택지

```json
{
  "text": "흔적을 따라간다 (힌트 필요)",
  "req": {"key": "forest_hint", "v": true},
  "goto": "hut"
}
```

`req` 조건이 충족되지 않으면 선택지가 비활성화됩니다.

---

## 🛠️ 개발 가이드

### 새로운 스토리 추가

1. `src/story.json`에 새 노드 추가
2. 선택지와 효과 정의
3. 조건부 로직 추가 (필요시)

### UI 커스터마이징

- **스타일**: `index.html`의 `<style>` 섹션 수정
- **레이아웃**: `src/main.jsx`의 JSX 구조 변경
- **기능**: React 컴포넌트에 새로운 기능 추가

### 새로운 효과 타입 추가

1. `packages/core-rules/src/index.js`에 새 Effect 타입 추가
2. `src/story.json`에서 새 효과 사용

---

## 📁 파일 구조

```
games/text-rpg/
├── index.html          # 메인 HTML (스타일 포함)
├── package.json        # 의존성 및 스크립트
├── src/
│   ├── main.jsx       # React 앱 진입점
│   └── story.json     # 스토리 데이터
├── run.bat            # Windows 실행 스크립트
└── vite.config.js     # Vite 설정
```

---

## 🔧 기술 스택

- **React 18**: UI 프레임워크
- **Vite**: 개발 서버 및 빌드 도구
- **@nori/core-kernel**: 게임 커널 (RNG, 상태 관리)
- **@nori/narrative**: 내러티브 모듈
- **@nori/core-rules**: 효과 시스템

---

## 🎨 UI 특징

- **다크 테마**: 눈에 편한 다크 모드
- **카드 레이아웃**: 깔끔한 카드 기반 UI
- **반응형 디자인**: 다양한 화면 크기 지원
- **인터랙티브 요소**: 호버 효과와 비활성화 상태

---

## 🚀 배포

```bash
# 빌드
pnpm build

# 미리보기
pnpm preview
```

빌드된 파일은 `dist/` 디렉토리에 생성됩니다.

---

## 🤝 기여

1. 스토리 확장: `src/story.json`에 새 노드/선택지 추가
2. UI 개선: 스타일 및 레이아웃 수정
3. 기능 추가: 새로운 게임 메커니즘 구현

---

## 📝 라이선스

이 게임은 MIT 라이선스 하에 배포됩니다.
