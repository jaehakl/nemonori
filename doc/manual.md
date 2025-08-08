# Nemonori 게임 엔진 개발 매뉴얼

## 1) 아키텍처

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


## 2) 새로운 게임 추가

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

## 3) 모듈 개발 가이드

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

## 4) 이펙트(Effect) 카탈로그

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

## 7) 내러티브(텍스트 RPG) 패턴

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

---

## 8) 전투(예시) 모듈 스케치

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

## 9) 테스트 전략

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

---

## 10) UI 연동 패턴(React)

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

## 11) 저장/복원 시스템

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

## 12) 성능 & 품질 체크리스트

- 이펙트는 배열 하나로 모아서 반환(루프 내 dispatch 남발 금지)
- 대형 객체 복사 지양. 필요한 키만 갱신
- 난수/공식 계산은 유틸(공식 레지스트리)로 분리해 테스트 가능하게
- E2E: "부팅→첫 액션 처리" 3초 내, 60fps(렌더 실험 시) 유지

---

## 13) 이벤트/보안 주의

- eval/동적 함수 생성 금지. 룰 DSL이 필요하면 등록형 조건/행동만 허용
- 텔레메트리는 PII 없는 집계 이벤트만, 네트워크 실패 시 완전 오프라인

---

## 14) 테스트 체크리스트

### 세이브 라운드트립
```js
const A = saveGame(k); loadGame(k, A); const B = saveGame(k);
// deepEqual(A.modules, B.modules) 이어야 한다.
```

### 결정론 보장
같은 seed + 같은 actions 목록 → 최종 스냅샷이 항상 같다.

### 모듈 단위 검증
save() 결과에 캐시·임시값이 끼지 않았는지 확인(Map/Set 없을 것).

---

## 15) 흔한 실수와 수정

- 통합 테스트에서 createNarrative()만 호출하면 시작 노드가 undefined가 될 수 있음 → 반드시 nodes/start를 주입
- 모듈 단위 테스트에서 init(ctx) 생략 금지(로컬 상태와 ctx.state.* 동기화 필요)
- Date.now()로 로그 타임스탬프를 남기면 리플레이 비교가 어긋날 수 있음 → 테스트에서는 로그 타임스탬프 무시

---

## 16) UI와의 경계

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

## 로드맵

- v1: @lab/tbs, @lab/grid, @lab/econ-sim 공개 / 커널 리플레이 기록기(액션 로그)
- v1.1: 저장 슬롯 + Export/Import(IndexedDB), 리모트 컨피그(옵션)
- v1.2: 간단 룰 DSL(등록형), 퍼포먼스 가드(effects 길이/프레임 타임 경고)

