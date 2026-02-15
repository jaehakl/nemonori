# Nemonori 게임 엔진 개발 매뉴얼

## 1) 프로젝트 개요

### 레포 구조

```
packages/
  core-kernel/      # 커널(루프, RNG, 이벤트 버스, 저장 훅)
  core-rules/       # 이펙트/공식/로그 적용기
  narrative/        # 대화/선택지/플래그 기반 내러티브 모듈

games/
  text-rpg/         # 예시 게임(React + Vite)
```

> 모든 패키지는 **ESM + JavaScript**. 템플릿/게임은 공용 모듈을 가져와 조립합니다.

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

### 스크립트

- `pnpm dev:text` - 텍스트 RPG 개발 서버
- `pnpm build` - 모든 패키지 빌드
- `run_text.bat` - Windows에서 텍스트 RPG 실행 (Chrome 자동 열기)

---

## 2) 핵심 패키지 가이드

### `@nori/core-kernel`

- 시드 기반 RNG, 이벤트 버스, 전역 `state`/`log`
- `dispatch(modId, action, payload)` → 각 모듈의 액션 실행 → 반환된 Effect[] 를 적용
- `save()`/`load()`: 상태 저장/복원 기능 제공

### `@nori/core-rules`

- Effect 타입: `resource.add`, `flag.set`, `hp.damage`, `log` 등
- 공식(Formula) 유틸(F.hitChance 등)과 공통 로깅

### `@nori/narrative`

- 노드/선택지/조건(req)/플래그 기반 내러티브
- 액션: `start`, `choose({index})`

---

## 3) 아키텍처

### 핵심 컴포넌트

- **Kernel**: 모듈 수명주기 관리, 액션 디스패치, 이펙트 적용
- **Context(ctx)**: 공유 환경 `{ rand, bus, state, log }`
- **Module**: 독립 기능 블록. `id`, `init(ctx)`, `actions`, *(선택)* `update(dt, ctx)`, `save()/load()`
- **Effects**: 유일한 상태 변경 수단. 모듈 액션의 반환값이며, 공용 적용기가 순서대로 반영
- **Event Bus**: UI/텔레메트리용 단발 알림 채널. 게임 규칙 변경은 금지

### 데이터 플로우

```
Kernel.dispatch(mod, action, payload)
  → Module Action(payload, ctx)
    → Effect[] 반환
      → applyEffects(Effect[], ctx)로 상태 변경
        → UI는 bus("effects.applied", Effect[])를 구독하여 갱신
```

---

## 4) 이펙트(Effect) 시스템

### 내장 타입

```ts
{ type:'resource.add', k:string, v:number }
{ type:'flag.set', key:string, v:boolean }
{ type:'hp.damage', target:EID|string, amount:number, source?:EID|string }
{ type:'log', msg:string, meta?:any }
```

### 새로운 이펙트 추가 방법

1. `packages/core-rules/src/index.js`의 `applyEffects` 스위치에 케이스 추가
2. 부작용 위치는 여기 한 곳으로 제한
3. UI 반응/사운드 등 일회성은 `bus.emit('effects.applied', effects)`를 구독하여 처리

```js
case 'experience.add': {
  const cur = (ctx.state.player?.exp ?? 0) + e.amount
  ctx.state.player ??= { level:1, exp:0 }
  ctx.state.player.exp = cur
  while (ctx.state.player.exp >= 100) { 
    ctx.state.player.level++; 
    ctx.state.player.exp -= 100 
  }
  log(ctx, `EXP +${e.amount}`)
  break
}
```

---

## 5) 이벤트 시스템

### 사용 가이드라인

- ✅ 사용: 단발 알림, UI 트리거, 로깅/텔레메트리
- ❌ 금지: 연쇄 이벤트, 상태 변경, 게임플레이 로직

### 안전 패턴

```js
// 커널이 자동 발행
bus.emit('effects.applied', effects)

// UI 레이어: 재렌더/토스트/사운드 트리거만 수행
bus.on('effects.applied', (fx) => { })
```

---

## 6) 결정론(Determinism) 규약

