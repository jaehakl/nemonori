// 게임 진행 관리 모듈
export function createGame() {
  let year = 1700
  let turn = 1

  // 일본식 이름 생성 (village.js에서 복사)
  const familyNames = ['田中', '佐藤', '鈴木', '高橋', '渡辺', '伊藤', '山本', '中村', '小林', '加藤']
  const maleNames = ['太郎', '次郎', '三郎', '一郎', '健一', '正雄', '清', '誠', '博', '明']
  const femaleNames = ['花子', '美子', '恵子', '由美', '美穂', '愛', '香', '美', '恵', '優']

  function generateName(gender) {
    const family = familyNames[Math.floor(Math.random() * familyNames.length)]
    const names = gender === 'male' ? maleNames : femaleNames
    const name = names[Math.floor(Math.random() * names.length)]
    return family + name
  }

  function createPerson(gender = null, age = 1) {
    if (!gender) {
      gender = Math.random() < 0.5 ? 'male' : 'female'
    }
    
    return {
      id: Date.now() + Math.random(), // 간단한 ID 생성
      name: generateName(gender),
      gender,
      age,
      labor: getLabor(gender, age)
    }
  }

  function getLabor(gender, age) {
    if (age < 15 || age > 65) return 0
    return gender === 'male' ? 3 : 1
  }

  return {
    id: 'game',
    
    init(ctx) {
      ctx.state.game ??= { 
        year: 1700,
        turn: 1
      }
      
      year = ctx.state.game.year
      turn = ctx.state.game.turn
    },

    actions: {
      // 다음 턴 진행
      nextTurn(payload, ctx) {
        const effects = []
        
        // 마을 업데이트 (출산, 사망)
        const villageEffects = ctx.state.village?.people?.forEach(p => {
          if (ctx.state.food.month === 12) {
            p.age++
          }
          p.labor = getLabor(p.gender, p.age)
        })
        
        // 출산 처리
        const fertileWomen = ctx.state.village?.people?.filter(p => p.gender === 'female' && p.age >= 15 && p.age <= 40) || []
        const birthChance = ctx.state.village?.festival ? 0.10 : 0.03
        
        fertileWomen.forEach(woman => {
          if (ctx.rand.roll(birthChance)) {
            const baby = createPerson()
            ctx.state.village.people.push(baby)
            effects.push({ 
              type: 'log', 
              msg: `${woman.name}이(가) ${baby.name}을(를) 낳았습니다!` 
            })
          }
        })
        
        // 사망 처리
        const deadPeople = []
        ctx.state.village?.people?.forEach(person => {
          const deathChance = person.age / 10000
          if (ctx.rand.roll(deathChance)) {
            deadPeople.push(person)
          }
        })
        
        deadPeople.forEach(person => {
          const index = ctx.state.village.people.findIndex(p => p.id === person.id)
          if (index !== -1) {
            ctx.state.village.people.splice(index, 1)
          }
          effects.push({ 
            type: 'log', 
            msg: `${person.name}이(가) 세상을 떠났습니다. (${person.age}세)` 
          })
        })
        
        // 축제 효과 초기화
        if (ctx.state.village?.festival) {
          ctx.state.village.festival = false
        }
        
        // 식량 처리
        const population = ctx.state.village?.people?.length || 0
        const consumption = population
        
        if (ctx.state.food.current < consumption) {
          // 식량 부족 시 무작위 사망
          const shortage = consumption - ctx.state.food.current
          const people = ctx.state.village.people
          
          for (let i = 0; i < shortage && people.length > 0; i++) {
            const randomIndex = Math.floor(ctx.rand.roll(1) * people.length)
            const deadPerson = people.splice(randomIndex, 1)[0]
            effects.push({ 
              type: 'log', 
              msg: `${deadPerson.name}이(가) 굶어 죽었습니다.` 
            })
          }
          
          ctx.state.food.current = 0
        } else {
          ctx.state.food.current -= consumption
        }
        
        // 노동력 부족 계산
        const requiredLabor = 100
        const availableLabor = ctx.state.village?.people?.reduce((sum, p) => sum + p.labor, 0) || 0
        
        if (availableLabor < requiredLabor) {
          ctx.state.food.laborDeficit += (requiredLabor - availableLabor)
        }
        
        // 10월에 수확
        if (ctx.state.food.month === 10) {
          const harvest = Math.max(0, 1200 - ctx.state.food.laborDeficit)
          ctx.state.food.current += harvest
          ctx.state.food.laborDeficit = 0
          
          effects.push({ 
            type: 'log', 
            msg: `수확이 완료되었습니다. +${harvest} 식량` 
          })
        }
        
        // 월 증가
        ctx.state.food.month = ctx.state.food.month === 12 ? 1 : ctx.state.food.month + 1
        
        // 턴 증가
        turn++
        if (turn > 12) {
          turn = 1
          year++
        }
        
        // 상태 업데이트
        ctx.state.game.turn = turn
        ctx.state.game.year = year
                
        return effects
      },

      // 추방 명령
      exile({ personId }, ctx) {
        const people = ctx.state.village?.people || []
        const index = people.findIndex(p => p.id === personId)
        if (index !== -1) {
          const person = people.splice(index, 1)[0]
          return [{ type: 'log', msg: `${person.name}을(를) 마을에서 추방했습니다.` }]
        }
        return [{ type: 'log', msg: '추방할 사람을 찾을 수 없습니다.' }]
      },

      // 축제 명령
      holdFestival(payload, ctx) {
        ctx.state.village.festival = true
        return [{ type: 'log', msg: '축제를 개최했습니다! 출산 확률이 증가합니다.' }]
      },

      // 게임 리셋
      reset(payload, ctx) {
        year = 1700
        turn = 1
        ctx.state.game.year = year
        ctx.state.game.turn = turn
        
        // 마을 상태 리셋
        ctx.state.village.people = []
        ctx.state.village.nextId = 1
        ctx.state.village.festival = false
        
        // 초기 마을 사람들 생성 (10명)
        for (let i = 0; i < 10; i++) {
          const age = Math.floor(Math.random() * 50) + 15
          const person = createPerson(null, age)
          ctx.state.village.people.push(person)
        }
        
        // 식량 상태 리셋
        ctx.state.food.current = 1000
        ctx.state.food.laborDeficit = 0
        ctx.state.food.month = 1
        
        return [{ type: 'log', msg: '게임을 리셋했습니다.' }]
      }
    },

    update(dt, ctx) {
      // 실시간 업데이트는 필요 없음
    },

    save() {
      return {
        year,
        turn
      }
    },

    load(data) {
      if (data) {
        year = data.year || 1700
        turn = data.turn || 1
      }
    }
  }
}
