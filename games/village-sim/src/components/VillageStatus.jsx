import React from 'react'

function VillageStatus({ kernel }) {
  const village = kernel.ctx.state.village
  const food = kernel.ctx.state.food
  const game = kernel.ctx.state.game
  
  if (!village || !food || !game) return <div>로딩 중...</div>

  const people = village.people || []
  const totalLabor = people.reduce((sum, p) => sum + p.labor, 0)
  const fertileWomen = people.filter(p => p.gender === 'female' && p.age >= 15 && p.age <= 40).length
  const children = people.filter(p => p.age < 15).length
  const elderly = people.filter(p => p.age > 60).length

  const monthNames = [
    '1월', '2월', '3월', '4월', '5월', '6월',
    '7월', '8월', '9월', '10월', '11월', '12월'
  ]

  return (
    <div style={{
      border: '2px solid #34495e',
      borderRadius: '8px',
      padding: '20px',
      backgroundColor: '#ecf0f1',
      marginBottom: '20px'
    }}>
      <h2 style={{ margin: '0 0 15px 0', color: '#2c3e50' }}>마을 상태</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
        <div>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>기본 정보</h3>
          <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
            <div><strong>연도:</strong> {game.year}년</div>
            <div><strong>월:</strong> {monthNames[game.turn - 1]}</div>
            <div><strong>총 인구:</strong> {people.length}명</div>
            <div><strong>총 노동력:</strong> {totalLabor}인분</div>
          </div>
        </div>
        
        <div>
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>인구 구성</h3>
          <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
            <div><strong>가임기 여성:</strong> {fertileWomen}명</div>
            <div><strong>어린이 (15세 미만):</strong> {children}명</div>
            <div><strong>노인 (60세 초과):</strong> {elderly}명</div>
            <div><strong>노동 가능 인구:</strong> {people.length - children - elderly}명</div>
          </div>
        </div>
      </div>
      
      <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#fff', borderRadius: '4px' }}>
        <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>식량 현황</h3>
        <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
          <div><strong>현재 식량:</strong> {food.current}개</div>
          <div><strong>월 소비량:</strong> {people.length}개</div>
          <div><strong>노동력 부족:</strong> {food.laborDeficit}인분</div>
          <div style={{ 
            color: food.current < people.length ? '#e74c3c' : '#27ae60',
            fontWeight: 'bold'
          }}>
            {food.current < people.length ? '⚠️ 식량 부족!' : '✅ 식량 충분'}
          </div>
        </div>
      </div>
      
      {village.festival && (
        <div style={{ 
          marginTop: '15px', 
          padding: '10px', 
          backgroundColor: '#f39c12', 
          color: 'white',
          borderRadius: '4px',
          textAlign: 'center',
          fontWeight: 'bold'
        }}>
          🎉 축제 진행 중! 출산 확률 증가
        </div>
      )}
    </div>
  )
}

export default VillageStatus