- 모든 랜덤은 ctx.rand를 통해서만 사용 (Date.now, Math.random 금지)
- 시간 개념이 필요한 경우 커널의 가상 시간 또는 틱 카운터를 사용
- 로그 타임스탬프는 디버그용이며 결정성 보장 범위에서 제외
- 리플레이는 `seed + dispatch 로그`만으로 재현

---

## 7) 모듈 개발 가이드

### 최소 골격

```js
export function createMyModule() {
  return {
    id: 'myModule',
    init(ctx) {
      ctx.state.myModule ??= { ready: true }
    },
    actions: {
      myAction(payload, ctx) {
        return [
          { type: 'resource.add', k: 'gold', v: 10 },
          { type: 'flag.set', key: 'completed', v: true },
          { type: 'log', msg: '완료!' }
        ]
      }
    },
    update(dt, ctx) { },
    save() { return { } },
    load(data) { }
  }
}
```

### 액션 패턴

```js
// 단순 액션
simpleAction(payload, ctx) {
  return [{ type: 'log', msg: '단순 액션' }]
}

// 조건부 액션
conditionalAction(payload, ctx) {
  if (ctx.state.flags.canDo) return [{ type: 'resource.add', k: 'gold', v: 5 }]
  return [{ type: 'log', msg: '조건 미충족' }]
}

// 복잡한 액션
complexAction(payload, ctx) {
  const fx = []
  if (ctx.rand.roll(0.5)) fx.push({ type: 'resource.add', k: 'gold', v: 10 })
  fx.push({ type: 'flag.set', key: 'visited', v: true })
  return fx
}
```

---

## 8) 내러티브(텍스트 RPG) 개발

### 스토리 정의

```js
const story = {
  start: 'intro',
  nodes: {
    intro: {
      text: '모험을 시작합니다.',
      choices: [
        { text: '주점으로 간다', goto: 'tavern', effects:[{ type:'resource.add', k:'gold', v:5 }] },
        { text: '숲으로 간다', goto: 'forest', req:{ key:'hasMap', v:true } }
      ]
    }
  }
}
```

### JSON 스토리 구조

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

### 선택지 조건 설정

`req: { key, v }`로 선택지 활성화 조건을 걸 수 있습니다:

```json
{
  "text": "비밀 문을 연다",
  "goto": "secret_room",
  "req": { "key": "hasKey", "v": true }
}
```

### 이펙트와 선택지

선택지에서 직접 이펙트를 실행할 수 있습니다:

```json
{
  "text": "골드를 받는다",
  "goto": "next_node",
  "effects": [
    {"type": "resource.add", "k": "gold", "v": 10},
    {"type": "flag.set", "key": "rewarded", "v": true}
  ]
}
```

---

## 9) 새로운 게임 추가

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

---

## 10) 저장/복원 시스템

### 스냅샷 규약

- JSON만 담는다. 함수/클래스/Map/Set/순환참조 금지
- v(버전) 필수, migrate(old)로 과거 스냅샷을 새 포맷으로 변환
- 캐시/파생값 저장 금지 → load()에서 rebuild()로 다시 만든다
- 모듈은 최소만 저장: 작을수록 빠르고 안전하다
- 커널 저장은 원자적: seed, time, modules{}를 한 번에 기록

### 커널 저장/복원 표준 구현

```js
export function saveGame(kernel) {
  const { ctx, modules } = kernel
  return {
    v: 1,
    seed: ctx.rand.seed(),
    t: ctx.time.t,
    modules: Object.fromEntries(
      modules.map(m => [m.id, m.save ? m.save() : null])
    )
  }
}

export function loadGame(kernel, snapshot) {
  const fresh = kernel.freshCtx(snapshot.seed, snapshot.t)
  kernel.ctx = fresh

  for (const m of kernel.modules) {
    if (m.load) m.load(snapshot.modules?.[m.id] ?? null, kernel.ctx)
  }
}
```

### 모듈 예시: 인벤토리

