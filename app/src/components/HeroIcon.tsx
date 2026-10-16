// Large illustrative icons for the hero card. Decorative: the headline carries the meaning.
export type HeroKind = 'clear' | 'cyclone' | 'rain'

export function HeroIcon({ kind, size = 72 }: { kind: HeroKind; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 64 64',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 3,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
  if (kind === 'cyclone')
    return (
      <svg {...common}>
        <path d="M32 26a6 6 0 1 1-6 6" />
        <path d="M14 22c6-10 20-14 30-8" />
        <path d="M50 42c-6 10-20 14-30 8" />
        <path d="M44 14c8 6 10 16 6 24" />
        <path d="M20 50c-8-6-10-16-6-24" />
      </svg>
    )
  if (kind === 'rain')
    return (
      <svg {...common}>
        <path d="M18 38a10 10 0 0 1 1-20 14 14 0 0 1 27 3 9 9 0 0 1 0 17H18Z" />
        <path d="M22 46l-3 8M32 46l-3 8M42 46l-3 8" />
      </svg>
    )
  return (
    <svg {...common}>
      <path d="M32 8 12 16v14c0 13 8.5 22.5 20 26 11.5-3.5 20-13 20-26V16L32 8Z" />
      <path d="m23 32 6 6 12-13" />
    </svg>
  )
}

export function Wave({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 80 C 80 40, 160 120, 240 80 S 360 40, 400 70 L 400 120 L 0 120 Z" fill="currentColor" opacity="0.12" />
      <path d="M0 95 C 90 70, 170 125, 260 95 S 360 70, 400 90 L 400 120 L 0 120 Z" fill="currentColor" opacity="0.1" />
    </svg>
  )
}
