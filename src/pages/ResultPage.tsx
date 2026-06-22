import type { GameResult } from '../app/types'
import './ResultPage.css'

type ResultPageProps = {
  result: GameResult
  onPlayAgain: () => void
}

export function ResultPage({
  result,
  onPlayAgain,
}: ResultPageProps) {
  const rating = getRating(result.rewardLevel)

  return (
    <section className="result-page-container">
      <div className="result-page-content">
        <div className="result-header">
          <p className="result-eyebrow">ผลลัพธ์</p>
          <h1 className="result-score">{result.score} <span className="score-label">คะแนน</span></h1>
          <div className="result-rating-badge">{rating}</div>
        </div>

        <div className="result-stats-grid">
          <div className="stat-card">
            <span className="stat-label">เก็บได้</span>
            <strong className="stat-value text-cyan">{result.collected}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">หลบภัยคุกคาม</span>
            <strong className="stat-value text-green">{result.avoided}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">พลาด</span>
            <strong className="stat-value text-danger">{result.missed}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">คอมโบสูงสุด</span>
            <strong className="stat-value text-yellow">{result.maxCombo}</strong>
          </div>
        </div>

        <button type="button" className="result-btn-primary" onClick={onPlayAgain}>
          เล่นอีกครั้ง
        </button>
      </div>
    </section>
  )
}

function getRating(rewardLevel: number) {
  if (rewardLevel === 4) return '🏆 รางวัลระดับ 4: ผู้พิทักษ์สูงสุด'
  if (rewardLevel === 3) return '🥇 รางวัลระดับ 3: ผู้พิทักษ์ยอดเยี่ยม'
  if (rewardLevel === 2) return '🥈 รางวัลระดับ 2: ผู้พิทักษ์แข็งแกร่ง'
  return '🥉 รางวัลระดับ 1: ผู้พิทักษ์เริ่มต้น'
}
