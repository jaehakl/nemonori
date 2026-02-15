import React from 'react'

function GameControls({ 
  onNextTurn, 
  onFestival, 
  onReset, 
  autoPlay, 
  onToggleAutoPlay, 
  gameSpeed, 
  onSpeedChange,
  allowMaleBirths,
  allowFemaleBirths,
  onToggleMaleBirths,
  onToggleFemaleBirths
}) {
  return (
    <div style={{
      border: '2px solid #34495e',
      borderRadius: '8px',
      padding: '20px',
      backgroundColor: '#ecf0f1'
    }}>
      <h2 style={{ margin: '0 0 15px 0', color: '#2c3e50' }}>게임 컨트롤</h2>
      
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '15px' }}>
        <button
          onClick={onNextTurn}
          style={{
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '12px 20px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
            flex: '1',
            minWidth: '120px'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#2980b9'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#3498db'}
        >
          ⏭️ 다음 턴
        </button>
        
        <button
          onClick={onFestival}
          style={{
            backgroundColor: '#f39c12',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '12px 20px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
            flex: '1',
            minWidth: '120px'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#e67e22'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#f39c12'}
        >
          🎉 축제 개최
        </button>
        
        <button
          onClick={onReset}
          style={{
            backgroundColor: '#e74c3c',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            padding: '12px 20px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'pointer',
            transition: 'background-color 0.2s',
            flex: '1',
            minWidth: '120px'
          }}
          onMouseOver={(e) => e.target.style.backgroundColor = '#c0392b'}
          onMouseOut={(e) => e.target.style.backgroundColor = '#e74c3c'}
        >
          🔄 게임 리셋
        </button>
      </div>

      {/* 성별 출산 토글 컨트롤과 자동진행 컨트롤 */}
      <div style={{ 
        display: 'flex', 
        gap: '20px', 
        marginBottom: '15px',
        alignItems: 'center',
        flexDirection: 'row'
      }}>
        {/* 자동 진행 컨트롤 */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '10px',
          flexShrink: 0
        }}>
          <button
            onClick={onToggleAutoPlay}
            style={{
              backgroundColor: autoPlay ? '#27ae60' : '#95a5a6',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              padding: '10px 15px',
              fontSize: '14px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
              minWidth: '100px'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = autoPlay ? '#229954' : '#7f8c8d'}
            onMouseOut={(e) => e.target.style.backgroundColor = autoPlay ? '#27ae60' : '#95a5a6'}
          >
            {autoPlay ? '⏸️ 일시정지' : '▶️ 자동진행'}
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#2c3e50' }}>속도:</span>
            <select
              value={gameSpeed}
              onChange={(e) => onSpeedChange(Number(e.target.value))}
              style={{
                padding: '8px',
                borderRadius: '4px',
                border: '1px solid #bdc3c7',
                fontSize: '14px',
                backgroundColor: 'white'
              }}
            >
              <option value={1000}>1x 보통</option>
              <option value={100}>10x 빠름</option>
              <option value={33}>30x 매우 빠름</option>
              <option value={10}>100x 초고속</option>
            </select>
          </div>
        </div>
        {/* 성별 출산 토글 */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px',
          backgroundColor: '#fff',
          padding: '10px',
          borderRadius: '6px',
          border: '1px solid #bdc3c7',
          flexShrink: 0
        }}>
          <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#2c3e50' }}>출산 제어:</span>
          <button
            onClick={onToggleMaleBirths}
            style={{
              backgroundColor: allowMaleBirths ? '#27ae60' : '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
              minWidth: '80px'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = allowMaleBirths ? '#229954' : '#c0392b'}
            onMouseOut={(e) => e.target.style.backgroundColor = allowMaleBirths ? '#27ae60' : '#e74c3c'}
          >
            {allowMaleBirths ? '👶 남자' : '🚫 남자'}
          </button>
          <button
            onClick={onToggleFemaleBirths}
            style={{
              backgroundColor: allowFemaleBirths ? '#27ae60' : '#e74c3c',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '8px 12px',
              fontSize: '12px',
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
              minWidth: '80px'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = allowFemaleBirths ? '#229954' : '#c0392b'}
            onMouseOut={(e) => e.target.style.backgroundColor = allowFemaleBirths ? '#27ae60' : '#e74c3c'}
          >
            {allowFemaleBirths ? '👶 여자' : '🚫 여자'}
          </button>
        </div>      </div>
      
      <div style={{ 
        marginTop: '15px', 
        padding: '10px', 
        backgroundColor: '#fff', 
        borderRadius: '4px',
        fontSize: '12px',
        color: '#7f8c8d'
      }}>
        <div style={{ marginBottom: '5px' }}><strong>게임 규칙:</strong></div>
        <div>• 1턴 = 1개월, 1년 = 12턴</div>
        <div>• 식량: 인구 1명당 월 1개 소비</div>
        <div>• 농사: 월 100인분 노동력 필요, 10월 수확</div>
        <div>• 출산: 가임기 여성 월 3% (축제 시 10%)</div>
        <div>• 사망: 나이/10000 확률로 자연사</div>
        <div style={{ marginTop: '5px', color: '#e74c3c' }}>
          • 출산 제어: 토글 버튼으로 남자/여자 아기 출산을 선택적으로 제어할 수 있습니다
        </div>
      </div>
    </div>
  )
}

export default GameControls
