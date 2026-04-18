export function clampSurfaceOpacity(value: number) {
  if (!Number.isFinite(value)) return 0.8
  return Math.min(1, Math.max(0.2, value))
}

export function createSurfaceTintColor(cssColorVar: string, opacity: number) {
  const normalizedOpacity = clampSurfaceOpacity(opacity)
  const percent = Math.round(normalizedOpacity * 100)
  return `color-mix(in srgb, var(${cssColorVar}) ${percent}%, transparent)`
}