```js
export function createInventory() {
  let items = []
  let indexById = new Map()

  function rebuild() {
    indexById = new Map(items.map((it, i) => [it.id, i]))
  }

  function migrate(s) {
    if (!s) return { v: 1, items: [] }
    if (s.v === 1) return s
    throw new Error('unknown save version')
  }

  return {
    id: 'inventory',
    init(ctx) { items = []; indexById.clear() },

    actions: {
      addItem({ item }, ctx) {
        items.push(item)
        indexById.set(item.id, items.length - 1)
        return [{ type: 'log', msg: `${item.name} 획득` }]
      },
      removeItem({ id }, ctx) {
        const i = indexById.get(id)
        if (i == null) return [{ type: 'log', msg: '아이템 없음' }]
        items.splice(i, 1); rebuild()
        return [{ type: 'log', msg: `아이템 제거: ${id}` }]
      }
    },

    save() { return { v: 1, items } },
    load(s) { s = migrate(s); items = s.items; rebuild() }
  }
}
```

### 리플레이 시스템

```js
kernel.record = []

kernel.dispatch = (modId, name, payload) => {
  const mod = kernel.byId[modId]
  const effects = mod.actions[name](payload, kernel.ctx) || []
  kernel.applyEffects(effects)
  kernel.record.push({ t: kernel.ctx.time.t, mod: modId, name, payload })
  kernel.bus.emit('effects.applied', effects)
  return effects
}
```

---

## 11) UI 연동 패턴(React)

```js
// 간단: dispatch 후 setState로 리렌더
const choose = (i) => { kernel.dispatch('narrative','choose',{ index:i }); setTick(t=>t+1) }

// 고급: 버스 구독으로 자동 리렌더
useEffect(()=>{
  const rerender = () => setTick(t=>t+1)
  kernel.ctx.bus.on('effects.applied', rerender)
  return () => {}
},[])
```

---

## 12) 테스트 전략

### 유닛(모듈) 테스트

```js
it('narrative choose gives gold', () => {
  const ctx = { state:{ flags:{}, narrative:{} }, log:[], rand:{ roll:()=>true } }
  const story = { start:'intro', nodes:{ intro:{ text:'', choices:[{ effects:[{ type:'resource.add', k:'gold', v:5 }] }] } } }
  const mod = createNarrative({ nodes:story.nodes, start:story.start })
  mod.init(ctx)
  const fx = mod.actions.choose({ index:0 }, ctx)
  expect(fx).toEqual([{ type:'resource.add', k:'gold', v:5 }, { type:'log', msg:'▶ undefined' }])
})
```

### 통합(커널) 테스트

```js
it('game flow', () => {
  const story = { start:'intro', nodes:{ intro:{ text:'', choices:[{ goto:'end' }] }, end:{ text:'끝', choices:[] } } }
  const k = createKernel('test-seed', [ createNarrative({ nodes:story.nodes, start:story.start }) ])
  k.dispatch('narrative','start')
  expect(k.ctx.state.narrative.nodeId).toBe('intro')
  k.dispatch('narrative','choose', { index:0 })
  expect(k.ctx.state.narrative.nodeId).toBe('end')
})
```

### 테스트 체크리스트

#### 세이브 라운드트립
```js
const A = saveGame(k); loadGame(k, A); const B = saveGame(k);
// deepEqual(A.modules, B.modules) 이어야 한다.
```

#### 결정론 보장
같은 seed + 같은 actions 목록 → 최종 스냅샷이 항상 같다.

#### 모듈 단위 검증
save() 결과에 캐시·임시값이 끼지 않았는지 확인(Map/Set 없을 것).

---

## 13) 예시 모듈

### 전투 모듈 스케치

```js
export function createCombat() {
  return {
    id: 'combat',
    init(ctx){ ctx.state.combat ??= { hp: { A: 10, B: 10 } } },
    actions: {
      attack({ attacker, target, acc=50, eva=50 }, ctx) {
        const p = (acc - eva) * 0.01 + 0.65
        const hit = ctx.rand.roll(Math.max(0.05, Math.min(0.95, p)))
        return hit
          ? [{ type:'hp.damage', target, amount: 3 }, { type:'log', msg:`${attacker} → ${target} (HIT)` }]
          : [{ type:'log', msg:`${attacker} → ${target} (MISS)` }]
      }
    }
  }
}
```

