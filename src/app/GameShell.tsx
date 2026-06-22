import { useCallback, useEffect, useRef, useState } from 'react'
import { CameraLayer } from '../components/CameraLayer'
import { StartPage } from '../pages/StartPage'
import { PermissionPage } from '../pages/PermissionPage'
import { CalibrationPage } from '../pages/CalibrationPage'
import { CountdownPage } from '../pages/CountdownPage'
import { ResultPage } from '../pages/ResultPage'
import { CanvasLayer } from '../components/CanvasLayer'
import { HudOverlay } from '../components/HudOverlay'
import { drawHands, clearCanvas } from '../game/renderer'
import { clamp } from '../game/math'
import { GameEngine } from '../game/GameEngine'
import { createInitialWristSnapshot } from '../state/refs'
import { requestCameraStream, stopCameraStream } from '../vision/camera'
import { VisionHandler } from '../vision/VisionHandler'
import { getInitialQualityProfile, getVisionFps } from './performance'
import type {
  GamePhase,
  GameResult,
  PermissionStatus,
  QualityProfile,
  VisionMode,
} from './types'

const countdownStart = 3
const readyTarget = {
  holdMs: 3000,
}

const hiddenHandStatus = {
  left: false,
  right: false,
}

export function GameShell() {
  const [phase, setPhase] = useState<GamePhase>('start')
  const [permissionStatus, setPermissionStatus] =
    useState<PermissionStatus>('idle')
  const [countdownValue, setCountdownValue] = useState(countdownStart)
  const [timeLimit, setTimeLimit] = useState(60)
  const [result, setResult] = useState<GameResult | null>(null)
  const [tracking, setTracking] = useState(false)
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [cameraError, setCameraError] = useState('')
  const [visionMode, setVisionMode] = useState<VisionMode>('idle')
  const [readyProgress, setReadyProgress] = useState(0)
  const [handStatus, setHandStatus] = useState(hiddenHandStatus)
  const [qualityProfile] = useState<QualityProfile>(() => getInitialQualityProfile())
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const wristRef = useRef(createInitialWristSnapshot())
  const visionRef = useRef<VisionHandler | null>(null)
  const engineRef = useRef<GameEngine | null>(null)
  const readyStartedAtRef = useRef(0)

  function cleanupSession(updateState = true) {
    engineRef.current?.dispose()
    engineRef.current = null
    visionRef.current?.dispose()
    visionRef.current = null
    stopCameraStream(streamRef.current)
    streamRef.current = null

    if (updateState) {
      setVisionMode('idle')
      setCameraStream(null)
      setReadyProgress(0)
      setHandStatus(hiddenHandStatus)
    }
  }

  const startMockVision = useCallback(() => {
    visionRef.current?.dispose()
    const vision = new VisionHandler({
      wristRef,
      fps: getVisionFps(qualityProfile),
    })

    visionRef.current = vision
    vision.startMock()
    setVisionMode('mock')
    setTracking(true)
  }, [qualityProfile])

  const handleVideoReady = useCallback((videoElement: HTMLVideoElement) => {
    const vision = new VisionHandler({
      wristRef,
      videoElement,
      fps: getVisionFps(qualityProfile),
    })

    visionRef.current?.dispose()
    visionRef.current = vision

    void vision
      .start()
      .then((mode) => {
        setVisionMode(mode)
        setTracking(wristRef.current.tracking)
        setPhase('camera-ready')
      })
      .catch(() => {
        startMockVision()
        setCameraError('เริ่มโมเดลตรวจจับท่าทางไม่ได้ ระบบจึงใช้โหมดจำลองแทน')
        setPhase('camera-ready')
      })
  }, [qualityProfile, startMockVision])

  const handleVideoError = useCallback(() => {
    setPermissionStatus('denied')
    setCameraError('เริ่มภาพจากกล้องไม่ได้ คุณยังเล่นต่อด้วยโหมดจำลองได้')
  }, [])

  const startCountdown = useCallback(() => {
    readyStartedAtRef.current = 0
    setReadyProgress(0)
    setCountdownValue(countdownStart)
    setPhase('countdown')
  }, [])

  useEffect(() => {
    return () => {
      cleanupSession(false)
    }
  }, [])

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) {
        engineRef.current?.pause()
        visionRef.current?.pause()
        return
      }

      visionRef.current?.resume()
      engineRef.current?.resume()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (phase !== 'camera-ready') {
      return
    }

    const timerId = window.setTimeout(() => {
      setPhase('calibration')
    }, 650)

    return () => window.clearTimeout(timerId)
  }, [phase])

  useEffect(() => {
    if (phase === 'playing' || visionMode === 'idle') {
      readyStartedAtRef.current = 0
      
      if (visionMode === 'idle') {
        const canvas = canvasRef.current
        if (canvas) {
          const context = canvas.getContext('2d')
          if (context) {
            clearCanvas(context, canvas.width, canvas.height)
          }
        }
      }
      return
    }

    let frameId = 0

    function tick(now: number) {
      const snapshot = wristRef.current
      const leftReady = isHandReady(snapshot.left)
      const rightReady = isHandReady(snapshot.right)
      const bothHandsReady = leftReady && rightReady

      if (phase === 'calibration') {
        if (bothHandsReady) {
          if (readyStartedAtRef.current === 0) {
            readyStartedAtRef.current = now
          }

          const progress = clampProgress(
            (now - readyStartedAtRef.current) / readyTarget.holdMs,
          )

          setReadyProgress(progress)

          if (progress >= 1) {
            startCountdown()
            return
          }
        } else {
          readyStartedAtRef.current = 0
          setReadyProgress(0)
        }
      } else {
        readyStartedAtRef.current = 0
      }

      // Draw hands on canvas continuously when tracking
      const canvas = canvasRef.current
      if (canvas) {
        const context = canvas.getContext('2d')
        if (context) {
          const { clientWidth, clientHeight } = canvas
          const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
          const width = Math.floor(clientWidth * pixelRatio)
          const height = Math.floor(clientHeight * pixelRatio)
          
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width
            canvas.height = height
            context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
          }
          
          clearCanvas(context, clientWidth, clientHeight)
          
          if (snapshot.tracking) {
            const leftHand = {
               x: clamp(snapshot.left.x, 0, 1) * clientWidth,
               y: clamp(snapshot.left.y, 0, 1) * clientHeight,
               radius: 30,
               active: leftReady,
               landmarks: snapshot.left.landmarks?.map(l => ({ x: l.x * clientWidth, y: l.y * clientHeight }))
            }
            const rightHand = {
               x: clamp(snapshot.right.x, 0, 1) * clientWidth,
               y: clamp(snapshot.right.y, 0, 1) * clientHeight,
               radius: 30,
               active: rightReady,
               landmarks: snapshot.right.landmarks?.map(l => ({ x: l.x * clientWidth, y: l.y * clientHeight }))
            }
            drawHands(context, leftHand, rightHand)
          }
        }
      }

      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)

    return () => window.cancelAnimationFrame(frameId)
  }, [phase, visionMode, startCountdown])

  useEffect(() => {
    if (phase !== 'countdown') {
      return
    }

    const intervalId = window.setInterval(() => {
      setCountdownValue((current) => {
        if (current <= 1) {
          window.clearInterval(intervalId)
          setPhase('playing')
          return countdownStart
        }

        return current - 1
      })
    }, 850)

    return () => window.clearInterval(intervalId)
  }, [phase])

  useEffect(() => {
    if (phase !== 'playing' || !canvasRef.current) {
      return
    }

    const engine = new GameEngine({
      canvas: canvasRef.current,
      wristRef,
      qualityProfile,
      visionMode,
      timeLimit,
      onGameOver: (gameResult) => {
        cleanupSession()
        engineRef.current = null
        setTracking(false)
        setResult(gameResult)
        setPhase('result')
      },
    })

    engineRef.current = engine
    engine.start()

    return () => {
      engine.dispose()
      if (engineRef.current === engine) {
        engineRef.current = null
      }
    }
  }, [phase, qualityProfile, visionMode, timeLimit])

  useEffect(() => {
    if (visionMode === 'idle') {
      return
    }

    const intervalId = window.setInterval(() => {
      const snapshot = wristRef.current
      const nextHandStatus = {
        left: isHandReady(snapshot.left),
        right: isHandReady(snapshot.right),
      }

      setTracking(snapshot.tracking)
      setHandStatus((current) =>
        current.left === nextHandStatus.left && current.right === nextHandStatus.right
          ? current
          : nextHandStatus,
      )
    }, 250)

    return () => window.clearInterval(intervalId)
  }, [visionMode])

  function startPermissionFlow(selectedTimeLimit: number) {
    cleanupSession()
    setTimeLimit(selectedTimeLimit)
    setResult(null)
    setPermissionStatus('idle')
    setCameraError('')
    setVisionMode('idle')
    setTracking(false)
    setHandStatus(hiddenHandStatus)
    setPhase('permission')
  }

  async function requestRealCamera() {
    setPermissionStatus('requesting')
    setCameraError('')

    try {
      const stream = await requestCameraStream(qualityProfile)

      streamRef.current = stream
      setCameraStream(stream)
      setPermissionStatus('granted')
    } catch {
      setPermissionStatus('denied')
      setCameraError('ไม่ได้รับสิทธิ์ใช้กล้อง หรือไม่พบเว็บแคม')
    }
  }

  function playAgain() {
    cleanupSession()
    setResult(null)
    setCameraError('')
    setPermissionStatus('idle')
    setPhase('permission')
  }



  function useMockTracking() {
    cleanupSession()
    setPermissionStatus('granted')
    setCameraError('')
    startMockVision()
    setPhase('camera-ready')
  }

  return (
    <main className="game-shell">
      <CameraLayer
        stream={cameraStream}
        isMockMode={visionMode === 'mock' && phase !== 'start'}
        videoRef={videoRef}
        onVideoReady={handleVideoReady}
        onVideoError={handleVideoError}
      />
      <CanvasLayer canvasRef={canvasRef} />
      <HudOverlay phase={phase} tracking={tracking} mode={visionMode} />

      <div className="ui-overlay">
        {phase === 'start' ? <StartPage onStart={startPermissionFlow} /> : null}
        {phase === 'permission' ? (
          <PermissionPage
            status={permissionStatus}
            errorMessage={cameraError}
            onRequestCamera={() => {
              void requestRealCamera()
            }}
            onUseMock={useMockTracking}
          />
        ) : null}
        {phase === 'camera-ready' ? (
          <section className="flow-panel compact-panel">
            <p className="eyebrow">กล้องพร้อมแล้ว</p>
            <h1>{visionMode === 'real' ? 'กล้องออนไลน์' : 'โหมดจำลองพร้อม'}</h1>
            <p className="panel-copy">
              สนามป้องกันเสถียรแล้ว ขั้นต่อไปคือสแกนตำแหน่งมือ
            </p>
          </section>
        ) : null}
        {phase === 'calibration' ? (
          <CalibrationPage
            leftReady={handStatus.left}
            rightReady={handStatus.right}
            readyProgress={readyProgress}
          />
        ) : null}
        {phase === 'countdown' ? (
          <CountdownPage value={countdownValue} />
        ) : null}
        {phase === 'result' && result ? (
          <ResultPage
            result={result}
            onPlayAgain={playAgain}
          />
        ) : null}
      </div>
    </main>
  )
}

function isHandReady(point: { visible: boolean; active: boolean }) {
  return point.visible && point.active
}

function clampProgress(value: number) {
  return Math.min(1, Math.max(0, value))
}
