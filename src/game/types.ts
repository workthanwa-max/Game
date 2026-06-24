export type GameItemKind = 'pill' | 'needle' | 'powder' | 'alcohol' | 'sport' | 'book' | 'health'

export type GameItem = {
  id: number
  kind: GameItemKind
  active: boolean
  x: number
  y: number
  radius: number
  speed: number
  value: number
  wobble: number
  age: number
}

export type HandCursor = {
  x: number
  y: number
  radius: number
  active: boolean
  landmarks?: { x: number; y: number }[]
}

export type GameEffect = {
  active: boolean
  x: number
  y: number
  radius: number
  alpha: number
  color: string
}

export type FloatingText = {
  active: boolean
  x: number
  y: number
  text: string
  color: string
  alpha: number
  age: number
}

export type Particle = {
  active: boolean
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  color: string
  size: number
}
