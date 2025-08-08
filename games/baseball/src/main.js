import { createKernel } from '@nori/core-kernel'
import { createBaseball } from './baseball.js'

// 게임 상태
let kernel = null
let selectedPitchType = null
let selectedLocation = null

// DOM 요소들
const ballsEl = document.getElementById('balls')
const strikesEl = document.getElementById('strikes')
const outsEl = document.getElementById('outs')
const gameResultEl = document.getElementById('game-result')
const gameLogEl = document.getElementById('game-log')
const pitchBtn = document.getElementById('pitch-btn')
const startBtn = document.getElementById('start-btn')
const restartBtn = document.getElementById('restart-btn')

// 게임 초기화
function initGame() {
    kernel = createKernel('baseball-game-' + Date.now(), [createBaseball()])
    
    // 이벤트 버스 구독
    kernel.ctx.bus.on('effects.applied', (effects) => {
        updateUI()
    })
}

// UI 업데이트
function updateUI() {
    const state = kernel.ctx.state.baseball
    
    // 상태 업데이트
    ballsEl.textContent = state.balls
    strikesEl.textContent = state.strikes
    outsEl.textContent = state.outs
    
    // 게임 결과 표시
    if (state.gameResult) {
        gameResultEl.style.display = 'block'
        gameResultEl.className = `game-result result-${state.gameResult}`
        gameResultEl.textContent = state.gameResult === 'win' ? '🎉 투수 승리!' : '😔 타자 승리!'
        
        pitchBtn.disabled = true
        restartBtn.style.display = 'inline-block'
    } else {
        gameResultEl.style.display = 'none'
        pitchBtn.disabled = state.gameState !== 'playing'
        restartBtn.style.display = 'none'
    }
    
    // 로그 업데이트
    updateLog()
}

// 로그 업데이트
function updateLog() {
    gameLogEl.innerHTML = ''
    kernel.ctx.log.forEach(entry => {
        const logEntry = document.createElement('div')
        logEntry.className = 'log-entry'
        logEntry.textContent = entry.msg
        gameLogEl.appendChild(logEntry)
    })
    gameLogEl.scrollTop = gameLogEl.scrollHeight
}

// 구종 선택
document.querySelectorAll('[data-pitch-type]').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('[data-pitch-type]').forEach(b => b.classList.remove('selected'))
        btn.classList.add('selected')
        selectedPitchType = btn.dataset.pitchType
        updatePitchButton()
    })
})

// 위치 선택
document.querySelectorAll('[data-location]').forEach(zone => {
    zone.addEventListener('click', () => {
        document.querySelectorAll('[data-location]').forEach(z => z.classList.remove('selected'))
        zone.classList.add('selected')
        selectedLocation = zone.dataset.location
        updatePitchButton()
    })
})

// 투구 버튼 상태 업데이트
function updatePitchButton() {
    pitchBtn.disabled = !(selectedPitchType && selectedLocation && kernel?.ctx.state.baseball.gameState === 'playing')
}

// 투구 실행
pitchBtn.addEventListener('click', () => {
    if (selectedPitchType && selectedLocation) {
        kernel.dispatch('baseball', 'pitch', {
            pitchType: selectedPitchType,
            location: selectedLocation
        })
        
        // 선택 초기화
        selectedPitchType = null
        selectedLocation = null
        document.querySelectorAll('[data-pitch-type], [data-location]').forEach(el => {
            el.classList.remove('selected')
        })
        updatePitchButton()
    }
})

// 게임 시작
startBtn.addEventListener('click', () => {
    kernel.dispatch('baseball', 'startGame')
})

// 게임 재시작
restartBtn.addEventListener('click', () => {
    kernel.dispatch('baseball', 'restart')
})

// 게임 초기화
initGame()
updateUI()
