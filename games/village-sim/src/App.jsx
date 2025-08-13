import React, { useState, useEffect } from 'react'
import { createKernel } from '@nori/core-kernel'
import { createVillage } from './village'
import VillageStatus from './components/VillageStatus'
import PeopleList from './components/PeopleList'
import GameControls from './components/GameControls'
import LogPanel from './components/LogPanel'
import ChartPanel from './components/ChartPanel'

function App() {
  const [kernel, setKernel] = useState(null)
  const [tick, setTick] = useState(0)
  const [autoPlay, setAutoPlay] = useState(true) // 자동 진행 상태
  const [gameSpeed, setGameSpeed] = useState(1000) // 게임 속도 (밀리초)

  useEffect(() => {
    // 커널 초기화
    const k = createKernel('village-sim-seed', [
      createVillage()
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

  // 자동 턴 진행
  useEffect(() => {
    if (!kernel || !autoPlay) return

    const interval = setInterval(() => {
      kernel.dispatch('village', 'nextTurn')
    }, gameSpeed)

    return () => clearInterval(interval)
  }, [kernel, autoPlay, gameSpeed])

  if (!kernel) {
    return <div>로딩 중...</div>
  }

  const handleNextTurn = () => {
    kernel.dispatch('village', 'nextTurn')
  }

  const handleExile = (personId) => {
    kernel.dispatch('village', 'exile', { personId })
  }

  const handleFestival = () => {
    kernel.dispatch('village', 'holdFestival')
  }

  const handleReset = () => {
    kernel.dispatch('village', 'reset')
  }

  const handleToggleMaleBirths = () => {
    kernel.dispatch('village', 'toggleMaleBirths')
  }

  const handleToggleFemaleBirths = () => {
    kernel.dispatch('village', 'toggleFemaleBirths')
  }

  const toggleAutoPlay = () => {
    setAutoPlay(!autoPlay)
  }

  const changeSpeed = (speed) => {
    setGameSpeed(speed)
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
          <VillageStatus 
            kernel={kernel} 
            autoPlay={autoPlay}
            gameSpeed={gameSpeed}
          />
          <GameControls 
            onNextTurn={handleNextTurn}
            onFestival={handleFestival}
            onReset={handleReset}
            autoPlay={autoPlay}
            onToggleAutoPlay={toggleAutoPlay}
            gameSpeed={gameSpeed}
            onSpeedChange={changeSpeed}
            allowMaleBirths={kernel.ctx.state.village?.allowMaleBirths ?? true}
            allowFemaleBirths={kernel.ctx.state.village?.allowFemaleBirths ?? true}
            onToggleMaleBirths={handleToggleMaleBirths}
            onToggleFemaleBirths={handleToggleFemaleBirths}
          />
        </div>
        
        <div>
          <PeopleList 
            people={kernel.ctx.state.village?.people || []}
            onExile={handleExile}
          />
        </div>
      </div>
      
      {/* 차트 패널 추가 */}
      <ChartPanel villageState={kernel.ctx.state.village} />
      
      <LogPanel logs={kernel.ctx.log} />
    </div>
  )
}

export default App
