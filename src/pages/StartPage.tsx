import { useState } from 'react'
import './StartPage.css'

type StartPageProps = {
  onStart: (timeLimit: number) => void
}

export function StartPage({ onStart }: StartPageProps) {
  const [timeLimit, setTimeLimit] = useState(60)

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn('Error attempting to enable fullscreen:', err)
      })
    } else {
      document.exitFullscreen()
    }
  }

  return (
    <section className="start-page-container">
      <div className="start-page-content">
        <div className="start-header">
          <p className="start-eyebrow">AI GUARD</p>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="fullscreen-btn"
            aria-label="Toggle fullscreen"
          >
            ⛶
          </button>
        </div>
        
        <h1 className="start-title">ขยับมือ ปกป้องร่างกาย</h1>
        <p className="start-copy">
          เก็บสัญลักษณ์ดี หลบภัยคุกคามสีแดง
        </p>

        <div className="start-items-table">
          <div className="items-column good-items">
            <h3>✅ เก็บ (บวกคะแนน)</h3>
            <ul>
              <li><span className="item-icon">⭐</span> ดาว <span className="item-score">+40</span></li>
              <li><span className="item-icon">🛡️</span> โล่ <span className="item-score">+30</span></li>
              <li><span className="item-icon">💖</span> หัวใจ <span className="item-score">+20</span></li>
            </ul>
          </div>
          <div className="items-column bad-items">
            <h3>❌ หลบ (ลบคะแนน)</h3>
            <ul>
              <li><span className="item-icon">💉</span> เข็มฉีดยา <span className="item-score danger">-24</span></li>
              <li><span className="item-icon">💀</span> สารพิษ <span className="item-score danger">-22</span></li>
              <li><span className="item-icon">🍺</span> แอลกอฮอล์ <span className="item-score danger">-18</span></li>
              <li><span className="item-icon">💊</span> ยาเสพติด <span className="item-score danger">-16</span></li>
            </ul>
          </div>
        </div>

        <div className="start-controls">
          <label htmlFor="timeLimit" className="time-select-label">เวลาการเล่น:</label>
          <select 
            id="timeLimit" 
            className="time-select"
            value={timeLimit} 
            onChange={(e) => setTimeLimit(Number(e.target.value))}
          >
            <option value={30}>30 วินาที</option>
            <option value={60}>60 วินาที</option>
            <option value={90}>90 วินาที</option>
            <option value={120}>120 วินาที</option>
          </select>
        </div>

        <button type="button" className="start-btn-primary" onClick={() => onStart(timeLimit)}>
          เริ่มเล่น
        </button>
      </div>
    </section>
  )
}
