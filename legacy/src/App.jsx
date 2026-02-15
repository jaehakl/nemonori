import React, { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom'
import './App.css'

// 게임 정보와 컴포넌트를 통합하여 관리
const gamePackages = {
  'text-rpg': {
    package: () => import('../games/text-rpg/package.json'),
    component: React.lazy(() => import('../games/text-rpg/src/App'))
  },
  'village-sim': {
    package: () => import('../games/village-sim/package.json'),
    component: React.lazy(() => import('../games/village-sim/src/App'))
  }
}

function Launcher() {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // games 폴더를 자동으로 탐색하여 게임 목록 생성
    const discoverGames = async () => {
      try {
        const discoveredGames = await Promise.all(
          Object.keys(gamePackages).map(async (folderName) => {
            try {
              // package.json 파일을 동적으로 import하여 게임 정보 추출
              const packageData = await gamePackages[folderName].package()
              const gameInfo = packageData.default.game
              
              return {
                id: folderName,
                name: gameInfo.displayName,
                description: gameInfo.description,
                icon: gameInfo.icon,
                path: `/${folderName}`,
                folder: folderName,
                version: packageData.default.version,
                author: gameInfo.author
              }
            } catch (error) {
              console.error(`${folderName} 게임 정보 로딩 실패:`, error)
              // 기본 정보로 폴백
              return {
                id: folderName,
                name: folderName,
                description: `${folderName} 게임`,
                icon: '🎮',
                path: `/${folderName}`,
                folder: folderName,
                version: 'unknown',
                author: 'unknown'
              }
            }
          })
        )
        
        setGames(discoveredGames)
      } catch (error) {
        console.error('게임 탐색 중 오류 발생:', error)
        setGames([])
      } finally {
        setLoading(false)
      }
    }

    discoverGames()
  }, [])

  if (loading) {
    return <div className="loading">게임 목록을 로딩 중...</div>
  }

  return (
    <div className="launcher">
      <div className="launcher-header">
        <h1>🎮 Nemonori</h1>
        <p>JavaScript 기반 게임 모노레포</p>
      </div>

      <div className="games-grid">
        {games.map(game => (
          <Link key={game.id} to={game.path} className="game-card">
            <div className="game-icon">{game.icon}</div>
            <div className="game-title">{game.name}</div>
            <div className="game-description">{game.description}</div>
            <div className="game-meta">
              <span className="game-version">v{game.version}</span>
              <span className="game-author">by {game.author}</span>
            </div>
          </Link>
        ))}
      </div>

      <div className="launcher-footer">
        <p>
          <a href="https://github.com/jaehakl/nemonori/blob/main/doc/manual.md" target="_blank">개발자 매뉴얼</a> | 
          <a href="https://github.com/jaehakl/nemonori" target="_blank">GitHub</a>
        </p>
      </div>
    </div>
  )
}

function App() {
  return (
    <Router basename={import.meta.env.BASE_URL}>
      <div className="app">
        <Routes>
          <Route path="/" element={<Launcher />} />
          {/* 게임 라우트를 반복문으로 자동 생성 */}
          {Object.entries(gamePackages).map(([gameId, gameData]) => (
            <Route 
              key={gameId}
              path={`/${gameId}`} 
              element={
                <React.Suspense fallback={<div className="loading">게임을 로딩 중...</div>}>
                  <gameData.component />
                </React.Suspense>
              } 
            />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
