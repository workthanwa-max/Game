import './CalibrationPage.css'

type CalibrationPageProps = {
  leftReady: boolean
  rightReady: boolean
  readyProgress: number
}

export function CalibrationPage({
  leftReady,
  rightReady,
  readyProgress,
}: CalibrationPageProps) {
  return (
    <section className="calib-page-container">
      <div className="calib-page-content" role="dialog" aria-modal="true" aria-label="Calibration">
        <h2 className="calib-title">
          ยกมือทั้ง 2 ข้างค้างไว้
        </h2>
        
        <div className="calib-hands-grid">
          <div className={`calib-hand-card ${leftReady ? 'ready' : 'missing'}`}>
            <strong>L</strong>
            <span>{leftReady ? 'พร้อม' : 'ไม่พบ'}</span>
          </div>
          <div className={`calib-hand-card ${rightReady ? 'ready' : 'missing'}`}>
            <strong>R</strong>
            <span>{rightReady ? 'พร้อม' : 'ไม่พบ'}</span>
          </div>
        </div>
        
        <div className="calib-progress-track">
          <div 
            className="calib-progress-fill" 
            style={{ width: `${Math.round(readyProgress * 100)}%` }} 
          />
        </div>
      </div>
    </section>
  )
}
