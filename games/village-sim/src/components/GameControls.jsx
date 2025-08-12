import React from 'react'

function GameControls({ onNextTurn, onFestival, onReset }) {
  return (
    <div style={{
      border: '2px solid #34495e',
      borderRadius: '8px',
      padding: '20px',
      backgroundColor: '#ecf0f1'
    }}>
      <h2 style={{ margin: '0 0 15px 0', color: '#2c3e50' }}>게임 컨트롤</h2>
      
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
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
      </div>
    </div>
  )
}

export default GameControls
