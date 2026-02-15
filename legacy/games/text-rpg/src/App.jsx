import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { createKernel } from '@nori/core-kernel'
import { createNarrative } from '@nori/narrative'
import story from './story.json'
import './App.css'

function useGame() {
  const kernel = useMemo(() => {
    const modNarr = createNarrative({ nodes: story.nodes, start: story.start })
    const k = createKernel('seed-demo', [modNarr])
    k.dispatch('narrative', 'start')
    return k
  }, [])
  const [, setTick] = useState(0)
  const refresh = () => setTick(t => t + 1)
  return [kernel, refresh]
}

function App() {
  const [k, refresh] = useGame()
  const nodeId = k.ctx.state?.narrative?.nodeId
  const node = story.nodes[nodeId]
  const res = k.ctx.state.resources || {}
  const flags = k.ctx.state.flags || {}

  function choose(i) {
    k.dispatch('narrative', 'choose', { index: i })
    refresh()
  }

  return (
    <div className="wrap">
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="kpi">💰 gold: <b>{res.gold || 0}</b></div>
        <div className="kpi">📍 node: <b>{nodeId}</b></div>
        <button className="btn" onClick={() => { k.dispatch('narrative', 'start'); refresh() }}>Restart</button>
      </div>

      <div className="card">
        <div className="title">{nodeId.toUpperCase()}</div>
        <div style={{ marginBottom: 12 }}>{node.text}</div>
        <div className="row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          {node.choices?.map((c, i) => {
            const disabled = c.req ? ((k.ctx.state.flags[c.req.key] || false) !== (c.req.v ?? true)) : false
            return (
              <button key={i} className="choice" onClick={() => choose(i)} disabled={disabled}>
                {c.text} {disabled ? ' (요건 미충족)' : ''}
              </button>
            )
          })}
        </div>
        <div className="log">
          {k.ctx.log.slice(-10).map((l, i) => (<div key={i}>• {l.msg}</div>))}
        </div>
        <div style={{ opacity: .6, marginTop: 6, fontSize: 12 }}>
          flags: {Object.keys(flags).length ? JSON.stringify(flags) : '없음'}
        </div>
      </div>
    </div>
  )
}

export default App
