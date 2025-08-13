// 마을 시뮬레이션 통합 모듈
export function createVillage() {
  let people = []
  let nextId = 1
  let year = 1700
  let turn = 1
  let food = 1000
  let laborDeficit = 0
  let month = 1
  let allowMaleBirths = true  // 남자아이 출산 허용 토글
  let allowFemaleBirths = true  // 여자아이 출산 허용 토글

  // 일본식 이름 생성 (발음만 차용하여 한국어로 표기)
  const familyNames = [
    '다나카', '사토', '스즈키', '다카하시', '와타나베', '이토', '야마모토', '나카무라', '고바야시', '가토'
  ]
  const maleNames = [
    '타로', '지로', '사부로', '이치로', '켄이치', '마사오', '키요시', '마코토', '히로시', '아키라',
    '유키', '다이스케', '류타', '유토', '하루토', '소우타', '켄타', '유우키', '다이키', '슌',
    '카즈야', '토모야', '료우타', '유우야', '켄지', '마사히로', '히로유키', '유우지', '다이스케', '켄',
    '유우', '다이', '료우', '유우', '켄', '마사', '히로', '유우', '다이', '켄',
    '타케시', '노부유키', '미츠히로', '요시히로', '카즈히로', '토시히로', '히데유키', '유키히로', '다이스케', '켄지',
    '마사토', '히로토', '유우토', '다이토', '켄토', '마사키', '히로키', '유우키', '다이키', '켄키']
  const femaleNames = [
    '하나코', '요시코', '케이코', '유미', '미호', '아이', '카오리', '미유키', '메구미', '유카',
    '사치코', '노리코', '미치코', '아키코', '유키코', '마미코', '히로코', '나오코', '미도리', '사쿠라',
    '아야코', '치에코', '후미코', '준코', '마리코', '에미코', '히토미', '나오미', '미즈키', '사토미',
    '유코', '마코토', '미나코', '아키', '유키', '마미', '히로', '나오', '미도', '사쿠']

  function generateName(gender) {
    const family = familyNames[Math.floor(Math.random() * familyNames.length)]
    const names = gender === 'male' ? maleNames : femaleNames
    const name = names[Math.floor(Math.random() * names.length)]
    return family +' '+ name
  }

  function createPerson(gender = null, age = 1) {
    if (!gender) {
      gender = Math.random() < 0.5 ? 'male' : 'female'
    }
    
    return {
      id: nextId++,
      name: generateName(gender),
      gender,
      age,
      labor: getLabor(gender, age)
    }
  }

  function createPersonWithFamily(familyName, gender = null, age = 1) {
    if (!gender) {
      gender = Math.random() < 0.5 ? 'male' : 'female'
    }
    
    const names = gender === 'male' ? maleNames : femaleNames
    const name = names[Math.floor(Math.random() * names.length)]
    
    return {
      id: nextId++,
      name: familyName + ' ' + name,
      gender,
      age,
      labor: getLabor(gender, age)
    }
  }

  function getLabor(gender, age) {
    if (age < 12 || age > 65) return 0
    return gender === 'male' ? 3 : 1
  }

  function removePerson(id) {
    const index = people.findIndex(p => p.id === id)
    if (index !== -1) {
      const removed = people.splice(index, 1)[0]
      return removed || null
    }
    return null
  }

  return {
    id: 'village',
    
    init(ctx) {
      ctx.state.village ??= { 
        people: [],
        nextId: 1,
        festival: false,
        year: 1700,
        turn: 1,
        food: 1000,
        laborDeficit: 0,
        month: 1,
        allowMaleBirths: true,
        allowFemaleBirths: true
      }
      
      // 상태 동기화
      people = ctx.state.village.people
      nextId = ctx.state.village.nextId
      year = ctx.state.village.year
      turn = ctx.state.village.turn
      food = ctx.state.village.food
      laborDeficit = ctx.state.village.laborDeficit
      month = ctx.state.village.month
      allowMaleBirths = ctx.state.village.allowMaleBirths
      allowFemaleBirths = ctx.state.village.allowFemaleBirths
      
      // 초기 마을 사람들 생성 (10명)
      if (people.length === 0) {
        for (let i = 0; i < 10; i++) {
          const age = Math.floor(Math.random() * 50) + 15
          const person = createPerson(null, age)
          people.push(person)
        }
        ctx.state.village.people = people
        ctx.state.village.nextId = nextId
      }
    },

    actions: {
      // 다음 턴 진행
      nextTurn(payload, ctx) {
        const effects = []
        
        // 마을 업데이트 (출산, 사망)
        people.forEach(p => {
          if (month === 12) {
            p.age++
          }
          p.labor = getLabor(p.gender, p.age)
        })
        
        // 출산 처리
        const fertileWomen = people.filter(p => p.gender === 'female' && p.age >= 18 && p.age <= 39)
        const birthChance = ctx.state.village.festival ? 0.10 : 0.03
        
        fertileWomen.forEach(woman => {
          if (ctx.rand.roll(birthChance)) {
            // 성별 결정
            const babyGender = Math.random() < 0.5 ? 'male' : 'female'
            
            // 성별 토글 확인
            if ((babyGender === 'male' && allowMaleBirths) || (babyGender === 'female' && allowFemaleBirths)) {
              // 어머니의 성을 따르는 아기 생성
              const baby = createPersonWithFamily(woman.name.split(' ')[0], babyGender)
              people.push(baby)
              effects.push({ 
                type: 'log', 
                msg: `${woman.name}이(가) ${baby.name}을(를) 낳았습니다!` 
              })
            }
          }
        })
        
        // 사망 처리
        const deadPeople = []
        people.forEach(person => {
          const deathChance = person.age / 10000
          if (ctx.rand.roll(deathChance)) {
            deadPeople.push(person)
          }
        })
        
        deadPeople.forEach(person => {
          const index = people.findIndex(p => p.id === person.id)
          if (index !== -1) {
            people.splice(index, 1)
          }
          effects.push({ 
            type: 'log', 
            msg: `${person.name}이(가) 세상을 떠났습니다. (${person.age}세)` 
          })
        })
        
        // 축제 효과 초기화
        if (ctx.state.village.festival) {
          ctx.state.village.festival = false
        }
        
        // 식량 처리
        const population = people.length
        const consumption = population
        
        if (food < consumption) {
          // 식량 부족 시 무작위 사망
          const shortage = consumption - food
          
          for (let i = 0; i < shortage && people.length > 0; i++) {
            const randomIndex = Math.floor(Math.random() * people.length)
            const deadPerson = people.splice(randomIndex, 1)[0]
            
            if (deadPerson) {
              effects.push({ 
                type: 'log', 
                msg: `${deadPerson.name}이(가) 굶어 죽었습니다.` 
              })
            }
          }
          
          food = 0
        } else {
          food -= consumption
        }
        
        // 노동력 부족 계산
        const requiredLabor = 100
        const availableLabor = people.reduce((sum, p) => sum + p.labor, 0)
        
        if (availableLabor < requiredLabor) {
          laborDeficit += (requiredLabor - availableLabor)
        }
        
        // 10월에 수확
        if (month === 10) {
          const harvest = Math.max(0, 1200 - laborDeficit)
          food += harvest
          laborDeficit = 0
          
          effects.push({ 
            type: 'log', 
            msg: `수확이 완료되었습니다. +${harvest} 식량` 
          })
        }
        
        // 월 증가
        month = month === 12 ? 1 : month + 1
        
        // 턴 증가
        turn++
        if (turn > 12) {
          turn = 1
          year++
        }
        
        // 상태 업데이트
        ctx.state.village.people = people
        ctx.state.village.nextId = nextId
        ctx.state.village.year = year
        ctx.state.village.turn = turn
        ctx.state.village.food = food
        ctx.state.village.laborDeficit = laborDeficit
        ctx.state.village.month = month
        ctx.state.village.allowMaleBirths = allowMaleBirths
        ctx.state.village.allowFemaleBirths = allowFemaleBirths
                
        return effects
      },

      // 추방 명령
      exile({ personId }, ctx) {
        const person = removePerson(personId)
        if (person) {
          ctx.state.village.people = people
          return [{ type: 'log', msg: `${person.name}을(를) 마을에서 추방했습니다.` }]
        }
        return [{ type: 'log', msg: '추방할 사람을 찾을 수 없습니다.' }]
      },

      // 축제 명령
      holdFestival(payload, ctx) {
        ctx.state.village.festival = true
        return [{ type: 'log', msg: '축제를 개최했습니다! 출산 확률이 증가합니다.' }]
      },

      // 남자아이 출산 토글
      toggleMaleBirths(payload, ctx) {
        allowMaleBirths = !allowMaleBirths
        ctx.state.village.allowMaleBirths = allowMaleBirths
        const status = allowMaleBirths ? '허용' : '금지'
        return [{ type: 'log', msg: `남자아이 출산: ${status}` }]
      },

      // 여자아이 출산 토글
      toggleFemaleBirths(payload, ctx) {
        allowFemaleBirths = !allowFemaleBirths
        ctx.state.village.allowFemaleBirths = allowFemaleBirths
        const status = allowFemaleBirths ? '허용' : '금지'
        return [{ type: 'log', msg: `여자아이 출산: ${status}` }]
      },

      // 게임 리셋
      reset(payload, ctx) {
        year = 1700
        turn = 1
        food = 1000
        laborDeficit = 0
        month = 1
        people = []
        nextId = 1
        allowMaleBirths = true
        allowFemaleBirths = true
        
        // 초기 마을 사람들 생성 (10명)
        for (let i = 0; i < 10; i++) {
          const age = Math.floor(Math.random() * 50) + 15
          const person = createPerson(null, age)
          people.push(person)
        }
        
        // 상태 업데이트
        ctx.state.village.people = people
        ctx.state.village.nextId = nextId
        ctx.state.village.year = year
        ctx.state.village.turn = turn
        ctx.state.village.food = food
        ctx.state.village.laborDeficit = laborDeficit
        ctx.state.village.month = month
        ctx.state.village.festival = false
        ctx.state.village.allowMaleBirths = allowMaleBirths
        ctx.state.village.allowFemaleBirths = allowFemaleBirths
        
        return [{ type: 'log', msg: '게임을 리셋했습니다.' }]
      },

      // 식량 추가 (디버그용)
      addFood({ amount }, ctx) {
        food += amount
        ctx.state.village.food = food
        return [{ type: 'log', msg: `식량 ${amount} 추가` }]
      }
    },

    update(dt, ctx) {
      // 실시간 업데이트는 필요 없음
    },

    save() {
      return {
        people: people.map(p => ({ ...p })),
        nextId,
        year,
        turn,
        food,
        laborDeficit,
        month,
        allowMaleBirths,
        allowFemaleBirths
      }
    },

    load(data) {
      if (data) {
        people = data.people || []
        nextId = data.nextId || 1
        year = data.year || 1700
        turn = data.turn || 1
        food = data.food || 1000
        laborDeficit = data.laborDeficit || 0
        month = data.month || 1
        allowMaleBirths = data.allowMaleBirths !== undefined ? data.allowMaleBirths : true
        allowFemaleBirths = data.allowFemaleBirths !== undefined ? data.allowFemaleBirths : true
      }
    }
  }
}
