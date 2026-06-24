import type { MutableRefObject } from 'react'
import type { GameResult, QualityProfile, VisionMode, WristSnapshot } from '../app/types'
import { labelForVisionMode } from '../components/HudOverlay'
import { circlesOverlap } from './collision'
import { activateItem, createItemPool } from './items'
import { clamp, lerp, normalizeDelta } from './math'
import { clearCanvas, drawEffects, drawFloatingTexts, drawHands, drawItems, drawParticles } from './renderer'
import { ObjectPool } from './ObjectPool'
import type { FloatingText, GameEffect, GameItem, GameItemKind, HandCursor, Particle } from './types'

type GameEngineOptions = {
  canvas: HTMLCanvasElement
  wristRef: MutableRefObject<WristSnapshot>
  onGameOver: (result: GameResult) => void
  qualityProfile: QualityProfile
  visionMode: VisionMode
  timeLimit: number
}

const FRAME_BUDGET_MS = 16.6
const HEAVY_FRAME_SKIP_FRAMES = 3

export class GameEngine {
  private nextEffectIndex = 0
  private heavyFrameSkip = 0
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private readonly wristRef: MutableRefObject<WristSnapshot>
  private readonly onGameOver: (result: GameResult) => void
  private readonly qualityProfile: QualityProfile
  private readonly visionMode: VisionMode
  private readonly timeLimit: number
  private readonly pool = new ObjectPool(createItemPool(40))
  private readonly effects = createEffectPool(18)
  private readonly floatingTexts = createFloatingTextPool(15)
  private readonly particles = createParticlePool(60)
  private readonly leftHand: HandCursor = { x: 0, y: 0, radius: 30, active: false }
  private readonly rightHand: HandCursor = { x: 0, y: 0, radius: 30, active: false }
  private readonly hud = {
    score: null as HTMLElement | null,
    health: null as HTMLElement | null,
    healthBar: null as HTMLElement | null,
    combo: null as HTMLElement | null,
    tracking: null as HTMLElement | null,
    feedback: null as HTMLElement | null,
    perf: null as HTMLElement | null,
  }
  private readonly shell: HTMLElement | null
  private resizeObserver: ResizeObserver | null = null
  private animationFrameId = 0
  private lastTime = 0
  private startedAt = 0
  private spawnTimer = 0
  private spawnSeed = 1
  private canvasWidth = 0
  private canvasHeight = 0
  private needsResize = true
  private score = 0
  private activeItemCount = 0
  private collected = 0
  private avoided = 0
  private missed = 0
  private combo = 0
  private maxCombo = 0
  private lastHudScore = -1
  private lastHudTime = -1
  private lastHudCombo = -1
  private lastHudTracking = ''
  private pauseStartedAt = 0
  private shakeTimer = 0
  private hitPauseTimer = 0
  private frameSampleStartedAt = 0
  private frameSamples = 0
  private slowFrameReports = 0
  private lastPerfLabel = ''
  private ecoMode = false
  private running = false
  private paused = false
  private audioCtx: AudioContext | null = null

  constructor({
    canvas,
    wristRef,
    onGameOver,
    qualityProfile,
    visionMode,
    timeLimit,
  }: GameEngineOptions) {
    const context = canvas.getContext('2d', {
      alpha: true,
    })

    if (!context) {
      throw new Error('ไม่พบ Canvas 2D context')
    }

    this.canvas = canvas
    this.context = context
    this.wristRef = wristRef
    this.onGameOver = onGameOver
    this.qualityProfile = qualityProfile
    this.visionMode = visionMode
    this.timeLimit = timeLimit
    this.hud.score = document.getElementById('game-score')
    this.hud.health = document.getElementById('game-health')
    this.hud.healthBar = document.getElementById('game-health-bar')
    this.hud.combo = document.getElementById('game-combo')
    this.hud.tracking = document.getElementById('game-tracking')
    this.hud.feedback = document.getElementById('game-feedback')
    this.hud.perf = document.getElementById('game-perf')
    this.shell = canvas.closest('.game-shell')
  }

