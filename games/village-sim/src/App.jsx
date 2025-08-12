import React, { useState, useEffect } from 'react'
import { createKernel } from '@nori/core-kernel'
import { createVillage } from './village'
import { createFood } from './food'
import { createGame } from './game'
import VillageStatus from './components/VillageStatus'
import PeopleList from './components/PeopleList'
import GameControls from './components/GameControls'
import LogPanel from './components/LogPanel'

function App() {
  const [kernel, setKernel] = useState(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    // 커널 초기화
    const k = createKernel('village-sim-seed', [
      createVillage(),
      createFood(),
      createGame()
    ])
    
    setKernel(k)
  }, [])

  useEffect(() => {
    if (!kernel) return

    // 이펙트 적용 시 UI 갱신
    const rerender = () => setTick(t => t + 1)
    kernel.ctx.bus.on('effects.applied', rerender)
    
    return () => {
      kernel.ctx.bus.off('effects.applied', rerender)
    }
  }, [kernel])

  if (!kernel) {
    return <div>로딩 중...</div>
  }

  const handleNextTurn = () => {
    kernel.dispatch('game', 'nextTurn')
  }

  const handleExile = (personId) => {
    kernel.dispatch('game', 'exile', { personId })
  }

  const handleFestival = () => {
    kernel.dispatch('game', 'holdFestival')
  }

  const handleReset = () => {
    kernel.dispatch('game', 'reset')
  }

  return (
    <div className="app" style={{ 
      maxWidth: '1200px', 
      margin: '0 auto', 
      padding: '20px',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1 style={{ textAlign: 'center', color: '#2c3e50' }}>
        1700년대 일본 농촌 마을 경영
      </h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        <div>
          <VillageStatus kernel={kernel} />
          <GameControls 
            onNextTurn={handleNextTurn}
            onFestival={handleFestival}
            onReset={handleReset}
          />
        </div>
        
        <div>
          <PeopleList 
            people={kernel.ctx.state.village?.people || []}
            onExile={handleExile}
          />
        </div>
      </div>
      
      <LogPanel logs={kernel.ctx.log} />
    </div>
  )
}

export default App
