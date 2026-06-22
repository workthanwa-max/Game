import type { PermissionStatus } from '../app/types'
import './PermissionPage.css'

type PermissionPageProps = {
  status: PermissionStatus
  errorMessage: string
  onRequestCamera: () => void
  onUseMock: () => void
}

export function PermissionPage({
  status,
  errorMessage,
  onRequestCamera,
  onUseMock,
}: PermissionPageProps) {
  return (
    <section className="permission-page-container">
      <div className="permission-page-content" role="dialog" aria-modal="true" aria-label="Permission">
        <p className="permission-eyebrow">สิทธิ์</p>
        <h1 className="permission-title">อนุญาตกล้อง</h1>
        <p className="permission-copy">เปิดเว็บแคมเพื่อให้ระบบตรวจจับตำแหน่งมือ</p>
        
        {errorMessage && (
          <p className="permission-error">{errorMessage}</p>
        )}
        
        <div className="permission-actions">
          <button 
            type="button" 
            className="permission-btn-primary" 
            onClick={onRequestCamera} 
            disabled={status === 'requesting'}
          >
            {status === 'requesting' ? 'กำลังเปิดกล้อง...' : 'เปิดกล้อง'}
          </button>
          <button 
            type="button" 
            className="permission-btn-secondary" 
            onClick={onUseMock}
          >
            ใช้โหมดจำลอง
          </button>
        </div>
      </div>
    </section>
  )
}