  start() {
    if (this.running) {
      return
    }

    this.running = true
    this.startedAt = performance.now()
    this.lastTime = this.startedAt
    this.score = 0
    this.collected = 0
    this.avoided = 0
    this.missed = 0
    this.combo = 0
    this.maxCombo = 0
    this.spawnTimer = 0
    this.spawnSeed = 1
    this.activeItemCount = 0
    this.lastHudScore = -1
    this.lastHudTime = -1
    this.lastHudCombo = -1
    this.lastHudTracking = ''
    this.pauseStartedAt = 0
    this.frameSampleStartedAt = this.startedAt
    this.frameSamples = 0
    this.slowFrameReports = 0
    this.lastPerfLabel = ''
    this.needsResize = true
    this.ecoMode = this.qualityProfile === 'performance'
    this.paused = false
    this.pool.reset()
    this.effects.forEach((effect) => {
      effect.active = false
    })
    this.floatingTexts.forEach((txt) => {
      txt.active = false
    })
    this.particles.forEach((p) => {
      p.active = false
    })
    if (this.hud.feedback) {
      this.hud.feedback.textContent = ''
    }
    this.shell?.classList.remove('low-health', 'is-paused')
    this.shell?.classList.toggle('perf-eco', this.ecoMode)
    this.resizeCanvas(true)
    this.observeCanvasSize()
    this.seedHands()
    this.updateHud()
    this.playStartSound()
    this.animationFrameId = window.requestAnimationFrame(this.tick)
  }

  stop() {
    if (!this.running) {
      return
    }

    this.running = false
    window.cancelAnimationFrame(this.animationFrameId)
    clearCanvas(this.context, this.canvas.width, this.canvas.height)
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
  }

  pause() {
    if (!this.running || this.paused) {
      return
    }

    this.paused = true
    this.pauseStartedAt = performance.now()
    window.cancelAnimationFrame(this.animationFrameId)
    this.shell?.classList.add('is-paused')
  }

  resume() {
    if (!this.running || !this.paused) {
      return
    }

    const now = performance.now()

    this.paused = false
    this.startedAt += now - this.pauseStartedAt
    this.lastTime = now
    this.frameSampleStartedAt = now
    this.shell?.classList.remove('is-paused')
    this.needsResize = true
    this.animationFrameId = window.requestAnimationFrame(this.tick)
  }

  dispose() {
    this.stop()
    this.pool.reset()
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.shell?.classList.remove(
      'low-health',
      'is-paused',
      'perf-eco',
    )
  }

  private readonly tick = (now: number) => {
    if (!this.running || this.paused) {
      return
    }

    // Avoid wasting CPU when the tab is hidden; keep RAF running but skip heavy work
    if (typeof document !== 'undefined' && document.hidden) {
      // still update timestamps so time deltas remain sane
      this.lastTime = now
      this.animationFrameId = window.requestAnimationFrame(this.tick)
      return
    }

    const frameWorkStart = performance.now()

    const elapsedSeconds = (now - this.startedAt) / 1000

    if (elapsedSeconds >= this.timeLimit) {
      this.finish()
      return
    }

    const delta = normalizeDelta(now - this.lastTime)
    this.lastTime = now

    if (this.hitPauseTimer > 0) {
      this.hitPauseTimer -= delta
      this.render()
      this.updateHud()
      this.animationFrameId = window.requestAnimationFrame(this.tick)
      return
    }

    if (this.shakeTimer > 0) {
      this.shakeTimer -= delta
    }

    if (this.needsResize) {
      this.resizeCanvas()
      this.needsResize = false
    }
    this.updateHands()

    this.updateItems(delta, elapsedSeconds)

    // skip effects update when we recently detected heavy frames
    if (this.heavyFrameSkip > 0) {
      this.heavyFrameSkip -= 1
    } else {
      this.updateEffects(delta)
    }

    this.render()
    this.updateHud()
    this.updatePerformance(now)

    const frameWorkMs = performance.now() - frameWorkStart
    if (frameWorkMs > FRAME_BUDGET_MS * 2) {
      // very slow frame: go into eco mode and skip effects for a few frames
      this.ecoMode = true
      this.shell?.classList.add('perf-eco')
      this.heavyFrameSkip = HEAVY_FRAME_SKIP_FRAMES
    }

    this.animationFrameId = window.requestAnimationFrame(this.tick)
  }

