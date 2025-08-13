import React, { useEffect, useRef, useState } from 'react'

// 통합 차트 컴포넌트 (모든 데이터를 하나의 차트에 겹쳐서 표시)
const CombinedChart = ({ data, width = 800, height = 400, title, series }) => {
  const canvasRef = useRef(null)
  
  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    
    // 캔버스 초기화
    ctx.clearRect(0, 0, width, height)
    
    // 데이터가 없으면 기본 그리드만 그리기
    if (!data || !data.population || data.population.length === 0) {
      // 기본 그리드 그리기
      ctx.strokeStyle = '#e0e0e0'
      ctx.lineWidth = 1
      for (let i = 0; i <= 4; i++) {
        const y = (height - 20) * (i / 4) + 10
        ctx.beginPath()
        ctx.moveTo(40, y)
        ctx.lineTo(width - 10, y)
        ctx.stroke()
      }
      
      // "데이터 없음" 메시지
      ctx.fillStyle = '#999'
      ctx.font = '14px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('데이터가 없습니다', width / 2, height / 2)
      return
    }
    
         // 모든 데이터의 최대값 찾기 (y축 최소값은 0으로 고정)
     const allValues = series.map(seriesData => {
       if (seriesData.dataKey === 'food') {
         return data[seriesData.dataKey].map(d => d.value / 100)
       }
       return data[seriesData.dataKey].map(d => d.value)
     }).flat()
     const maxValue = Math.max(...allValues, 1) // 최소값 1 보장
    
    // 그리드 그리기
    ctx.strokeStyle = '#e0e0e0'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const y = (height - 20) * (i / 4) + 10
      ctx.beginPath()
      ctx.moveTo(40, y)
      ctx.lineTo(width - 10, y)
      ctx.stroke()
    }
    
    // Y축 라벨 (0부터 최대값까지)
    ctx.fillStyle = '#666'
    ctx.font = '12px Arial'
    ctx.textAlign = 'right'
    for (let i = 0; i <= 4; i++) {
      const value = Math.round(maxValue * (4 - i) / 4)
      const y = (height - 20) * (i / 4) + 15
      ctx.fillText(value, 35, y)
    }
    
    // X축 라벨
    ctx.textAlign = 'center'
    const step = Math.max(1, Math.floor(data.population.length / 5))
    for (let i = 0; i < data.population.length; i += step) {
      const x = 40 + (i / (data.population.length - 1)) * (width - 50)
      ctx.fillText(data.population[i].label, x, height - 5)
    }
    
         // 범례 그리기
     const legendItems = series.map(s => ({ label: s.name, color: s.color }))
    
    ctx.font = '12px Arial'
         legendItems.forEach((item, index) => {
       const x = width - 200
       const y = 20 + index * 20
      
      // 범례 색상 표시
      ctx.fillStyle = item.color
      ctx.fillRect(x, y - 8, 12, 12)
      
      // 범례 텍스트
      ctx.fillStyle = '#333'
      ctx.textAlign = 'left'
      ctx.fillText(item.label, x + 18, y)
    })
    
         // 각 데이터 시리즈 그리기
     const seriesData = series.map(s => ({
       data: s.dataKey === 'food' ? data[s.dataKey].map(d => ({ ...d, value: d.value / 100 })) : data[s.dataKey],
       color: s.color,
       name: s.name
     }))
    
         seriesData.forEach(seriesData => {
      if (!seriesData.data || seriesData.data.length === 0) return
      
      // 선 그래프 그리기
      ctx.strokeStyle = seriesData.color
      ctx.lineWidth = 2
      ctx.beginPath()
      
      seriesData.data.forEach((point, i) => {
        const x = 40 + (i / (seriesData.data.length - 1)) * (width - 50)
        const y = height - 20 - (point.value / maxValue) * (height - 40) + 10
        
        if (i === 0) {
          ctx.moveTo(x, y)
        } else {
          ctx.lineTo(x, y)
        }
      })
      
      ctx.stroke()
      
      // 점 그리기
      ctx.fillStyle = seriesData.color
      seriesData.data.forEach((point, i) => {
        const x = 40 + (i / (seriesData.data.length - 1)) * (width - 50)
        const y = height - 20 - (point.value / maxValue) * (height - 40) + 10
        
        ctx.beginPath()
        ctx.arc(x, y, 3, 0, 2 * Math.PI)
        ctx.fill()
      })
    })
    
  }, [data, width, height])
  
  return (
    <div style={{ margin: '10px 0' }}>
      <h4 style={{ margin: '0 0 10px 0', textAlign: 'center' }}>{title}</h4>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ border: '1px solid #ddd', borderRadius: '4px' }}
      />
    </div>
  )
}

