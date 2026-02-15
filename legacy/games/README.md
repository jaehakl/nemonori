# 게임 추가 가이드라인

새로운 게임을 `games` 폴더에 추가할 때는 다음 단계를 따르세요:

## 1. 게임 폴더 생성
```
games/
└── your-game-name/
    ├── src/
    │   ├── App.jsx
    │   └── main.jsx
    ├── package.json  ← 게임 메타데이터 포함
    └── index.html
```

## 2. package.json에 게임 메타데이터 추가
각 게임의 `package.json`에는 반드시 `game` 섹션이 있어야 합니다:

```json
{
  "name": "your-game-name",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "game": {
    "displayName": "게임 표시 이름",
    "description": "게임 설명",
    "icon": "🎮",
    "author": "개발자 이름"
  },
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
```

## 3. App.jsx에 게임 컴포넌트 추가
`src/App.jsx`에서 다음 두 부분을 수정해야 합니다:

### 게임 컴포넌트 import 추가:
```jsx
const YourGame = React.lazy(() => import('../games/your-game-name/src/App'))
```

### 게임 정보 import 추가:
```jsx
const gamePackages = {
  'text-rpg': () => import('../games/text-rpg/package.json'),
  'village-sim': () => import('../games/village-sim/package.json'),
  'your-game-name': () => import('../games/your-game-name/package.json')  // 추가
}
```

### 라우트 추가:
```jsx
<Route path="/your-game-name" element={
  <React.Suspense fallback={<div className="loading">게임을 로딩 중...</div>}>
    <YourGame />
  </React.Suspense>
} />
```

## 4. 게임 폴더 목록 업데이트
`src/App.jsx`의 `gameFolders` 배열에 새 게임 폴더명을 추가:
```jsx
const gameFolders = ['text-rpg', 'village-sim', 'your-game-name']
```

## 자동화 개선 계획
향후에는 `games` 폴더를 자동으로 스캔하여 `package.json`에 `game` 섹션이 있는 모든 폴더를 자동으로 감지하도록 개선할 예정입니다.

## 현재 지원되는 게임
- `text-rpg`: Text RPG
- `village-sim`: 마을 시뮬레이션

## 장점
- 별도의 `game-info.json` 파일이 불필요
- `package.json`의 기존 필드들과 함께 게임 메타데이터 관리
- 버전 정보는 자동으로 `package.json`의 `version` 필드에서 가져옴
