import type { FloatingText, GameEffect, GameItem, HandCursor, Particle } from './types'

const itemColors = {
  pill: '#ff477e',
  needle: '#ff6b6b',
  powder: '#c9184a',
  alcohol: '#ff8fab',
  sport: '#ffbe0b',
  book: '#3a86ff',
  health: '#38b000',
}

const itemLabels = {
  pill: '💊',
  needle: '💉',
  powder: '💀',
  alcohol: '🍺',
  sport: '⚽',
  book: '📚',
  health: '🥗',
}

const itemSpriteCache = new Map<string, HTMLCanvasElement>()

export function clearCanvas(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  context.clearRect(0, 0, width, height)
}

export function drawFloatingTexts(
  context: CanvasRenderingContext2D,
  texts: FloatingText[]
) {
  texts.forEach((txt) => {
    if (!txt.active) return
    
    context.globalAlpha = txt.alpha
    context.fillStyle = txt.color
    
    const popScale = 1 + Math.max(0, 1 - txt.age * 6)
    const fontSize = Math.floor(24 * popScale)
    
    context.font = `900 ${fontSize}px system-ui`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    
    context.shadowColor = 'rgba(0, 0, 0, 0.6)'
    context.shadowBlur = 4
    context.shadowOffsetX = 0
    context.shadowOffsetY = 2
    
    context.fillText(txt.text, txt.x, txt.y)
    
    context.shadowBlur = 0
    context.globalAlpha = 1
  })
}

export function drawParticles(
  context: CanvasRenderingContext2D,
  particles: Particle[]
) {
  particles.forEach((p) => {
    if (!p.active) return
    
    const alpha = Math.max(0, p.life / p.maxLife)
    context.globalAlpha = alpha
    context.fillStyle = p.color
    context.beginPath()
    context.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    context.fill()
  })
  context.globalAlpha = 1
}

export function drawHands(
  context: CanvasRenderingContext2D,
  leftHand: HandCursor,
  rightHand: HandCursor,
) {
  drawHand(context, leftHand, 'rgba(76, 201, 240, 0.86)', 'L')
  drawHand(context, rightHand, 'rgba(61, 220, 151, 0.86)', 'R')
}

export function drawItems(
  context: CanvasRenderingContext2D,
  items: GameItem[],
  lowEffects = false,
) {
  items.forEach((item) => {
    if (!item.active) {
      return
    }

    const sprite = getItemSprite(item.kind, item.radius, lowEffects)
    const halfSize = sprite.width / 2

    context.drawImage(sprite, item.x - halfSize, item.y - halfSize)
  })
}

export function drawEffects(
  context: CanvasRenderingContext2D,
  effects: GameEffect[],
) {
  effects.forEach((effect) => {
    if (!effect.active) {
      return
    }

    context.beginPath()
    context.strokeStyle = effect.color
    context.globalAlpha = effect.alpha
    context.lineWidth = 3
    context.arc(effect.x, effect.y, effect.radius, 0, Math.PI * 2)
    context.stroke()
    context.globalAlpha = 1
  })
}

function drawHand(
  context: CanvasRenderingContext2D,
  hand: HandCursor,
  color: string,
  label: string,
) {
  if (!hand.active) {
    context.beginPath()
    context.strokeStyle = 'rgba(255, 255, 255, 0.25)'
    context.lineWidth = 2
    context.arc(hand.x, hand.y, hand.radius, 0, Math.PI * 2)
    context.stroke()
    return
  }

  // Draw skeleton if landmarks exist
  if (hand.landmarks && hand.landmarks.length > 0) {
    context.beginPath()
    context.strokeStyle = color
    context.lineWidth = 4
    context.lineCap = 'round'
    context.lineJoin = 'round'

    // MediaPipe Hand skeleton connections
    const connections = [
      [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // Index
      [5, 9], [9, 10], [10, 11], [11, 12], // Middle
      [9, 13], [13, 14], [14, 15], [15, 16], // Ring
      [13, 17], [0, 17], [17, 18], [18, 19], [19, 20] // Pinky & Palm
    ]

    connections.forEach(([start, end]) => {
      const p1 = hand.landmarks![start]
      const p2 = hand.landmarks![end]
      if (p1 && p2) {
        context.moveTo(p1.x, p1.y)
        context.lineTo(p2.x, p2.y)
      }
    })
    context.stroke()

    // Draw joints
    hand.landmarks.forEach((p, i) => {
      context.beginPath()
      // Highlight the palm center (index 9) which is used for collision
      context.arc(p.x, p.y, i === 9 ? 8 : 4, 0, Math.PI * 2)
      context.fillStyle = i === 9 ? '#ffff00' : 'rgba(255, 255, 255, 0.6)'
      context.fill()
    })
  }

  // Draw collision area
  context.beginPath()
  context.strokeStyle = 'rgba(255, 255, 255, 0.92)'
  context.lineWidth = 2
  context.setLineDash([4, 4])
  context.arc(hand.x, hand.y, hand.radius, 0, Math.PI * 2)
  context.stroke()
  context.setLineDash([])

  context.fillStyle = '#ffffff'
  context.font = '700 13px system-ui'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(label, hand.x, hand.y - hand.radius - 12)
}

function getItemSprite(
  kind: GameItem['kind'],
  radius: number,
  lowEffects: boolean,
) {
  const roundedRadius = Math.round(radius)
  const cacheKey = `${kind}-${roundedRadius}-${lowEffects ? 'low' : 'full'}`
  const cached = itemSpriteCache.get(cacheKey)

  if (cached) {
    return cached
  }

  const padding = lowEffects ? 2 : 16
  const size = (roundedRadius + padding) * 2
  const center = size / 2
  const sprite = document.createElement('canvas')
  const context = sprite.getContext('2d')

  sprite.width = size
  sprite.height = size

  if (!context) {
    itemSpriteCache.set(cacheKey, sprite)
    return sprite
  }

  if (!lowEffects) {
    context.shadowColor = itemColors[kind]
    context.shadowBlur = 10
  }

  context.font = `800 ${roundedRadius * 1.6}px system-ui`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(itemLabels[kind], center, center + roundedRadius * 0.15)
  context.shadowBlur = 0

  itemSpriteCache.set(cacheKey, sprite)
  return sprite
}
