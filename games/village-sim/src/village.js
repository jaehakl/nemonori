// 마을 사람 관리 모듈
export function createVillage() {
  let people = []
  let nextId = 1

  // 일본식 이름 생성
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
      id: nextId++,
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

  function updatePerson(person) {
    person.age++
    person.labor = getLabor(person.gender, person.age)
    return person
  }

  function getTotalLabor() {
    return people.reduce((sum, p) => sum + p.labor, 0)
  }

  function getFertileWomen() {
    return people.filter(p => p.gender === 'female' && p.age >= 15 && p.age <= 40)
  }

  function getRandomPerson() {
    if (people.length === 0) return null
    return people[Math.floor(Math.random() * people.length)]
  }

  function removePerson(id) {
    const index = people.findIndex(p => p.id === id)
    if (index !== -1) {
      const removed = people.splice(index, 1)[0]
      return removed
    }
    return null
  }

  return {
    id: 'village',
    
    init(ctx) {
      ctx.state.village ??= { 
        people: [],
        nextId: 1,
        festival: false
      }
      
      // 초기 마을 사람들 생성 (10명)
      for (let i = 0; i < 10; i++) {
        const age = Math.floor(Math.random() * 50) + 15
        const person = createPerson(null, age)
        people.push(person)
      }
      
      ctx.state.village.people = people
      ctx.state.village.nextId = nextId
    },

    actions: {
      // 월별 업데이트는 game.js에서 처리
      monthlyUpdate(payload, ctx) {
        return []
      },

      // 추방
      exile({ personId }, ctx) {
        const person = removePerson(personId)
        if (person) {
          ctx.state.village.people = people
          return [
            { type: 'log', msg: `${person.name}을(를) 마을에서 추방했습니다.` }
          ]
        }
        return [{ type: 'log', msg: '추방할 사람을 찾을 수 없습니다.' }]
      },

      // 축제 개최
      holdFestival(payload, ctx) {
        ctx.state.village.festival = true
        return [{ type: 'log', msg: '축제를 개최했습니다! 출산 확률이 증가합니다.' }]
      }
    },

    update(dt, ctx) {
      // 실시간 업데이트는 필요 없음
    },

    save() {
      return {
        people: people.map(p => ({ ...p })),
        nextId
      }
    },

    load(data) {
      if (data) {
        people = data.people || []
        nextId = data.nextId || 1
      }
    }
  }
}