const ChartPanel = ({ villageState }) => {
  const [chartData, setChartData] = useState({
    population: [],
    labor: [],
    food: [],
    fertileWomen: [],
    fertileWomenRatio: [],
    maleChildrenRatio: [],
    femaleChildrenRatio: []
  })
  
  useEffect(() => {
    if (!villageState) return
    
    const currentTurn = villageState.turn
    const currentYear = villageState.year
    const currentMonth = villageState.month
    
         // 12월에만 데이터 추가 (연도별 업데이트)
     if (currentMonth === 12) {
       setChartData(prev => {
         const newData = {
           population: [
             ...prev.population,
             {
               label: `${currentYear}년`,
               value: villageState.people.length
             }
           ].slice(-100), // 최근 100개 데이터만 유지
           
           labor: [
             ...prev.labor,
             {
               label: `${currentYear}년`,
               value: villageState.people.reduce((sum, p) => sum + p.labor, 0)
             }
           ].slice(-100),
           
           food: [
             ...prev.food,
             {
               label: `${currentYear}년`,
               value: villageState.food
             }
           ].slice(-100),
           
                       fertileWomen: [
              ...prev.fertileWomen,
              {
                label: `${currentYear}년`,
                value: villageState.people.filter(p => p.gender === 'female' && p.age >= 18 && p.age <= 39).length
              }
            ].slice(-100),
            
            fertileWomenRatio: [
              ...prev.fertileWomenRatio,
              {
                label: `${currentYear}년`,
                value: villageState.people.length > 0 ? 
                  (villageState.people.filter(p => p.gender === 'female' && p.age >= 18 && p.age <= 39).length / villageState.people.length * 100).toFixed(1) : 0
              }
            ].slice(-100),
            
            maleChildrenRatio: [
              ...prev.maleChildrenRatio,
              {
                label: `${currentYear}년`,
                value: villageState.people.length > 0 ? 
                  (villageState.people.filter(p => p.gender === 'male' && p.age < 15).length / villageState.people.length * 100).toFixed(1) : 0
              }
            ].slice(-100),
            
            femaleChildrenRatio: [
              ...prev.femaleChildrenRatio,
              {
                label: `${currentYear}년`,
                value: villageState.people.length > 0 ? 
                  (villageState.people.filter(p => p.gender === 'female' && p.age < 15).length / villageState.people.length * 100).toFixed(1) : 0
              }
            ].slice(-100)
         }
         
         return newData
       })
     }
  }, [villageState.year, villageState.month, villageState.people.length, villageState.food])
  
  if (!villageState) return null
  
  const totalPopulation = villageState.people.length
  const workingAge = villageState.people.filter(p => p.age >= 15 && p.age <= 65).length
  const children = villageState.people.filter(p => p.age < 15).length
  const elderly = villageState.people.filter(p => p.age > 65).length
  const totalLabor = villageState.people.reduce((sum, p) => sum + p.labor, 0)
  
  
  return (
    <div style={{ 
      padding: '15px', 
      backgroundColor: '#f8f9fa', 
      borderRadius: '8px',
      margin: '10px 0'
    }}>  
             {/* 통합 차트들 */}
       <div style={{ 
         display: 'grid', 
         gridTemplateColumns: '1fr 1fr', 
         gap: '20px',
         marginBottom: '20px'
       }}>
                                       <CombinedChart 
             data={chartData} 
             title="📈 마을 변화 통합 차트" 
             width={500}
             height={350}
             series={[
               { dataKey: 'population', color: '#4CAF50', name: '인구' },
               { dataKey: 'labor', color: '#2196F3', name: '노동력' },
               { dataKey: 'food', color: '#FF9800', name: '식량/100' }
             ]}
           />
         
                                       <CombinedChart 
             data={chartData} 
             title="📊 인구 비율 변화 차트" 
             width={500}
             height={350}
             series={[
               { dataKey: 'fertileWomenRatio', color: '#E91E63', name: '가임기여성비율(%)' },
               { dataKey: 'maleChildrenRatio', color: '#2196F3', name: '남자어린이비율(%)' },
               { dataKey: 'femaleChildrenRatio', color: '#FF9800', name: '여자어린이비율(%)' }
             ]}
           />
       </div>
    </div>
  )
}

export default ChartPanel
