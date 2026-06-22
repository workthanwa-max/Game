import type { GameItem, GameItemKind } from './types'

const itemKinds: GameItemKind[] = [
  'pill',
  'needle',
  'powder',
  'alcohol',
  'shield',
  'heart',
  'star',
]
const harmfulKinds: GameItemKind[] = ['pill', 'needle', 'powder', 'alcohol']

// remember last spawn to optionally create nearby complementary spawns
let lastSpawnX: number | null = null
let lastSpawnKind: GameItemKind | null = null

export function createItemPool(size: number): GameItem[] {
  return Array.from({ length: size }, (_, index) => ({
    id: index,
    kind: itemKinds[index % itemKinds.length],
    active: false,
    x: 0,
    y: 0,
    radius: 18,
    speed: 120,
    value: 10,
    wobble: 0,
    age: 0,
  }))
}

export function activateItem(
  item: GameItem,
  canvasWidth: number,
  difficulty: number,
) {
  // Use Math.random() directly to ensure truly random item spawn positions and types
  const rand = () => Math.random()

  const kind = pickItemKindFromRand(rand)

  // spread across the full canvas width instead of fixed lanes
  const margin = Math.max(60, canvasWidth * 0.06)
  const rawX = margin + rand() * Math.max(0, canvasWidth - margin * 2)

  // decide whether to spawn this item near the previous spawn (pairing)
  const pairChance = 0.45
  let finalX = rawX
  if (lastSpawnX !== null && lastSpawnKind !== null) {
    const lastWasHarm = harmfulKinds.includes(lastSpawnKind)
    const thisIsHarm = harmfulKinds.includes(kind)
    // prefer pairing harmful with non-harmful (and vice versa)
    if (rand() < pairChance && lastWasHarm !== thisIsHarm) {
      const maxOffset = Math.max(40, canvasWidth * 0.06)
      finalX = Math.max(
        margin,
        Math.min(canvasWidth - margin, lastSpawnX + (rand() - 0.5) * maxOffset),
      )
    }
  }

  item.active = true
  item.kind = kind
  item.x = Math.max(margin, Math.min(canvasWidth - margin, finalX))
  item.y = -24
  item.radius = harmfulKinds.includes(kind) ? 22 : 18
  item.speed = 130 + difficulty * 80 + rand() * 40
  item.value = getItemValue(kind)
  item.wobble = (rand() - 0.5) * 3.0
  item.age = 0

  // record this spawn for possible pairing next time
  lastSpawnX = item.x
  lastSpawnKind = kind
}

function pickItemKindFromRand(rand: () => number): GameItemKind {
  const p = rand()
  if (p < 0.38) return harmfulKinds[Math.floor(rand() * harmfulKinds.length)]
  if (p < 0.58) return 'star'
  if (p < 0.78) return 'heart'
  return 'shield'
}

function getItemValue(kind: GameItemKind) {
  if (kind === 'shield') {
    return 30
  }

  if (kind === 'heart') {
    return 20
  }

  if (kind === 'star') {
    return 35
  }

  return -18
}
