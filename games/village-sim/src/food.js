// 식량 관리 모듈
export function createFood() {
  let food = 1000 // 초기 식량
  let laborDeficit = 0 // 노동력 부족 누적
  let month = 1

  return {
    id: 'food',
    
    init(ctx) {
      ctx.state.food ??= { 
        current: 1000,
        laborDeficit: 0,
        month: 1
      }
      
      food = ctx.state.food.current
      laborDeficit = ctx.state.food.laborDeficit
      month = ctx.state.food.month
    },

    actions: {
      // 월별 식량 처리는 game.js에서 처리
      monthlyFood(payload, ctx) {
        return []
      },

      // 식량 추가 (디버그용)
      addFood({ amount }, ctx) {
        food += amount
        ctx.state.food.current = food
        return [{ type: 'log', msg: `식량 ${amount} 추가` }]
      }
    },

    update(dt, ctx) {
      // 실시간 업데이트는 필요 없음
    },

    save() {
      return {
        current: food,
        laborDeficit,
        month
      }
    },

    load(data) {
      if (data) {
        food = data.current || 1000
        laborDeficit = data.laborDeficit || 0
        month = data.month || 1
      }
    }
  }
}