  private resizeCanvas(force = false) {
    const { clientWidth, clientHeight } = this.canvas
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
    const width = Math.floor(clientWidth * pixelRatio)
    const height = Math.floor(clientHeight * pixelRatio)

    this.canvasWidth = clientWidth
    this.canvasHeight = clientHeight

    if (force || this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
      this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    }
  }

  private observeCanvasSize() {
    if (this.resizeObserver || !('ResizeObserver' in window)) {
      return
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.needsResize = true
    })
    this.resizeObserver.observe(this.canvas)
  }

  private seedHands() {
    this.leftHand.x = this.canvasWidth * 0.38
    this.leftHand.y = this.canvasHeight * 0.62
    this.rightHand.x = this.canvasWidth * 0.62
    this.rightHand.y = this.canvasHeight * 0.62
  }

  private updateHands() {
    const { left, right } = this.wristRef.current
    const smoothing = this.wristRef.current.tracking ? 0.55 : 0.18

    // Default seed positions used when tracking is lost to avoid the cursor disappearing
    const defaultLeftX = this.canvasWidth * 0.38
    const defaultLeftY = this.canvasHeight * 0.62
    const defaultRightX = this.canvasWidth * 0.62
    const defaultRightY = this.canvasHeight * 0.62

    // LEFT
    const leftVisible = !!left.visible
    const targetLeftX = leftVisible ? clamp(left.x, 0, 1) * this.canvasWidth : defaultLeftX
    const targetLeftY = leftVisible ? clamp(left.y, 0, 1) * this.canvasHeight : defaultLeftY

    // Keep a visible/active cursor when tracking is lost so players cannot exploit disappearance
    this.leftHand.active = leftVisible ? left.active : true
    this.leftHand.x = lerp(this.leftHand.x, targetLeftX, leftVisible ? smoothing : 0.35)
    this.leftHand.y = lerp(this.leftHand.y, targetLeftY, leftVisible ? smoothing : 0.35)
    this.leftHand.landmarks = left.landmarks?.map(l => ({ x: l.x * this.canvasWidth, y: l.y * this.canvasHeight }))

    // RIGHT
    const rightVisible = !!right.visible
    const targetRightX = rightVisible ? clamp(right.x, 0, 1) * this.canvasWidth : defaultRightX
    const targetRightY = rightVisible ? clamp(right.y, 0, 1) * this.canvasHeight : defaultRightY

    this.rightHand.active = rightVisible ? right.active : true
    this.rightHand.x = lerp(this.rightHand.x, targetRightX, rightVisible ? smoothing : 0.35)
    this.rightHand.y = lerp(this.rightHand.y, targetRightY, rightVisible ? smoothing : 0.35)
    this.rightHand.landmarks = right.landmarks?.map(l => ({ x: l.x * this.canvasWidth, y: l.y * this.canvasHeight }))
  }

  private updateItems(delta: number, elapsedSeconds: number) {
    const difficultyRampSeconds = this.timeLimit * 0.85
    const difficulty = clamp(elapsedSeconds / difficultyRampSeconds, 0, 1)
    const activeLimit = this.getActiveItemLimit(difficulty)

    this.spawnTimer -= delta
    if (this.spawnTimer <= 0 && this.activeItemCount < activeLimit) {
      const item = this.pool.acquire()

      if (item) {
        activateItem(item, this.canvasWidth, difficulty)
        this.activeItemCount += 1
        this.spawnSeed += 1
      }

      this.spawnTimer = this.getSpawnInterval(difficulty)
    }

    // cache reference to avoid repeated property lookups
    const all = this.pool.all
    for (let i = 0, len = all.length; i < len; i++) {
      const item = all[i]
      if (!item.active) {
        continue
      }

      item.age += delta
      item.y += item.speed * delta
      item.x += Math.sin(item.age * 3.6 + item.wobble) * delta * 16

      const hitLeft =
        this.leftHand.active &&
        circlesOverlap(
          item.x,
          item.y,
          item.radius,
          this.leftHand.x,
          this.leftHand.y,
          this.leftHand.radius,
        )
      const hitRight =
        this.rightHand.active &&
        circlesOverlap(
          item.x,
          item.y,
          item.radius,
          this.rightHand.x,
          this.rightHand.y,
          this.rightHand.radius,
        )

      if (hitLeft || hitRight) {
        this.collectItem(item.kind, item.x, item.y)
        this.activateEffect(item.x, item.y, item.kind)
        this.releaseItem(item)
        continue
      }

      if (item.y - item.radius > this.canvasHeight) {
        this.handleMissedItem(item.kind)
        this.releaseItem(item)
      }
    }
  }

  private collectItem(kind: GameItemKind, x: number, y: number) {
    if (isHarmful(kind)) {
      const penalty = getDamage(kind)
      this.score -= penalty
      this.combo = 0
      this.playDamageSound()
      this.shakeTimer = 0.2
      this.hitPauseTimer = 0.05
      this.activateFloatingText(x, y, `-${penalty}`, '#ff477e')
      return
    }

    const gain = getScore(kind, this.combo)

    this.collected += 1
    this.combo += 1
    this.maxCombo = Math.max(this.maxCombo, this.combo)
    this.score += gain
    this.playCollectSound(this.combo)
    
    let textColor = '#7df9ff'
    if (this.combo >= 20) {
      textColor = '#ff6b6b'
    } else if (this.combo >= 10) {
      textColor = '#ffd166'
    }
    
    this.activateFloatingText(x, y, `+${gain}`, textColor)
    this.activateParticles(x, y, textColor)
  }

  private handleMissedItem(kind: GameItemKind) {
    if (isHarmful(kind)) {
      this.avoided += 1
      return
    }

    this.missed += 1
    this.combo = 0
  }

  private render() {
    clearCanvas(this.context, this.canvasWidth, this.canvasHeight)
    
    if (this.shakeTimer > 0) {
      const shakeX = (Math.random() - 0.5) * 14
      const shakeY = (Math.random() - 0.5) * 14
      this.context.save()
      this.context.translate(shakeX, shakeY)
    }

    drawItems(this.context, this.pool.all, this.ecoMode)
    if (!this.ecoMode) {
      drawEffects(this.context, this.effects)
      drawParticles(this.context, this.particles)
    }
    drawHands(this.context, this.leftHand, this.rightHand)
    if (!this.ecoMode) {
      drawFloatingTexts(this.context, this.floatingTexts)
    }

    if (this.shakeTimer > 0) {
      this.context.restore()
    }
  }

  private updateHud() {
    if (this.hud.score && this.score !== this.lastHudScore) {
      this.hud.score.textContent = String(this.score)
      this.lastHudScore = this.score
    }

    const remainingSeconds = Math.max(0, Math.ceil(this.timeLimit - (performance.now() - this.startedAt) / 1000))
    if (this.hud.health && remainingSeconds !== this.lastHudTime) {
      this.hud.health.textContent = `${remainingSeconds}s`
      this.shell?.classList.toggle('low-health', remainingSeconds <= 10)
      this.lastHudTime = remainingSeconds
    }

    if (this.hud.combo && this.combo !== this.lastHudCombo) {
      this.hud.combo.textContent = String(this.combo)
      this.lastHudCombo = this.combo
    }

    const trackingLabel = this.wristRef.current.tracking
      ? labelForVisionMode(this.visionMode)
      : 'หลุด'

    if (this.hud.tracking && trackingLabel !== this.lastHudTracking) {
      this.hud.tracking.textContent = trackingLabel
      this.lastHudTracking = trackingLabel
    }
  }

  private finish() {
    this.running = false
    window.cancelAnimationFrame(this.animationFrameId)
    clearCanvas(this.context, this.canvas.width, this.canvas.height)
    this.playGameOverSound()

    this.onGameOver({
      score: this.score,
      collected: this.collected,
      avoided: this.avoided,
      missed: this.missed,
      maxCombo: this.maxCombo,
      rewardLevel: getRewardLevel(this.score),
    })
  }

  private initAudio() {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume()
      }
      return this.audioCtx
    } catch (e) {
      return null
    }
  }

  private playStartSound() {
    const ctx = this.initAudio()
    if (!ctx) return
    try {
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(440, ctx.currentTime) // A4
      oscillator.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.1) // A5
      oscillator.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.3) // A6

      gainNode.gain.setValueAtTime(0, ctx.currentTime)
      gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05)
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.start()
      oscillator.stop(ctx.currentTime + 0.5)
    } catch (e) {
      console.warn('Could not play start sound', e)
    }
  }

  private playCollectSound(combo: number) {
    const ctx = this.initAudio()
    if (!ctx) return
    try {
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      const baseFreq = 440 // A4
      const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24] // Major pentatonic
      const stepIndex = Math.min(Math.max(0, combo - 1), steps.length - 1)
      const freq = baseFreq * Math.pow(2, steps[stepIndex] / 12)

      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(freq, ctx.currentTime)

      gainNode.gain.setValueAtTime(0, ctx.currentTime)
      gainNode.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.01)
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.start()
      oscillator.stop(ctx.currentTime + 0.15)
    } catch (e) {
      // ignore
    }
  }

  private playDamageSound() {
    const ctx = this.initAudio()
    if (!ctx) return
    try {
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.type = 'sawtooth'
      oscillator.frequency.setValueAtTime(150, ctx.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(50, ctx.currentTime + 0.2)

      gainNode.gain.setValueAtTime(0, ctx.currentTime)
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02)
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2)

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.start()
      oscillator.stop(ctx.currentTime + 0.2)
    } catch (e) {
      // ignore
    }
  }

  private playGameOverSound() {
    const ctx = this.initAudio()
    if (!ctx) return
    try {
      const oscillator = ctx.createOscillator()
      const gainNode = ctx.createGain()

      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(440, ctx.currentTime)
      oscillator.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.4)
      oscillator.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.8)

      gainNode.gain.setValueAtTime(0, ctx.currentTime)
      gainNode.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.05)
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8)

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.start()
      oscillator.stop(ctx.currentTime + 0.8)
    } catch (e) {
      // ignore
    }
  }

  private activateFloatingText(x: number, y: number, text: string, color: string) {
    if (this.ecoMode) return
    const txt = this.floatingTexts.find(t => !t.active)
    if (!txt) return
    
    txt.active = true
    txt.x = x
    txt.y = y
    txt.text = text
    txt.color = color
    txt.alpha = 1
    txt.age = 0
  }

  private activateParticles(x: number, y: number, color: string) {
    if (this.ecoMode) return
    let count = 5
    for (let i = 0; i < this.particles.length && count > 0; i++) {
      const p = this.particles[i]
      if (!p.active) {
        p.active = true
        p.x = x
        p.y = y
        const angle = Math.random() * Math.PI * 2
        const speed = Math.random() * 160 + 90
        p.vx = Math.cos(angle) * speed
        p.vy = Math.sin(angle) * speed
        p.maxLife = Math.random() * 0.3 + 0.2
        p.life = p.maxLife
        p.color = color
        p.size = Math.random() * 2.5 + 2
        count--
      }
    }
  }

  private releaseItem(item: GameItem) {
    if (item.active) {
      this.activeItemCount = Math.max(0, this.activeItemCount - 1)
    }

    this.pool.release(item)
  }

  private activateEffect(x: number, y: number, kind: GameItemKind) {
    // use rotating index to avoid linear search with .find()
    const len = this.effects.length
    for (let i = 0; i < len; i++) {
      const idx = (this.nextEffectIndex + i) % len
      const effect = this.effects[idx]
      if (!effect.active) {
        effect.active = true
        effect.x = x
        effect.y = y
        effect.radius = isHarmful(kind) ? 18 : 14
        effect.alpha = 0.9
        effect.color = isHarmful(kind) ? '#ff477e' : '#7df9ff'
        this.nextEffectIndex = (idx + 1) % len
        return
      }
    }
    // no free effect slot => drop
  }

  private updateEffects(delta: number) {
    if (this.ecoMode) {
      return
    }

    // if recent frames were heavy we skip computing effects to save CPU
    if (this.heavyFrameSkip > 0) {
      return
    }

    for (const effect of this.effects) {
      if (!effect.active) {
        continue
      }

      effect.radius += 86 * delta
      effect.alpha -= 2.8 * delta

      if (effect.alpha <= 0) {
        effect.active = false
      }
    }

    for (const txt of this.floatingTexts) {
      if (!txt.active) continue
      
      txt.age += delta
      txt.y -= 120 * delta
      txt.alpha = Math.max(0, 1 - (txt.age / 0.8))
      
      if (txt.alpha <= 0) {
        txt.active = false
      }
    }

    for (const p of this.particles) {
      if (!p.active) continue
      
      p.life -= delta
      p.vy += 700 * delta
      p.x += p.vx * delta
      p.y += p.vy * delta
      
      if (p.life <= 0) {
        p.active = false
      }
    }
  }

  private updatePerformance(now: number) {
    this.frameSamples += 1

    const sampleMs = now - this.frameSampleStartedAt

    if (sampleMs < 750) {
      return
    }

    const fps = Math.round((this.frameSamples * 1000) / sampleMs)
    const visionStats = this.wristRef.current.stats
    const label = visionStats
      ? `${this.ecoMode ? 'ประหยัด' : 'ปกติ'} R${fps} V${visionStats.fps} ${visionStats.inferenceMs}ms`
      : `${this.ecoMode ? 'ประหยัด' : 'ปกติ'} ${fps} เฟรม/วิ`

    if (this.hud.perf && label !== this.lastPerfLabel) {
      this.hud.perf.textContent = label
      this.lastPerfLabel = label
    }

    if (fps < 45 || (visionStats?.inferenceMs ?? 0) > 32) {
      this.slowFrameReports += 1
    } else {
      this.slowFrameReports = Math.max(0, this.slowFrameReports - 1)
    }

    if (!this.ecoMode && this.slowFrameReports >= 2) {
      this.ecoMode = true
      this.shell?.classList.add('perf-eco')
    }

    this.frameSamples = 0
    this.frameSampleStartedAt = now
  }

  private getActiveItemLimit(difficulty: number) {
    const baseLimit = this.ecoMode ? 4 : 5
    const ramp = this.ecoMode ? 3 : 6

    return baseLimit + Math.floor(difficulty * ramp)
  }

  private getSpawnInterval(difficulty: number) {
    const baseInterval = this.ecoMode ? 0.8 : 0.62
    const ramp = this.ecoMode ? 0.18 : 0.28

    return baseInterval - difficulty * ramp
  }
}

