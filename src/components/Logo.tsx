interface LogoProps {
  className?: string
  size?: number
  strokeWidth?: number
}

export function LogoMark({ className = '', size = 28, strokeWidth = 2.4 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="16" r="7" fill="none" stroke="currentColor" strokeWidth={strokeWidth}/>
      <circle cx="20" cy="16" r="7" fill="none" stroke="var(--color-accent)" strokeWidth={strokeWidth}/>
      <circle cx="16" cy="16" r="1.8" fill="currentColor"/>
    </svg>
  )
}

export function LogoWordmark({
  className = '', size = 28, textClass = 'text-lg',
}: {
  className?: string
  size?: number
  textClass?: string
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 font-semibold tracking-tight ${className}`}>
      <LogoMark size={size} />
      <span className={textClass}>
        Deepling
      </span>
    </span>
  )
}

// Großes Watermark-Logo für Hero-Background o.ä. (sehr dezent)
export function LogoWatermark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="12" cy="16" r="7" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.4"/>
      <circle cx="20" cy="16" r="7" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.4"/>
    </svg>
  )
}
