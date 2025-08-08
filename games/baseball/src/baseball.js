// 야구 게임 모듈
export function createBaseball() {
  // 내부 메서드들을 모듈 객체 내부로 이동
  const module = {
    id: 'baseball',
    
    init(ctx) {
      ctx.state.baseball ??= {
        gameState: 'waiting', // waiting, playing, finished
        inning: 1,
        balls: 0,
        strikes: 0,
        outs: 0,
        score: { pitcher: 0, batter: 0 },
        gameResult: null, // 'win' | 'lose'
        pitchHistory: []
      }
    },

    actions: {
      // 게임 시작
      startGame(payload, ctx) {
        const state = ctx.state.baseball
        state.gameState = 'playing'
        state.balls = 0
        state.strikes = 0
        state.outs = 0
        state.score = { pitcher: 0, batter: 0 }
        state.gameResult = null
        state.pitchHistory = []
        
        return [
          { type: 'log', msg: '야구 게임을 시작합니다!' },
          { type: 'log', msg: '투수가 공을 던집니다. 구종과 위치를 선택하세요.' }
        ]
      },

      // 투구 실행
      pitch({ pitchType, location }, ctx) {
        const state = ctx.state.baseball
        if (state.gameState !== 'playing') {
          return [{ type: 'log', msg: '게임이 진행 중이 아닙니다.' }]
        }

        // 투구 결과 결정
        const result = module.determinePitchResult(pitchType, location, ctx)
        const effects = []

        // 결과에 따른 상태 업데이트
        switch (result) {
          case 'ball':
            state.balls++
            effects.push({ type: 'log', msg: `볼! (${state.balls}/4)` })
            break
          case 'strike':
            state.strikes++
            effects.push({ type: 'log', msg: `스트라이크! (${state.strikes}/3)` })
            break
          case 'foul':
            if (state.strikes < 2) {
              state.strikes++
              effects.push({ type: 'log', msg: `파울! (${state.strikes}/3)` })
            } else {
              effects.push({ type: 'log', msg: '파울! (2스트라이크에서는 카운트 증가 안됨)' })
            }
            break
          case 'hit':
            state.score.batter++
            effects.push({ type: 'log', msg: '안타! 타자 승리!' })
            break
          case 'out':
            state.outs++
            effects.push({ type: 'log', msg: `범타! 아웃! (${state.outs}/3)` })
            break
        }

        // 투구 기록
        state.pitchHistory.push({
          pitchType,
          location,
          result,
          inning: state.inning
        })

        // 승패 판정
        const gameEnd = module.checkGameEnd(state)
        if (gameEnd) {
          state.gameState = 'finished'
          state.gameResult = gameEnd
          effects.push({ type: 'log', msg: gameEnd === 'win' ? '투수 승리!' : '타자 승리!' })
        }

        return effects
      },

      // 게임 재시작
      restart(payload, ctx) {
        const state = ctx.state.baseball
        state.gameState = 'waiting'
        state.gameResult = null
        return [
          { type: 'log', msg: '새로운 게임을 시작할 준비가 되었습니다.' }
        ]
      }
    },

    // 투구 결과 결정 (내부 메서드)
    determinePitchResult(pitchType, location, ctx) {
      // 구종별 기본 확률
      const pitchProbabilities = {
        'fastball': { ball: 0.15, strike: 0.25, foul: 0.30, hit: 0.20, out: 0.10 },
        'curveball': { ball: 0.20, strike: 0.30, foul: 0.25, hit: 0.15, out: 0.10 },
        'slider': { ball: 0.18, strike: 0.28, foul: 0.27, hit: 0.17, out: 0.10 },
        'changeup': { ball: 0.22, strike: 0.26, foul: 0.28, hit: 0.16, out: 0.08 }
      }

      // 위치별 보정
      const locationBonus = {
        'high-inside': { strike: 0.05, foul: 0.03 },
        'high-middle': { strike: 0.03, foul: 0.05 },
        'high-outside': { strike: 0.02, foul: 0.08 },
        'middle-inside': { strike: 0.04, foul: 0.04 },
        'middle-middle': { strike: 0.02, foul: 0.06 },
        'middle-outside': { strike: 0.01, foul: 0.09 },
        'low-inside': { strike: 0.03, foul: 0.05 },
        'low-middle': { strike: 0.01, foul: 0.07 },
        'low-outside': { strike: 0.00, foul: 0.10 }
      }

      const baseProbs = pitchProbabilities[pitchType] || pitchProbabilities.fastball
      const locationMod = locationBonus[location] || {}

      // 확률 조정
      const adjustedProbs = { ...baseProbs }
      for (const [key, bonus] of Object.entries(locationMod)) {
        adjustedProbs[key] = Math.min(0.95, adjustedProbs[key] + bonus)
      }

      // 확률 정규화
      const total = Object.values(adjustedProbs).reduce((sum, p) => sum + p, 0)
      const normalized = {}
      for (const [key, prob] of Object.entries(adjustedProbs)) {
        normalized[key] = prob / total
      }

      // 랜덤 선택
      const roll = ctx.rand.float()
      let cumulative = 0
      
      for (const [result, prob] of Object.entries(normalized)) {
        cumulative += prob
        if (roll <= cumulative) {
          return result
        }
      }

      return 'ball' // 기본값
    },

    // 게임 종료 체크 (내부 메서드)
    checkGameEnd(state) {
      // 볼 4개 = 타자 승리
      if (state.balls >= 4) {
        return 'lose'
      }
      
      // 안타 = 타자 승리
      if (state.score.batter > 0) {
        return 'lose'
      }
      
      // 스트라이크 3개 = 투수 승리
      if (state.strikes >= 3) {
        return 'win'
      }
      
      // 아웃 3개 = 투수 승리
      if (state.outs >= 3) {
        return 'win'
      }
      
      return null // 게임 계속
    },

    save() {
      return { v: 1, baseball: this.state?.baseball }
    },

    load(data) {
      if (data?.baseball) {
        this.state = { ...this.state, baseball: data.baseball }
      }
    }
  }

  return module
}
