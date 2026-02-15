import React, { useRef, useEffect, useState } from 'react'

function LogPanel({ logs }) {
  const logContainerRef = useRef(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  
  const scrollToBottom = () => {
    if (logContainerRef.current) {
      const container = logContainerRef.current
      container.scrollTop = container.scrollHeight
      setIsAtBottom(true)
    }
  }

  const checkScrollPosition = () => {
    if (logContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current
      const isBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10
      setIsAtBottom(isBottom)
    }
  }

  // 로그가 추가될 때마다 자동 스크롤
  useEffect(() => {
    if (logs && logs.length > 0) {
      scrollToBottom()
    }
  }, [logs?.length])

  const getLogIcon = (msg) => {
    if (msg.includes('낳았습니다')) return '👶'
    if (msg.includes('세상을 떠났습니다')) return '💀'
    if (msg.includes('굶어 죽었습니다')) return '💀'
    if (msg.includes('추방했습니다')) return '🚪'
    if (msg.includes('축제')) return '🎉'
    if (msg.includes('수확')) return '🌾'
    if (msg.includes('년') && msg.includes('월')) return '📅'
    return '📝'
  }

  return (
    <div style={{
      border: '2px solid #34495e',
      borderRadius: '8px',
      padding: '20px',
      backgroundColor: '#ecf0f1',
      marginTop: '20px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
        <h2 style={{ margin: 0, color: '#2c3e50' }}>
          게임 로그 ({logs.length}개)
        </h2>
        <button
          onClick={scrollToBottom}
          style={{
            backgroundColor: '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            padding: '5px 10px',
            fontSize: '12px',
            cursor: 'pointer'
          }}
        >
          🔽 맨 아래로
        </button>
      </div>
      
      <div 
        ref={logContainerRef}
        onScroll={checkScrollPosition}
        style={{
          height: '200px',
          overflowY: 'auto',
          border: '1px solid #bdc3c7',
          borderRadius: '4px',
          backgroundColor: 'white',
          padding: '10px',
          fontFamily: 'monospace',
          fontSize: '12px'
        }}
      >
        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#7f8c8d', padding: '20px' }}>
            아직 로그가 없습니다.
          </div>
        ) : (
          logs.map((log, index) => (
            <div key={index} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              marginBottom: '5px',
              padding: '3px 0',
              borderBottom: '1px solid #f0f0f0'
            }}>
              <span style={{ fontSize: '14px' }}>
                {getLogIcon(log.msg)}
              </span>
              <span style={{ 
                color: log.msg.includes('죽었습니다') || log.msg.includes('추방') ? '#e74c3c' : 
                       log.msg.includes('낳았습니다') || log.msg.includes('축제') ? '#27ae60' :
                       log.msg.includes('수확') ? '#f39c12' : '#2c3e50'
              }}>
                {log.msg}
              </span>
            </div>
          ))
                 )}
       </div>
      
      <div style={{ 
        marginTop: '10px', 
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '11px', 
        color: '#7f8c8d'
      }}>
        <span>
          💡 {isAtBottom ? '자동 스크롤 활성화' : '자동 스크롤 비활성화 (위로 스크롤됨)'}
        </span>
        {!isAtBottom && (
          <button
            onClick={scrollToBottom}
            style={{
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '10px',
              cursor: 'pointer',
              transition: 'background-color 0.2s'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#2980b9'}
            onMouseOut={(e) => e.target.style.backgroundColor = '#3498db'}
          >
            맨 아래로
          </button>
        )}
      </div>
    </div>
  )
}

export default LogPanel