function createEffectPool(size: number): GameEffect[] {
  return Array.from({ length: size }, () => ({
    active: false,
    x: 0,
    y: 0,
    radius: 0,
    alpha: 0,
    color: '#ffffff',
  }))
}

function isHarmful(kind: GameItemKind) {
  return kind === 'pill' || kind === 'needle' || kind === 'powder' || kind === 'alcohol'
}

function getDamage(kind: GameItemKind) {
  if (kind === 'needle') {
    return 24
  }

  if (kind === 'powder') {
    return 22
  }

  if (kind === 'alcohol') {
    return 18
  }

  return 16
}

function getScore(kind: GameItemKind, combo: number) {
  const bonus = Math.floor(combo / 3) * 5

  if (kind === 'sport') {
    return 40 + bonus
  }

  if (kind === 'book') {
    return 30 + bonus
  }

  return 20 + bonus
}

export function getRewardLevel(score: number) {
  if (score >= 1500) {
    return 4
  }

  if (score >= 1000) {
    return 3
  }

  if (score >= 500) {
    return 2
  }

  return 1
}

function createFloatingTextPool(size: number): FloatingText[] {
  return Array.from({ length: size }, () => ({
    active: false,
    x: 0,
    y: 0,
    text: '',
    color: '#ffffff',
    alpha: 0,
    age: 0,
  }))
}

function createParticlePool(size: number): Particle[] {
  return Array.from({ length: size }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 0,
    color: '#ffffff',
    size: 0,
  }))
}
