import React, { useRef, useEffect } from 'react'

function LogPanel({ logs }) {
  const logEndRef = useRef(null)

  const scrollToBottom = () => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [logs])

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
      <h2 style={{ margin: '0 0 15px 0', color: '#2c3e50' }}>
        게임 로그 ({logs.length}개)
      </h2>
      
      <div style={{
        height: '200px',
        overflowY: 'auto',
        border: '1px solid #bdc3c7',
        borderRadius: '4px',
        backgroundColor: 'white',
        padding: '10px',
        fontFamily: 'monospace',
        fontSize: '12px'
      }}>
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
        <div ref={logEndRef} />
      </div>
      
      <div style={{ 
        marginTop: '10px', 
        fontSize: '11px', 
        color: '#7f8c8d',
        textAlign: 'center'
      }}>
        💡 로그는 자동으로 스크롤됩니다
      </div>
    </div>
  )
}

export default LogPanel