---

## 14) 성능 & 품질 체크리스트

- 이펙트는 배열 하나로 모아서 반환(루프 내 dispatch 남발 금지)
- 대형 객체 복사 지양. 필요한 키만 갱신
- 난수/공식 계산은 유틸(공식 레지스트리)로 분리해 테스트 가능하게
- E2E: "부팅→첫 액션 처리" 3초 내, 60fps(렌더 실험 시) 유지

---

## 15) 보안 및 주의사항

- eval/동적 함수 생성 금지. 룰 DSL이 필요하면 등록형 조건/행동만 허용
- 텔레메트리는 PII 없는 집계 이벤트만, 네트워크 실패 시 완전 오프라인

---

## 16) 흔한 실수와 수정

- 통합 테스트에서 createNarrative()만 호출하면 시작 노드가 undefined가 될 수 있음 → 반드시 nodes/start를 주입
- 모듈 단위 테스트에서 init(ctx) 생략 금지(로컬 상태와 ctx.state.* 동기화 필요)
- Date.now()로 로그 타임스탬프를 남기면 리플레이 비교가 어긋날 수 있음 → 테스트에서는 로그 타임스탬프 무시

---

## 17) UI와의 경계

이벤트는 "알림"만. 게임 규칙 변경은 항상 dispatch() → effects → apply로 간다.
이벤트(bus.emit)는 UI 업데이트/로그 표시 같은 반응에만 쓰자.

```js
// 좋은 예
kernel.bus.on('effects.applied', (effects) => {
  // UI 상태만 갱신, 규칙/진행도는 건드리지 않음
})

// 나쁜 예
kernel.bus.on('turn.end', () => kernel.dispatch('combat', 'attack'))
```

---

## 18) 기여 가이드라인

### 개발 스타일

1. 이슈로 제안/버그 리포트
2. 브랜치 생성 → 변경 → PR
3. 스타일: ESM + JS, 간결한 함수, 한국어/영어 주석 환영

### 코드 컨벤션

- **모듈명**: camelCase (`createMyModule`)
- **액션명**: camelCase (`myAction`)
- **이펙트 타입**: dot notation (`resource.add`, `flag.set`)
- **상태 키**: camelCase (`playerGold`, `hasKey`)

---

## 19) FAQ (개발자용)

**Q. TypeScript가 아닌 이유?**\
A. 초기엔 "빨리 많이 만들기"가 목표라 JS로 마찰을 최소화했습니다. 타입 안정성 필요 시 패키지별로 점진적 TS 도입을 검토합니다.

**Q. 멀티플레이/백엔드는?**\
A. 현재는 오프라인/싱글 전제. 지표 확인 후 Cloudflare/Supabase 등 가벼운 백엔드를 붙일 수 있습니다.

**Q. 다른 게임 장르는?**\
A. `tbs`(턴제 전략), `econ-sim`(경영 시뮬) 모듈을 순차적으로 추가할 예정입니다.

**Q. 성능 최적화는?**\
A. 이펙트 배치 처리, 불필요한 객체 복사 방지, 결정론적 RNG 사용으로 최적화합니다.

**Q. 확장성은?**\
A. 모듈 기반 아키텍처로 새로운 게임 장르나 기능을 쉽게 추가할 수 있습니다.

---

## 20) 로드맵

- v1: @lab/tbs, @lab/grid, @lab/econ-sim 공개 / 커널 리플레이 기록기(액션 로그)
- v1.1: 저장 슬롯 + Export/Import(IndexedDB), 리모트 컨피그(옵션)
- v1.2: 간단 룰 DSL(등록형), 퍼포먼스 가드(effects 길이/프레임 타임 경고)

---

## 21) 라이선스 및 법적 고지사항

- 코드: MIT
- 스토리/에셋: 각 파일의 헤더 또는 `assets/CREDITS.md` 참고(추가 예정)

### 연락

아이디어/피드백 환영합니다. 이슈 탭에 남겨주세요.

