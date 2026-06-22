export const theme = {
  colors: {
    bg: '#0a1128', // cyber blue
    panel: 'rgba(16,24,40,0.8)',
    accent: '#00e6ff', // neon cyan
    accent2: '#4cc9f0',
    text: '#ffffff',
    muted: '#94a3b8',
    danger: '#ff4d6d',
    holoGlass: 'rgba(12,24,48,0.75)',
    holoBorder: 'rgba(76,201,240,0.15)'
  },
  radius: '10px',
  shadow: '0 10px 30px rgba(0,0,0,0.6)',
  shadowStrong: '0 30px 90px rgba(0,0,0,0.7)',
  transitionFast: '170ms cubic-bezier(.2,.9,.3,1)',
  font: "'Orbitron', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

export function applyTheme() {
  const root = document.documentElement
  const c = theme.colors
  root.style.setProperty('--bg', c.bg)
  root.style.setProperty('--panel', c.panel)
  root.style.setProperty('--accent', c.accent)
  root.style.setProperty('--accent-2', c.accent2)
  root.style.setProperty('--text-high', c.text)
  root.style.setProperty('--muted-text', c.muted)
  root.style.setProperty('--danger', c.danger)
  root.style.setProperty('--holo-glass', c.holoGlass)
  root.style.setProperty('--holo-border', c.holoBorder)
  root.style.setProperty('--radius', theme.radius)
  root.style.setProperty('--shadow', theme.shadow)
  root.style.setProperty('--shadow-strong', theme.shadowStrong)
  root.style.setProperty('--transition-fast', theme.transitionFast)
  root.style.setProperty('--font-sans', theme.font)
}

export default theme
